import {writeFile,mkdir} from 'node:fs/promises';
import {layoutNote} from '../src/rich-layout.mjs';
const blocks=[
  {type:'paragraph',runs:[{text:'今日待办',bold:true,underline:true,highlight:true}]},
  {type:'rule'},
  {type:'bullet',runs:[{text:'准备资料'}]},
  {type:'number',runs:[{text:'确认需求'}]},
  {type:'number',runs:[{text:'完成设计'}]},
  {type:'todo',checked:true,runs:[{text:'已完成事项'}]},
  {type:'todo',checked:false,runs:[{text:'待处理事项'}]}
];
await mkdir('.tmp',{recursive:true});
await writeFile('.tmp/sample-rich-note.svg',layoutNote(blocks).svg);
