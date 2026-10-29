import test from 'node:test';
import assert from 'node:assert/strict';
import entry from '../deploy/pages/worker.mjs';
test('Pages API binding preserves authentication, body, quota failures and destination origin',async()=>{
  const request=new Request('https://never-map-0411yiang0411.pages.dev/api/canvases/main/scene',{method:'PUT',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:'{"revision":4}'});
  const result=await entry.fetch(request,{NEVER_MAP:{fetch:async forwarded=>{assert.equal(forwarded,request);assert.equal(forwarded.headers.get('Authorization'),'Bearer fixture');assert.equal(await forwarded.text(),'{"revision":4}');return new Response('quota stop',{status:429});}}});
  assert.equal(result.status,429);assert.equal(await result.text(),'quota stop');
});
test('Pages static assets do not invoke the API and missing service fails closed',async()=>{
  const response=await entry.fetch(new Request('https://never-map-0411yiang0411.pages.dev/assets/app.js'),{ASSETS:{fetch:async()=>new Response('static')}});assert.equal(await response.text(),'static');
  assert.equal((await entry.fetch(new Request('https://never-map-0411yiang0411.pages.dev/api/status'),{})).status,503);
});
