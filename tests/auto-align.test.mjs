import test from 'node:test';
import assert from 'node:assert/strict';
import {linearWorldPoints,moveLinearEndpoint,snapEndpoint} from '../src/auto-align.mjs';
test('endpoint snaps independently to horizontal and vertical references within 8 screen pixels',()=>{
  const snap=snapEndpoint([102,198],[[100,50],[500,200]],1);
  assert.deepEqual(snap.point,[100,200]);assert.equal(snap.guides.length,2);
  assert.deepEqual(snapEndpoint([102,198],[[100,50],[500,200]],8).point,[102,198]);
  assert.equal(snapEndpoint([100,200],[[100,50],[500,200]],1).changed,false);
});
test('moving either endpoint preserves all other world points at any rotation',()=>{
  for(const angle of [0,Math.PI/2,.37,-.82])for(const index of [0,2]){
    const element={x:75,y:38,angle,points:[[0,0],[80,-30],[200,100]],width:200,height:130};
    const before=linearWorldPoints(element),desired=[120,170];
    const patch=moveLinearEndpoint(element,index,desired),after=linearWorldPoints({...element,...patch});
    assert.deepEqual(patch.points[0],[0,0]);
    after.forEach((point,i)=>{const expected=i===index?desired:before[i];assert.ok(Math.abs(point[0]-expected[0])<1e-8);assert.ok(Math.abs(point[1]-expected[1])<1e-8);});
  }
});
