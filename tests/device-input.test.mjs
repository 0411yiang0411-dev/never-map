import test from 'node:test';
import assert from 'node:assert/strict';
import {touchView,appendPenSamples,createTouchGesture,updateTouchGesture,useRawPen} from '../src/device-input.mjs';
const view={scrollX:10,scrollY:20,zoom:2,offsetLeft:20,offsetTop:40};
test('one finger pans without changing zoom; pinch stays anchored with simultaneous translation',()=>{
  assert.deepEqual(touchView([{x:100,y:100}],[{x:120,y:130}],view),{scrollX:20,scrollY:35,zoom:2});
  const next=touchView([{x:100,y:100},{x:200,y:100}],[{x:70,y:120},{x:270,y:120}],view);
  assert.equal(next.zoom,4);const before=(150-view.offsetLeft)/view.zoom-view.scrollX,after=(170-view.offsetLeft)/next.zoom-next.scrollX;assert.equal(before,after);
});
test('two-finger sliding preserves zoom; small distance jitter stays pan until an intentional pinch',()=>{
  const gesture=createTouchGesture([{x:100,y:100},{x:200,y:100}],view);
  const pan=updateTouchGesture(gesture,[{x:150,y:130},{x:250,y:130}]);assert.equal(pan.zoom,2);assert.equal(pan.scrollX,35);assert.equal(pan.scrollY,35);
  assert.equal(updateTouchGesture(gesture,[{x:150,y:130},{x:252,y:130}]).zoom,2);
  assert.equal(updateTouchGesture(gesture,[{x:150,y:130},{x:300,y:130}]).zoom,3);
});
test('pen custom sampling is active only for the pen tool, not selection, arrows, or eraser',()=>{
  assert.equal(useRawPen('freedraw',0),true);for(const tool of ['selection','arrow','eraser','hand','rectangle'])assert.equal(useRawPen(tool,0),false);assert.equal(useRawPen('freedraw',5),false);
});
test('sharp-corner samples are append-only and duplicate raw/move histories never backtrack',()=>{
  const stroke={x:30,y:10,points:[],pressures:[]};const samples=[{clientX:100,clientY:100,pressure:.2,timeStamp:1},{clientX:120,clientY:100,pressure:.2,timeStamp:2},{clientX:120,clientY:120,pressure:.2,timeStamp:3}];
  appendPenSamples(stroke,samples,view);const prefix=structuredClone(stroke.points);
  appendPenSamples(stroke,[samples[1],samples[2],{clientX:140,clientY:120,pressure:.9,timeStamp:4}],view);
  assert.deepEqual(stroke.points.slice(0,3),prefix);assert.deepEqual(stroke.points,[[0,0],[10,0],[10,10],[20,10]]);
});
test('pen keeps down point, every coalesced sample and actual up endpoint without zero pressure tail',()=>{
  const stroke={x:30,y:10,points:[],pressures:[]};
  appendPenSamples(stroke,[{clientX:100,clientY:100,pressure:.2},{clientX:102,clientY:102,pressure:.3},{clientX:104,clientY:104,pressure:.4}],view);
  appendPenSamples(stroke,[{clientX:110,clientY:110,pressure:0}],view,true);
  assert.deepEqual(stroke.points,[[0,0],[1,1],[2,2],[5,5]]);assert.deepEqual(stroke.pressures,[.2,.3,.4,.4]);
});
test('stationary pressure changes do not revise a previously drawn sample',()=>{
  const stroke={x:30,y:10,points:[],pressures:[]};appendPenSamples(stroke,[{clientX:100,clientY:100,pressure:.2}],view);appendPenSamples(stroke,[{clientX:100,clientY:100,pressure:1}],view);assert.deepEqual(stroke.pressures,[.2]);assert.equal(stroke.points.length,1);
});
