import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../.tmp/worker-build/index.js';

let sql, env, writes, reads;
const token = 'test-only-access';
function prepared(query) {
  let params = [];
  return {
    bind(...args) { params = args; return this; },
    async first() { return sql.prepare(query).get(...params) || null; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...params).changes) } }; }
  };
}
beforeEach(() => {
  sql = new DatabaseSync(':memory:'); sql.exec(readFileSync('migrations/0001.sql', 'utf8'));
  sql.exec(readFileSync('migrations/0002.sql', 'utf8'));
  sql.prepare('INSERT INTO quota VALUES(1,?,0,0,0,1,?)').run(new Date().toISOString().slice(0, 7), Math.floor(Date.now()/1000) + 7200);
  writes = 0; reads = 0;
  env = { CLOUD_ENABLED: 'true', ACCESS_TOKEN: token, DB: { prepare: prepared },
    ASSETS: { fetch: async () => new Response('editor') },
    IMAGES: { put: async () => { writes++; }, get: async () => { reads++; return null; } } };
});
async function call(path, method = 'GET', body, headers = {}) {
  return worker.fetch(new Request(`https://example.test/api/${path}`, { method,
    headers: { Authorization: `Bearer ${token}`, ...headers }, body }), env);
}
const sceneBody = revision => JSON.stringify({ revision, scene: { elements: [], files: {}, appState: {} } });
test('cloud saving is disabled without explicit configuration and authentication', async () => {
  env.CLOUD_ENABLED = 'false'; assert.equal((await call('scene')).status, 503);
  env.CLOUD_ENABLED = 'true'; assert.equal((await call('scene', 'GET', undefined, { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal(writes + reads, 0);
});
test('scene revisions reject stale devices and never overwrite on conflict', async () => {
  const put = revision => call('scene', 'PUT', sceneBody(revision), { 'Content-Type': 'application/json' });
  assert.equal((await put(0)).status, 200);
  assert.equal((await put(0)).status, 409);
  assert.equal((await put(1)).status, 200);
  assert.equal((await put(1)).status, 409);
  const result = await (await call('scene')).json(); assert.equal(result.revision, 2);
});
test('concurrent uploads cannot spend the same remaining A operation', async () => {
  sql.exec('UPDATE quota SET class_a=989998');
  const res = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
    const data = new TextEncoder().encode(`test image bytes ${index}`);
    const id = Buffer.from(await crypto.subtle.digest('SHA-256', data)).toString('hex');
    return call(`files/${id}`, 'PUT', data, { 'Content-Type': 'image/png' });
  }));
  assert.equal(writes, 1); assert.equal(res.filter(r => r.status === 200).length, 1);
  assert.equal(sql.prepare('SELECT class_a FROM quota').get().class_a, 989999);
});
test('missing reads and failed writes remain counted conservatively', async () => {
  const id = 'a'.repeat(64);
  assert.equal((await call(`files/${id}`)).status, 404);
  assert.equal(reads, 1); assert.equal(sql.prepare('SELECT class_b FROM quota').get().class_b, 1);
  env.IMAGES.put = async () => { writes++; throw new Error('network error'); };
  const data = new TextEncoder().encode('fail');
  const key = Buffer.from(await crypto.subtle.digest('SHA-256', data)).toString('hex');
  assert.equal((await call(`files/${key}`, 'PUT', data, { 'Content-Type': 'image/png' })).status, 503);
  assert.equal((await call(`files/${key}`, 'PUT', data, { 'Content-Type': 'image/png' })).status, 409);
  assert.equal(writes, 1); assert.equal(sql.prepare('SELECT class_a FROM quota').get().class_a, 1);
});
test('any exhausted dimension or unknown month pauses ALL cloud data operations', async () => {
  for (const dimension of ['class_a=990000', 'class_b=9900000', 'bytes=9900000000', "month='2000-01'"]) {
    sql.exec(`UPDATE quota SET class_a=0,class_b=0,bytes=0,month='${new Date().toISOString().slice(0, 7)}'`);
    sql.exec(`UPDATE quota SET ${dimension}`);
    assert.equal((await call('scene')).status, 429);
    assert.equal((await call(`files/${'a'.repeat(64)}`)).status, 429);
    assert.equal((await call('scene', 'PUT', sceneBody(0), { 'Content-Type': 'application/json' })).status, 429);
  }
  assert.equal(writes + reads, 0);
});
test('content hashes, upload limits, immutable reuse prevent excess R2 operations', async () => {
  assert.equal((await call(`files/${'a'.repeat(64)}`, 'PUT', 'wrong', { 'Content-Type': 'image/png' })).status, 400);
  assert.equal((await call(`files/${'a'.repeat(64)}`, 'PUT', new Uint8Array(2_000_001), { 'Content-Type': 'image/png' })).status, 413);
  assert.equal(writes, 0);
});
test('expired account verification blocks data operations', async () => {
  sql.exec('UPDATE quota SET verified_until=0');
  assert.equal((await call('scene')).status, 429);
  assert.equal(reads + writes, 0);
});
test('scheduled verification preserves conservative usage across month rollover', async () => {
  const original = globalThis.fetch;
  env.MONITOR_TOKEN_CF = 'test-only-monitor';
  sql.exec("UPDATE quota SET month='2000-01',class_a=5000,class_b=6000,bytes=7000,verified=0");
  globalThis.fetch = async url => {
    if (url.endsWith('/r2/buckets')) return Response.json({ success: true, result: { buckets: [{ name: 'never-map-images' }] } });
    if (url.endsWith('/subscriptions')) return Response.json({ success: true, result: [] });
    if (url.endsWith('/r2/metrics')) return Response.json({ success: true, result: { standard: { uploaded: { payloadSize: 100, metadataSize: 0 } } } });
    return Response.json({ data: { viewer: { accounts: [{ r2OperationsAdaptiveGroups: [{ sum: { requests: 20 } }] }] } }, errors: null });
  };
  let pending;
  try {
    await worker.scheduled({}, env, { waitUntil: p => { pending = p; } }); await pending;
    const row = sql.prepare('SELECT * FROM quota').get();
    assert.equal(row.verified, 1); assert.equal(row.month, new Date().toISOString().slice(0, 7));
    assert.equal(row.class_a, 5010); assert.equal(row.class_b, 6010); assert.equal(row.bytes, 7000);
  } finally { globalThis.fetch = original; }
});
test('failed scheduled verification stops cloud access rather than guessing usage', async () => {
  const original = globalThis.fetch; env.MONITOR_TOKEN_CF = 'test-only-monitor';
  sql.exec('UPDATE quota SET verified_until=0');
  globalThis.fetch = async () => Response.json({ success: false }, { status: 403 });
  let pending;
  try {
    await worker.scheduled({}, env, { waitUntil: p => { pending = p; } }); await pending;
    assert.equal(sql.prepare('SELECT verified FROM quota').get().verified, 0);
    assert.equal((await call('scene')).status, 429);
  } finally { globalThis.fetch = original; }
});
