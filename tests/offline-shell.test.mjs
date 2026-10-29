import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const template=await readFile(new URL('../scripts/offline-shell-worker.js',import.meta.url),'utf8');
function setup(){
  const handlers={},writes=[],cached={text:async()=>'<cached editor>'};
  const cache={match:async key=>typeof key==='string'&&key==='/index.html'?cached:undefined,put:async(...value)=>writes.push(value),addAll:async()=>{}};
  const context={URL,Request,self:{location:{origin:'https://never-map.test'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>cache,match:async()=>undefined},fetch:async()=>({ok:true,type:'basic',clone(){return this;}})};
  vm.runInNewContext(template.replace('__CACHE_VERSION__','test').replace('__CORE_ASSETS__','["/index.html"]').replace('__ENTRY_SCRIPT__','"/assets/main.js"'),context);
  return {handlers,writes,cached};
}
test('static shell never intercepts authenticated APIs, images, mutations or other origins',()=>{
  const {handlers}=setup();
  for(const [method,url] of [['GET','https://never-map.test/api/files/hash'],['GET','https://never-map.test/api/canvases/main/scene'],['PUT','https://never-map.test/assets/example'],['GET','https://outside.test/assets/test.js']]){
    let intercepted=false;handlers.fetch({request:{method,url,mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
  }
});
test('cached editor opens immediately while private canvas data remains outside the shell cache',async()=>{
  const {handlers,cached,writes}=setup();let response;
  handlers.fetch({request:{method:'GET',url:'https://never-map.test/?app=android',mode:'navigate'},respondWith:value=>response=value});
  assert.equal(await response,cached);assert.equal(writes.length,0);
});
