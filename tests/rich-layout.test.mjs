import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutNote,modelHTML} from '../src/rich-layout.mjs';
test('styles remain present through wrapped text and SVG contains no foreign HTML',()=>{
  const result=layoutNote([{type:'paragraph',runs:[{text:'abcdef'.repeat(10),bold:true,underline:true,highlight:true}]}],{width:180,measure:()=>15});
  assert.ok(result.height>60);
  assert.ok(result.svg.includes('font-weight="700"'));
  assert.ok(result.svg.includes('fill="#ffe58f"'));
  assert.ok(result.svg.includes('stroke-width="1.2"'));
  assert.ok(!result.svg.includes('foreignObject'));
});
test('bullet, numbered, rule and checked todo blocks render as distinct shapes',()=>{
  const blocks=[{type:'bullet',runs:[{text:'item'}]},{type:'number',runs:[{text:'one'}]},{type:'number',runs:[{text:'two'}]}, {type:'rule'},{type:'todo',checked:true,runs:[{text:'done'}]}];
  const result=layoutNote(blocks);
  assert.ok(result.svg.includes('•'));assert.ok(result.svg.includes('>1.</text>'));assert.ok(result.svg.includes('>2.</text>'));
  assert.ok(result.svg.includes('stroke-width="1.5"'));assert.ok(result.svg.includes('<path'));
  assert.ok(modelHTML(blocks).includes('type="checkbox" contenteditable="false" checked'));
});
test('untrusted text and colors cannot inject executable markup into HTML or SVG',()=>{
  const blocks=[{type:'paragraph',runs:[{text:'<img src=x onerror=alert(1)>&',bold:true}]}];
  assert.ok(!modelHTML(blocks).includes('<img'));
  const svg=layoutNote(blocks,{color:'" onload="alert(1)'}).svg;
  assert.ok(!svg.includes('onload='));assert.ok(!svg.includes('<img'));assert.ok(svg.includes('&lt;'));
});
test('empty notes have nonzero dimensions and extreme sizing is clamped',()=>{
  const result=layoutNote([],{width:0,fontSize:10000});
  assert.ok(result.width>=180&&result.width<=1200);assert.ok(result.height>0);assert.ok(result.svg.includes('font-size="64"'));
});
