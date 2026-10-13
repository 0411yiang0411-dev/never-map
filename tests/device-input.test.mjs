import test from 'node:test';
import assert from 'node:assert/strict';
import {touchView,appendPenSamples} from '../src/device-input.mjs';
const view={scrollX:10,scrollY:20,zoom:2,offsetLeft:20,offsetTop:40};
test('one finger pans without changing zoom; pinch stays anchored with simultaneous translation',()=>{
  assert.deepEqual(touchView([{x:100,y:100}],[{x:120,y:130}],view),{scrollX:20,scrollY:35,zoom:2});
  const next=touchView([{x:100,y:100},{x:200,y:100}],[{x:70,y:120},{x:270,y:120}],view);
  assert.equal(next.zoom,4);const before=(150-view.offsetLeft)/view.zoom-view.scrollX,after=(170-view.offsetLeft)/next.zoom-next.scrollX;assert.equal(before,after);
});
test('pen keeps down point, every coalesced sample and actual up endpoint without zero pressure tail',()=>{
  const stroke={x:30,y:10,points:[],pressures:[]};
  appendPenSamples(stroke,[{clientX:100,clientY:100,pressure:.2},{clientX:102,clientY:102,pressure:.3},{clientX:104,clientY:104,pressure:.4}],view);
  appendPenSamples(stroke,[{clientX:110,clientY:110,pressure:0}],view,true);
  assert.deepEqual(stroke.points,[[0,0],[1,1],[2,2],[5,5]]);assert.deepEqual(stroke.pressures,[.2,.3,.4,.4]);
});
