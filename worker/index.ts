import { LIMITS, STOP_RATIO, quotaState } from './quota.mjs';

interface Env { ASSETS: Fetcher; DB?: D1Database; IMAGES?: R2Bucket; ACCESS_TOKEN?: string; CLOUD_ENABLED: string }
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const month = () => new Date().toISOString().slice(0, 7);
const MAX_IMAGE = 2_000_000;
const MAX_SCENE = 1_000_000;

async function authenticated(request: Request, env: Env) {
  if (!env.ACCESS_TOKEN) return false;
  const presented = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([hash(presented), hash(env.ACCESS_TOKEN)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function usage(env: Env) {
  return env.DB!.prepare('SELECT * FROM quota WHERE id=1').first();
}

// Atomic reservations happen BEFORE R2 calls, including failed calls. Concurrent
// uploads cannot each spend the same last available operation or storage bytes.
async function reserve(env: Env, a: number, b: number, bytes: number) {
  const result = await env.DB!.prepare(`UPDATE quota SET class_a=class_a+?, class_b=class_b+?, bytes=bytes+?
    WHERE id=1 AND verified=1 AND month=?
    AND class_a+? < ? AND class_b+? < ? AND bytes+? < ? RETURNING *`)
    .bind(a, b, bytes, month(), a, Math.floor(LIMITS.class_a * STOP_RATIO), b,
      Math.floor(LIMITS.class_b * STOP_RATIO), bytes, Math.floor(LIMITS.bytes * STOP_RATIO)).first();
  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/config') return reply({ cloudEnabled: env.CLOUD_ENABLED === 'true' && !!env.DB && !!env.IMAGES && !!env.ACCESS_TOKEN });
    if (!(await authenticated(request, env))) return reply({ error: '请输入个人访问密钥' }, 401);
    if (env.CLOUD_ENABLED !== 'true' || !env.DB || !env.IMAGES) return reply({ error: '云端保存尚未启用；本地编辑和导出仍可使用' }, 503);
    try {
      const current = await usage(env);
      const state = quotaState(current);
      if (url.pathname === '/api/usage' && request.method === 'GET') return reply({ ...state, usage: current, limits: LIMITS, scope: '项目保守计数＋已核实账号基线；不包含后续外部调用' });
      if (state.paused) return reply({ error: state.reason, quota: state }, 429);
      if (url.pathname === '/api/scene') {
        if (request.method === 'GET') {
          const row = await env.DB.prepare('SELECT revision,body,updated_at FROM scene WHERE id=1').first<{ revision: number; body: string; updated_at: string }>();
          return reply(row ? { revision: row.revision, scene: JSON.parse(row.body), updatedAt: row.updated_at } : { revision: 0, scene: null });
        }
        if (request.method === 'PUT') {
          if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({ error: '需要 JSON' }, 415);
          const raw = await request.text();
          if (new TextEncoder().encode(raw).byteLength > MAX_SCENE) return reply({ error: '画布结构超过 1MB，请拆分或导出本地文件' }, 413);
          const input = JSON.parse(raw);
          if (!Number.isSafeInteger(input.revision) || input.revision < 0 || !Array.isArray(input.scene?.elements) || typeof input.scene?.files !== 'object') return reply({ error: '画布格式无效' }, 400);
          const body = JSON.stringify(input.scene);
          const updated = await env.DB.prepare(`INSERT INTO scene(id,revision,body,updated_at)
            SELECT 1,1,?,? WHERE ?=0
            ON CONFLICT(id) DO UPDATE SET revision=scene.revision+1,body=excluded.body,updated_at=excluded.updated_at
            WHERE scene.revision=? RETURNING revision`)
            .bind(body, new Date().toISOString(), input.revision, input.revision).first<{ revision: number }>();
          // Existing documents with revision >0 need an UPDATE rather than empty INSERT SELECT.
          if (!updated && input.revision > 0) {
            const existing = await env.DB.prepare('UPDATE scene SET revision=revision+1,body=?,updated_at=? WHERE id=1 AND revision=? RETURNING revision')
              .bind(body, new Date().toISOString(), input.revision).first<{ revision: number }>();
            return existing ? reply(existing) : reply({ error: '另一设备已更新画布，请先导出当前画布，再读取云端版本' }, 409);
          }
          return updated ? reply(updated) : reply({ error: '云端画布已变化，请重新读取' }, 409);
        }
      }
      const match = url.pathname.match(/^\/api\/files\/([a-f0-9]{64})$/);
      if (match) {
        const id = match[1];
        if (request.method === 'PUT') {
          const contentType = request.headers.get('Content-Type') || '';
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(contentType)) return reply({ error: '不支持的图片格式' }, 415);
          const buffer = await request.arrayBuffer();
          if (buffer.byteLength > MAX_IMAGE) return reply({ error: '单张图片不得超过 2MB，请压缩后重试' }, 413);
          const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
          if (digest !== id) return reply({ error: '图片校验失败' }, 400);
          const old = await env.DB.prepare('SELECT state FROM assets WHERE id=?').bind(id).first<{ state: string }>();
          if (old?.state === 'ready') return reply({ id, reused: true });
          if (old) return reply({ error: '图片上传未完成，需要管理员检查；不会自动反复重试' }, 409);
          // Reserve before acquiring the immutable asset record. A lost race is
          // deliberately overcounted, never refunded optimistically.
          if (!(await reserve(env, 1, 0, buffer.byteLength + 4096))) return reply({ error: '本次上传会超过安全额度，已拒绝' }, 429);
          const inserted = await env.DB.prepare("INSERT OR IGNORE INTO assets(id,bytes,content_type,state) VALUES(?,?,?,'reserved')")
            .bind(id, buffer.byteLength, contentType).run();
          if (!inserted.meta.changes) return reply({ error: '同一图片正在上传，请稍后手动重试' }, 409);
          await env.IMAGES.put(id, buffer, { httpMetadata: { contentType }, storageClass: 'Standard' });
          await env.DB.prepare("UPDATE assets SET state='ready' WHERE id=?").bind(id).run();
          return reply({ id });
        }
        if (request.method === 'GET') {
          if (!(await reserve(env, 0, 1, 0))) return reply({ error: '读取额度达到安全停止线' }, 429);
          const object = await env.IMAGES.get(id);
          if (!object) return reply({ error: '图片不存在' }, 404);
          return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private,max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
        }
      }
      return reply({ error: '接口不存在' }, 404);
    } catch {
      return reply({ error: '云端操作失败，已停止自动重试；当前画布保留在本地' }, 503);
    }
  }
};
