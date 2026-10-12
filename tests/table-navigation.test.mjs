import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelPixels,edgeVelocity,tableCellAt} from '../src/table-navigation.mjs';
test('wheel normalizes line/page scrolling and shift horizontal panning',()=>{
  assert.deepEqual(wheelPixels({deltaX:0,deltaY:3,deltaMode:1,shiftKey:false},600),{x:0,y:48});
  assert.deepEqual(wheelPixels({deltaX:0,deltaY:1,deltaMode:2,shiftKey:true},600),{x:600,y:0});
});
test('edge scrolling is idle inside viewport and bounded outside in both directions',()=>{
  const view={left:200,right:1000,top:60,bottom:700};
  assert.deepEqual(edgeVelocity({x:500,y:350},view),{x:0,y:0});
  assert.deepEqual(edgeVelocity({x:1100,y:800},view),{x:720,y:720});
  assert.deepEqual(edgeVelocity({x:100,y:0},view),{x:-720,y:-720});
  assert.equal(edgeVelocity({x:500,y:676},view).y,360);
});
test('selection hit testing follows scroll position, zoom and merged geometry',()=>{
  const layout={width:200,height:200,cells:[{r:0,c:0,x:0,y:0,width:200,height:100},{r:1,c:0,x:0,y:100,width:100,height:100},{r:1,c:1,x:100,y:100,width:100,height:100}]};
  const position={left:20,top:-60,sx:2,sy:2,angle:0};
  assert.equal(tableCellAt({x:230,y:190},position,layout).c,1);
  assert.equal(tableCellAt({x:230,y:0},position,layout).r,0);
  assert.equal(tableCellAt({x:500,y:500},position,layout).r,1);
  assert.equal(tableCellAt({x:-100,y:-100},position,layout).r,0);
  assert.equal(tableCellAt({x:-230,y:170},{...position,angle:Math.PI/2},layout).c,1);
});
