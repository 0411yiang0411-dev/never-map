import test from 'node:test';
import assert from 'node:assert/strict';
import {insidePolygon,enclosedBounds,snapBounds} from '../src/selection-geometry.mjs';
test('lasso selects only fully enclosed bounds, including concave paths',()=>{
  const polygon=[[0,0],[100,0],[100,100],[50,50],[0,100]];
  assert.equal(insidePolygon([20,20],polygon),true);
  assert.equal(enclosedBounds([10,10,30,30],polygon),true);
  assert.equal(enclosedBounds([90,90,110,110],polygon),false);
  assert.equal(insidePolygon([50,90],polygon),false);
});
test('selected bounds snap independently to nearby edges with screen-space tolerance',()=>{
  const snap=snapBounds([102,203,142,243],[[100,200,180,280]],1);
  assert.equal(snap.dx,-2);assert.equal(snap.dy,-3);assert.equal(snap.guides.length,2);
  const far=snapBounds([310,400,350,440],[[100,200,180,280]],1);
  assert.equal(far.dx,0);assert.equal(far.dy,0);
  assert.equal(snapBounds([104,204,144,244],[[100,200,180,280]],3).guides.length,0);
});
