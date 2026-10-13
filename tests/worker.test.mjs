import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../.tmp/worker-build/index.js';
import {pressureGeometry,pressureSVG} from '../src/pen-pressure.mjs';

let sql, env, writes, reads;
const token = 'test-only-access';
function prepared(query) {
  let params = [];
  return {
    bind(...args) { params = args; return this; },
    async first() { return sql.prepare(query).get(...params) || null; },
    async all() { return { results: sql.prepare(query).all(...params) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...params).changes) } }; }
  };
}
beforeEach(() => {
  sql = new DatabaseSync(':memory:'); sql.exec(readFileSync('migrations/0001.sql', 'utf8'));
  sql.exec(readFileSync('migrations/0002.sql', 'utf8'));
  sql.exec(readFileSync('migrations/0003.sql', 'utf8'));
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
test('formatted note metadata survives save and reload for shared editing',async()=>{
  env.SHARE_TOKEN='test-only-shared-notes';
  const note={type:'image',id:'note',fileId:'note-svg',customData:{richNote:{formatVersion:1,width:440,fontSize:22,blocks:[{type:'todo',checked:true,runs:[{text:'待办',bold:true,underline:true,highlight:true}]},{type:'rule'},{type:'number',runs:[{text:'编号'}]}]}}};
  const scene={elements:[note],appState:{},files:{}};
  const body=JSON.stringify({revision:0,scene});
  assert.equal((await call('scene','PUT',body,{'Content-Type':'application/json'})).status,200);
  const data=await (await call('scene','GET',undefined,{Authorization:'Bearer test-only-shared-notes'})).json();
  assert.deepEqual(data.scene,scene);
});
test('editable table cells and styles survive cloud save for another device',async()=>{
  env.SHARE_TOKEN='test-only-table-share';
  const scene={elements:[{id:'table',type:'image',fileId:'svg-table',customData:{richTable:{version:2,cells:[['名称','数量'],['纸张','20']],header:true,columnWidth:140,columnWidths:[100,200],rowHeights:[72,80],merges:[{r:0,c:0,rows:1,columns:2}],fontSize:16,styles:{'1:1':{bold:true}}}}}],files:{},appState:{}};
  assert.equal((await call('scene','PUT',JSON.stringify({revision:0,scene}),{'Content-Type':'application/json'})).status,200);
  const loaded=await(await call('scene','GET',undefined,{Authorization:'Bearer test-only-table-share'})).json();
  assert.deepEqual(loaded.scene,scene);
});
test('persistent sharing authorizes the same canvas without exposing its password', async () => {
  env.SHARE_TOKEN = 'test-only-share-token';
  const share = await (await call('share')).json();
  assert.ok(share.url.endsWith('#share=test-only-share-token'));
  assert.ok(!JSON.stringify(share).includes(token));
  const headers = { Authorization: 'Bearer test-only-share-token', 'Content-Type': 'application/json' };
  assert.equal((await call('scene', 'PUT', sceneBody(0), headers)).status, 200);
  assert.equal((await call('scene')).status, 200);
  env.ACCESS_TOKEN = 'changed-test-only-password';
  assert.equal((await call('scene')).status, 401);
  assert.equal((await call('scene', 'GET', undefined, headers)).status, 200);
});
test('pressure stroke exact SVG bytes and settings survive storage and shared reload',async()=>{
  env.SHARE_TOKEN='test-only-pressure-share';const settings={enabled:true,width:6,sensitivity:1.2,minimum:.15},points=[[0,0],[20,0],[20,20]],pressures=[.2,.5,.9];
  const data=new TextEncoder().encode(pressureSVG(pressureGeometry(points,pressures,settings),'#123456')),key=Buffer.from(await crypto.subtle.digest('SHA-256',data)).toString('hex');let stored;
  env.IMAGES.put=async(_key,bytes)=>{stored=bytes;};env.IMAGES.get=async()=>({body:stored,writeHttpMetadata:headers=>headers.set('Content-Type','image/svg+xml')});
  assert.equal((await call(`files/${key}`,'PUT',data,{'Content-Type':'image/svg+xml'})).status,200);
  const scene={elements:[{id:'pressure',type:'image',fileId:'pressure-file',customData:{pressurePenV1:{settings,points,pressures}}}],files:{'pressure-file':{key,mimeType:'image/svg+xml'}},appState:{}};
  assert.equal((await call('scene','PUT',JSON.stringify({revision:0,scene}),{'Content-Type':'application/json'})).status,200);
  const loaded=await(await call('scene','GET',undefined,{Authorization:'Bearer test-only-pressure-share'})).json();assert.deepEqual(loaded.scene,scene);
  assert.deepEqual(new Uint8Array(await(await call(`files/${key}`)).arrayBuffer()),data);
  const native={elements:[{id:'native-pen',type:'freedraw',points,pressures,strokeWidth:6,customData:{neverMapPen:true,pressurePenV2:{settings}}}],files:{},appState:{}};
  assert.equal((await call('scene','PUT',JSON.stringify({revision:1,scene:native}),{'Content-Type':'application/json'})).status,200);
  assert.deepEqual((await(await call('scene','GET',undefined,{Authorization:'Bearer test-only-pressure-share'})).json()).scene,native);
});
test('sharing preserves quota stops and rejects unrecognized links', async () => {
  env.SHARE_TOKEN = 'test-only-share-token';
  assert.equal((await call('scene', 'GET', undefined, { Authorization: 'Bearer other-share-token' })).status, 401);
  sql.exec('UPDATE quota SET bytes=9900000000');
  assert.equal((await call('scene', 'GET', undefined, { Authorization: 'Bearer test-only-share-token' })).status, 429);
  assert.equal((await call('share')).status, 429);
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
test('canvas migration preserves the authoritative legacy scene and old shared link',async()=>{
  const original={elements:[{id:'legacy',type:'text',text:'original'}],files:{},appState:{}};
  await call('scene','PUT',JSON.stringify({revision:0,scene:original}),{'Content-Type':'application/json'});
  sql.exec(readFileSync('migrations/0003.sql','utf8'));
  assert.deepEqual((await(await call('canvases/main/scene')).json()).scene,original);
  assert.equal((await(await call('canvases')).json()).canvases[0].id,'main');
});
test('create and rename canvases keep contents independent and ids stable',async()=>{
  const created=await call('canvases','POST',JSON.stringify({name:'first'}),{'Content-Type':'application/json'});
  assert.equal(created.status,201);const a=await created.json();
  const b=await(await call('canvases','POST',JSON.stringify({name:'second'}),{'Content-Type':'application/json'})).json();
  const scene={elements:[{id:'one',version:1}],files:{},appState:{}};
  assert.equal((await call(`canvases/${a.id}/scene`,'PUT',JSON.stringify({revision:0,scene}),{'Content-Type':'application/json'})).status,200);
  assert.equal((await(await call(`canvases/${b.id}/scene`)).json()).scene,null);
  const renamed=await(await call(`canvases/${a.id}`,'PATCH',JSON.stringify({name:'renamed'}),{'Content-Type':'application/json'})).json();
  assert.equal(renamed.id,a.id);assert.equal(renamed.name,'renamed');
  assert.deepEqual((await(await call(`canvases/${a.id}/scene`)).json()).scene,scene);
});
test('other devices receive changes and deletions; stale devices cannot overwrite',async()=>{
  const created=await(await call('canvases','POST',JSON.stringify({name:'sync'}),{'Content-Type':'application/json'})).json();
  const path=`canvases/${created.id}/scene`;
  const put=(revision,elements)=>call(path,'PUT',JSON.stringify({revision,scene:{elements,files:{},appState:{}}}),{'Content-Type':'application/json'});
  assert.equal((await put(0,[{id:'a',version:1}])).status,200);
  const second=await(await call(path)).json();assert.equal(second.revision,1);
  assert.equal((await call(path+'?after=1')).status,204);
  assert.equal((await put(1,[])).status,200);
  const deleted=await(await call(path+'?after=1')).json();assert.deepEqual(deleted.scene.elements,[]);
  assert.equal((await put(second.revision,[{id:'stale'}])).status,409);
  assert.deepEqual((await(await call(path)).json()).scene.elements,[]);
});
test('canvas share links target the correct canvas and respect quota stops',async()=>{
  env.SHARE_TOKEN='test-only-share-canvas';
  const a=await(await call('canvases','POST',JSON.stringify({name:'shared'}),{'Content-Type':'application/json'})).json();
  const link=await(await call(`share?canvas=${a.id}`)).json();assert.ok(link.url.endsWith('&canvas='+a.id));
  assert.equal((await call(`canvases/${a.id}/scene`,'GET',undefined,{Authorization:'Bearer test-only-share-canvas'})).status,200);
  sql.exec('UPDATE quota SET class_a=990000');
  assert.equal((await call('canvases')).status,429);
  assert.equal((await call(`canvases/${a.id}/scene`)).status,429);
  assert.equal((await call(`canvases/${a.id}`,'PATCH',JSON.stringify({name:'no'}))).status,429);
});
test('invalid names and nonexistent canvases fail without creating scenes',async()=>{
  assert.equal((await call('canvases','POST',JSON.stringify({name:'   '}))).status,400);
  assert.equal((await call('canvases/missing/scene')).status,404);
  assert.equal((await call('canvases/missing/scene','PUT',sceneBody(0),{'Content-Type':'application/json'})).status,404);
});
