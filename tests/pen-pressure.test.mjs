import test from 'node:test';
import assert from 'node:assert/strict';
import {penSettings,pressureWidth,pressureGeometry,pressureSVG} from '../src/pen-pressure.mjs';
test('pressure responds monotonically, sensitivity changes response, fixed mode uses selected width',()=>{
  const s={width:10,minimum:.1,sensitivity:1};assert.equal(pressureWidth(0,s),1);assert.equal(pressureWidth(1,s),10);assert.ok(pressureWidth(.7,s)>pressureWidth(.2,s));assert.ok(pressureWidth(.2,{...s,sensitivity:2})>pressureWidth(.2,s));assert.equal(pressureWidth(.1,{...s,enabled:false}),10);
});
test('geometry preserves earlier outline at strong turns when later pressure changes',()=>{
  const a=pressureGeometry([[0,0],[20,0],[20,20]],[.2,.3,.4],{width:8});const b=pressureGeometry([[0,0],[20,0],[20,20],[40,20]],[.2,.3,.4,1],{width:8});assert.ok(b.path.startsWith(a.path));assert.ok(a.path.includes('L'));assert.ok(!a.path.includes('Q')&&!a.path.includes('C'));assert.ok(a.x<0&&a.y<0&&a.width>20&&a.height>20);
});
test('single-contact dots have valid bounds and SVG rejects external colors',()=>{
  const g=pressureGeometry([[0,0]],[.5],{width:4});assert.ok(g.path&&g.width>1&&g.height>1);const svg=pressureSVG(g,'url(https://evil)',50);assert.ok(!svg.includes('https://evil'));assert.ok(svg.includes('opacity="0.5"'));assert.deepEqual(penSettings({width:999,minimum:-1,sensitivity:99}),{enabled:true,width:24,minimum:.05,sensitivity:3});
});
