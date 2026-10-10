import { LIMITS, STOP_RATIO, quotaState } from './quota.mjs';

interface Env { ASSETS: Fetcher; DB?: D1Database; IMAGES?: R2Bucket; ACCESS_TOKEN?: string; SHARE_TOKEN?: string; MONITOR_TOKEN_CF?: string; CLOUD_ENABLED: string }
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const month = () => new Date().toISOString().slice(0, 7);
const MAX_IMAGE = 2_000_000;
const MAX_SCENE = 1_000_000;

async function authenticated(request: Request, env: Env) {
  if (!env.ACCESS_TOKEN) return false;
  const presented = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const a = await hash(presented);
  for (const expected of [env.ACCESS_TOKEN, env.SHARE_TOKEN].filter(Boolean) as string[]) {
    const b = await hash(expected);
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    if (difference === 0) return true;
  }
  return false;
}

async function usage(env: Env) {
  return env.DB!.prepare('SELECT * FROM quota WHERE id=1').first();
}

// Atomic reservations happen BEFORE R2 calls, including failed calls. Concurrent
// uploads cannot each spend the same last available operation or storage bytes.
async function reserve(env: Env, a: number, b: number, bytes: number) {
  const result = await env.DB!.prepare(`UPDATE quota SET class_a=class_a+?, class_b=class_b+?, bytes=bytes+?
    WHERE id=1 AND verified=1 AND verified_until > unixepoch() AND month=?
    AND class_a+? < ? AND class_b+? < ? AND bytes+? < ? RETURNING *`)
    .bind(a, b, bytes, month(), a, Math.floor(LIMITS.class_a * STOP_RATIO), b,
      Math.floor(LIMITS.class_b * STOP_RATIO), bytes, Math.floor(LIMITS.bytes * STOP_RATIO)).first();
  return result;
}

async function reconcile(env: Env) {
  if (!env.DB) return;
  const base = 'https://api.cloudflare.com/client/v4';
  const account = '7aeeb4163af696238b62b47a92d59f55';
  try {
    if (!env.MONITOR_TOKEN_CF) throw new Error('monitor unavailable');
    const prior = await usage(env) as any;
    // Do not turn the manual reconciliation endpoint into an unmetered
    // ListBuckets loop. Fresh verification is reused for an hour.
    if (prior?.verified && prior.month === month() && prior.verified_until > Date.now() / 1000 + 3600) return;
    if (prior) {
      const reserved = await env.DB.prepare(`UPDATE quota SET class_a=class_a+10,class_b=class_b+10
        WHERE id=1 AND class_a+10 < ? AND class_b+10 < ? AND bytes < ? RETURNING id`)
        .bind(Math.floor(LIMITS.class_a * STOP_RATIO), Math.floor(LIMITS.class_b * STOP_RATIO), Math.floor(LIMITS.bytes * STOP_RATIO)).first();
      if (!reserved) return;
    }
    const api = async (path: string, body?: unknown) => {
      const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.MONITOR_TOKEN_CF}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json() as any;
      if (!res.ok || data.success === false || data.errors?.length) throw new Error('account verification failed');
      return data;
    };
    const buckets = await api(`/accounts/${account}/r2/buckets`);
    if (buckets.result.buckets.some((b: any) => b.name !== 'never-map-images')) throw new Error('other bucket detected');
    const subscriptions = await api(`/accounts/${account}/subscriptions`);
    if (subscriptions.result.some((s: any) => /workers/i.test(s.product?.name || s.rate_plan?.id || '') && Number(s.price) > 0)) throw new Error('paid workers plan');
    const metrics = await api(`/accounts/${account}/r2/metrics`);
    const start = new Date(Date.now() - 30 * 86400_000).toISOString();
    const end = new Date().toISOString();
    const operations = await api('/graphql', { query: `query { viewer { accounts(filter: {accountTag: "${account}"}) { r2OperationsAdaptiveGroups(limit: 10000, filter: {datetime_geq: "${start}", datetime_leq: "${end}"}) { sum { requests } dimensions { actionType } } } } }` });
    const groups = operations.data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups;
    if (!Array.isArray(groups) || groups.length >= 10000) throw new Error('incomplete metrics');
    // Count ALL reported operations in BOTH dimensions, conservatively. Never
    // reset operation totals at month rollover; do not rely on a billing-date guess.
    const operationsFloor = groups.reduce((sum: number, item: any) => sum + Number(item.sum.requests), 0) + 1000;
    let bytesFloor = 0;
    for (const category of Object.values(metrics.result) as any[]) {
      for (const value of Object.values(category) as any[]) {
        const size = Number(value.payloadSize || 0) + Number(value.metadataSize || 0);
        if (!Number.isFinite(size) || size < 0) throw new Error('invalid metrics');
        bytesFloor += size;
      }
    }
    if (!Number.isFinite(operationsFloor)) throw new Error('invalid operation count');
    const until = Math.floor(Date.now() / 1000) + 7200;
    await env.DB.prepare(`INSERT INTO quota(id,month,class_a,class_b,bytes,verified,verified_until) VALUES(1,?,?,?,?,1,?)
      ON CONFLICT(id) DO UPDATE SET month=excluded.month,class_a=MAX(quota.class_a,excluded.class_a),
      class_b=MAX(quota.class_b,excluded.class_b),bytes=MAX(quota.bytes,excluded.bytes),verified=1,verified_until=excluded.verified_until`)
      .bind(month(), operationsFloor, operationsFloor, bytesFloor, until).run();
  } catch {
    await env.DB.prepare('UPDATE quota SET verified=0 WHERE id=1').run();
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(reconcile(env)); },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/config') return reply({ cloudEnabled: env.CLOUD_ENABLED === 'true' && !!env.DB && !!env.IMAGES && !!env.ACCESS_TOKEN });
    if (url.pathname === '/api/status') {
      if (!env.DB || env.CLOUD_ENABLED !== 'true') return reply({ warning: false, paused: true, reason: '尚未启用' });
      return reply(quotaState(await usage(env)));
    }
    if (!(await authenticated(request, env))) return reply({ error: '请输入个人访问密钥' }, 401);
    if (url.pathname === '/api/reconcile' && request.method === 'POST') { await reconcile(env); return reply(quotaState(await usage(env))); }
    if (env.CLOUD_ENABLED !== 'true' || !env.DB || !env.IMAGES) return reply({ error: '云端保存尚未启用；本地编辑和导出仍可使用' }, 503);
    try {
      const current = await usage(env);
      const state = quotaState(current);
      if (url.pathname === '/api/usage' && request.method === 'GET') return reply({ ...state, usage: current, limits: LIMITS, scope: '项目保守计数＋已核实账号基线；不包含后续外部调用' });
      if (state.paused) return reply({ error: state.reason, quota: state }, 429);
      if (url.pathname === '/api/canvases') {
        if (request.method === 'GET') {
          const result = await env.DB.prepare(`SELECT c.id,c.name,CASE WHEN c.id='main' THEN COALESCE(s.revision,0) ELSE c.revision END revision,
            CASE WHEN c.id='main' THEN COALESCE(s.updated_at,c.updated_at) ELSE c.updated_at END updatedAt
            FROM canvases c LEFT JOIN scene s ON s.id=1 ORDER BY c.id='main' DESC,c.updated_at DESC`).all();
          return reply({ canvases: result.results });
        }
        if (request.method === 'POST') {
          const input = await request.json() as any;
          const name = typeof input.name === 'string' ? input.name.trim() : '';
          if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)) return reply({ error:'画布名称需为 1–80 个字符' },400);
          const row = await env.DB.prepare(`INSERT INTO canvases(id,name,updated_at) SELECT ?,?,?
            WHERE (SELECT COUNT(*) FROM canvases)<200 RETURNING id,name,revision,updated_at AS updatedAt`)
            .bind(crypto.randomUUID(),name,new Date().toISOString()).first();
          return row ? reply(row,201) : reply({ error:'已达到 200 个画布的保护上限' },429);
        }
      }
      const canvasRoute = url.pathname.match(/^\/api\/canvases\/([a-zA-Z0-9_-]{1,64})(\/scene)?$/);
      if (canvasRoute && !canvasRoute[2] && request.method==='PATCH') {
        const input = await request.json() as any;
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || name.length>80 || /[\u0000-\u001f]/.test(name)) return reply({ error:'画布名称需为 1–80 个字符' },400);
        const row = await env.DB.prepare('UPDATE canvases SET name=? WHERE id=? RETURNING id,name,revision,updated_at AS updatedAt').bind(name,canvasRoute[1]).first();
        return row ? reply(row) : reply({error:'画布不存在'},404);
      }
      if (url.pathname === '/api/share' && request.method === 'GET') {
        if (!env.SHARE_TOKEN) return reply({ error: '共享链接尚未配置' }, 503);
        const canvasId=url.searchParams.get('canvas') || 'main';
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(canvasId) || !(await env.DB.prepare('SELECT id FROM canvases WHERE id=?').bind(canvasId).first())) return reply({error:'画布不存在'},404);
        return reply({ url: `https://never-map.never-map-0411yiang0411.workers.dev/#share=${encodeURIComponent(env.SHARE_TOKEN)}${canvasId==='main'?'':`&canvas=${encodeURIComponent(canvasId)}`}` });
      }
      if (url.pathname === '/api/scene' || canvasRoute?.[2]) {
        const canvasId=canvasRoute?.[1] || 'main';
        if (request.method === 'GET') {
          if (canvasId!=='main') {
            const row=await env.DB.prepare('SELECT revision,body,updated_at FROM canvases WHERE id=?').bind(canvasId).first<{revision:number;body:string|null;updated_at:string}>();
            if (!row) return reply({error:'画布不存在'},404);
            if (url.searchParams.get('after')===String(row.revision)) return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
            return reply({revision:row.revision,scene:row.body?JSON.parse(row.body):null,updatedAt:row.updated_at});
          }
          const marker=await env.DB.prepare('SELECT revision FROM scene WHERE id=1').first<{revision:number}>();
          if (url.searchParams.get('after')===String(marker?.revision || 0)) return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
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
          if (canvasId!=='main') {
            const updated=await env.DB.prepare('UPDATE canvases SET revision=revision+1,body=?,updated_at=? WHERE id=? AND revision=? RETURNING revision')
              .bind(body,new Date().toISOString(),canvasId,input.revision).first();
            if (updated) return reply(updated);
            const exists=await env.DB.prepare('SELECT id FROM canvases WHERE id=?').bind(canvasId).first();
            return exists ? reply({error:'另一设备已更新此画布，本机未同步修改已保留，请先导出或读取云端'},409) : reply({error:'画布不存在'},404);
          }
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
