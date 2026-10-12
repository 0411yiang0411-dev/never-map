import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {CaptureUpdateAction,convertToExcalidrawElements} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {changeAxis,normalizeTable,parseTSV,tableSVG,toTSV} from './table-model.mjs';
import './table-tools.css';

function clipboardTable(html:string,text:string) {
  if(html && /<table[\s>]/i.test(html)) {
    const node=new DOMParser().parseFromString(html,'text/html').querySelector('table');
    if(node){
      const matrix:string[][]=[];const rows=[...node.rows];
      if(rows.length>100)throw new Error('表格最多支持 100 行，请拆分后粘贴');
      for(let r=0;r<rows.length;r++) {
        matrix[r] ||= [];let c=0;
        for(const cell of [...rows[r].cells]) {
          for(const br of [...cell.querySelectorAll('br')])br.replaceWith(document.createTextNode('\n'));
          while(matrix[r][c]!==undefined)c++;
          const rs=Math.max(1,cell.rowSpan),cs=Math.max(1,cell.colSpan);
          if(r+rs>100||c+cs>30)throw new Error('表格最多支持 100 行、30 列');
          for(let dr=0;dr<rs;dr++){matrix[r+dr] ||= [];for(let dc=0;dc<cs;dc++)matrix[r+dr][c+dc]=dr===0&&dc===0?(cell.textContent||'').trim():'';}
          c+=cs;
        }
      }
      const plain=parseTSV(text);
      const same=plain && plain.cells.length===matrix.length && plain.cells[0].length===Math.max(...matrix.map(row=>row.length));
      return normalizeTable({cells:same?plain.cells:matrix,header:!!rows[0]?.querySelector('th')});
    }
  }
  return parseTSV(text);
}
async function writeTable(api:ExcalidrawImperativeAPI,source:any,model:any) {
  const table=normalizeTable(model),ctx=document.createElement('canvas').getContext('2d')!;
  const rendered=tableSVG(table,(text:string,size:number)=>{ctx.font=`700 ${size}px Arial,Microsoft YaHei,sans-serif`;return ctx.measureText(text).width;});
  const bytes=new TextEncoder().encode(rendered.svg);if(bytes.byteLength>1900000)throw new Error('表格过大，请拆分后保存');
  const fileId=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const dataURL=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.onerror=reject;reader.readAsDataURL(new Blob([rendered.svg],{type:'image/svg+xml'}));});
  const elements=api.getSceneElementsIncludingDeleted();const live=source && elements.find(e=>e.id===source.id&&!e.isDeleted);
  if(source&&(!live||live.version!==source.version))throw new Error('表格已被更新，请重新打开，避免覆盖其他修改');
  const app=api.getAppState();
  const stored={...table,layoutWidth:rendered.width,layoutHeight:rendered.height};
  const prior:any=live?.customData?.richTable;
  const sx=live?live.width/(prior.layoutWidth || prior.cells[0].length*prior.columnWidth):1;
  const sy=live?live.height/(prior.layoutHeight || tableSVG(prior).height):1;
  const [fresh]=convertToExcalidrawElements([{type:'image',x:(window.innerWidth/2-app.offsetLeft)/app.zoom.value-app.scrollX-rendered.width/2,y:(window.innerHeight/2-app.offsetTop)/app.zoom.value-app.scrollY-Math.min(rendered.height/2,250),width:rendered.width,height:rendered.height,fileId,status:'saved',scale:[1,1],customData:{richTable:stored}} as any]);
  const image:any=live?{...live,fileId,width:rendered.width*sx,height:rendered.height*sy,customData:{...live.customData,richTable:stored},version:live.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()}:fresh;
  api.addFiles([{id:fileId as any,mimeType:'image/svg+xml',dataURL:dataURL as any,created:Date.now()}]);
  api.updateScene({elements:live?elements.map(e=>e.id===live.id?image:e):[...elements,image],appState:{selectedElementIds:{[image.id]:true}},captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  api.setActiveTool({type:'selection'});
}

const handled=new WeakSet<ClipboardEvent>();
function pastedTable(event:ClipboardEvent|null,text='',html='') {
  if(event){
    if(handled.has(event))return 'handled' as const;
    const target=event.target instanceof Element?event.target:null;
    const native=target?.matches('textarea.excalidraw-wysiwyg');
    if(target?.closest('.nm-table-editor,.canvas-name-modal,.inline-rich-editor') || (!native && target?.closest('input,textarea,[contenteditable=true]')) || document.querySelector('.nm-table-editor,.inline-rich-editor'))return null;
    text=event.clipboardData?.getData('text/plain') || text;html=event.clipboardData?.getData('text/html') || html;
  }
  const table=clipboardTable(html,text);
  if(table && event){handled.add(event);event.preventDefault();event.stopImmediatePropagation();if(event.target instanceof HTMLTextAreaElement && event.target.matches('.excalidraw-wysiwyg'))event.target.blur();}
  return table;
}
export async function handleTablePaste(api:ExcalidrawImperativeAPI|null,event:ClipboardEvent|null,text:string,onStatus:(s:string)=>void) {
  if(!api)return true;
  try {const table=pastedTable(event,text);if(table==='handled')return false;if(!table)return true;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));await writeTable(api,null,table);onStatus('已将粘贴内容转换为可编辑表格');return false;}
  catch(error){onStatus((error as Error).message);return false;}
}

export function TableTools({api,selection,onStatus}:{api:ExcalidrawImperativeAPI|null;selection:{id:string;version:number}|null;onStatus:(s:string)=>void}) {
  const [editing,setEditing]=useState<{source:any;table:any}|null>(null);
  const source:any=api && selection?api.getSceneElements().find(e=>e.id===selection.id):null;
  useEffect(()=>{
    if(!api)return;
    const paste=(event:ClipboardEvent)=>{
      try {
        const table=pastedTable(event);if(!table||table==='handled')return;
        void new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())).then(()=>writeTable(api,null,table)).then(()=>onStatus('已将粘贴内容转换为可编辑表格')).catch(error=>onStatus(error.message));
      }catch(error){event.preventDefault();event.stopImmediatePropagation();onStatus((error as Error).message);}
    };
    const double=(event:MouseEvent)=>{
      if(!(event.target instanceof Element)||event.target.tagName!=='CANVAS')return;
      const app=api.getAppState(),x=(event.clientX-app.offsetLeft)/app.zoom.value-app.scrollX,y=(event.clientY-app.offsetTop)/app.zoom.value-app.scrollY;
      const candidate:any=[...api.getSceneElements()].reverse().find(e=>e.type==='image'&&e.customData?.richTable&&x>=e.x&&x<=e.x+e.width&&y>=e.y&&y<=e.y+e.height);
      if(!candidate)return;event.preventDefault();event.stopPropagation();setEditing({source:candidate,table:normalizeTable(candidate.customData.richTable)});
    };
    document.addEventListener('paste',paste,true);document.addEventListener('dblclick',double,true);
    return()=>{document.removeEventListener('paste',paste,true);document.removeEventListener('dblclick',double,true);};
  },[api,onStatus]);
  return <>
    <button disabled={!api} onClick={()=>setEditing({source:null,table:normalizeTable({cells:Array.from({length:4},()=>Array(3).fill('')),header:true})})}>插入表格</button>
    {source && <button onClick={()=>setEditing({source,table:normalizeTable(source.customData.richTable)})}>编辑表格</button>}
    {editing && api && <TableEditor initial={editing.table} source={editing.source} api={api} onClose={()=>setEditing(null)} onStatus={onStatus}/>}
  </>;
}
function TableEditor({initial,source,api,onClose,onStatus}:{initial:any;source:any;api:ExcalidrawImperativeAPI;onClose:()=>void;onStatus:(s:string)=>void}) {
  const [table,setTable]=useState(initial),[selected,setSelected]=useState([0,0]),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [dirty,setDirty]=useState(false);
  const [columnWidth,setColumnWidth]=useState(String(initial.columnWidth)),[fontSize,setFontSize]=useState(String(initial.fontSize));
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const rows=table.cells.length,cols=table.cells[0].length;
  function update(next:any){try{setTable(normalizeTable(next));setDirty(true);setError('');}catch(error){setError((error as Error).message);}}
  function axis(type:string,remove=false){try{const next=changeAxis(table,type,selected[type==='row'?0:1],remove);update(next);setSelected(([r,c])=>[Math.min(r,next.cells.length-1),Math.min(c,next.cells[0].length-1)]);}catch(error){setError((error as Error).message);}}
  function cell(r:number,c:number,value:string){const cells=table.cells.map((row:string[])=>[...row]);cells[r][c]=value;update({...table,cells});}
  function style(patch:any){const key=selected.join(':');update({...table,styles:{...table.styles,[key]:{...table.styles[key],...patch}}});}
  function pasteCells(event:React.ClipboardEvent,r:number,c:number){try{const incoming=clipboardTable(event.clipboardData.getData('text/html'),event.clipboardData.getData('text/plain'));if(!incoming)return;event.preventDefault();event.stopPropagation();const cells=table.cells.map((row:string[])=>[...row]);const nr=Math.max(rows,r+incoming.cells.length),nc=Math.max(cols,c+incoming.cells[0].length);if(nr>100||nc>30)throw new Error('粘贴区域超过 100 行或 30 列');while(cells.length<nr)cells.push(Array(nc).fill(''));for(const row of cells)while(row.length<nc)row.push('');incoming.cells.forEach((row:string[],dr:number)=>row.forEach((value,dc)=>{cells[r+dr][c+dc]=value;}));update({...table,cells});}catch(error){event.preventDefault();setError((error as Error).message);}}
  function navigate(event:React.KeyboardEvent,r:number,c:number){if(event.key!=='Tab'&&!(event.key==='Enter'&&!event.shiftKey))return;event.preventDefault();let index=event.key==='Enter'?(r+1)*cols+c:r*cols+c+(event.shiftKey?-1:1);if(index<0)index=0;if(index>=rows*cols){if(rows>=100)return;update(changeAxis(table,'row',rows-1));}setSelected([Math.floor(index/cols),index%cols]);setTimeout(()=>document.querySelector<HTMLTextAreaElement>(`.nm-table-editor textarea[data-row="${Math.floor(index/cols)}"][data-column="${index%cols}"]`)?.focus(),0);}
  async function apply(){setSaving(true);try{await writeTable(api,source,{...table,columnWidth:Number(columnWidth),fontSize:Number(fontSize)});onStatus('表格已更新 · 随画布自动同步');onClose();}catch(error){setError((error as Error).message);setSaving(false);}}
  return createPortal(<div className="nm-table-editor" onKeyDown={e=>e.stopPropagation()}><div className="nm-table-dialog" role="dialog" aria-modal="true" aria-label="表格编辑">
    <div className="nm-table-heading"><h2>表格编辑 · {rows} 行 × {cols} 列</h2><button disabled={saving} onClick={onClose}>关闭</button></div>
    <div className="nm-table-actions"><button onClick={()=>axis('row')}>添加行</button><button onClick={()=>axis('row',true)} disabled={rows<=1}>删除行</button><button onClick={()=>axis('column')}>添加列</button><button onClick={()=>axis('column',true)} disabled={cols<=1}>删除列</button><button onClick={()=>style({bold:!(table.styles[selected.join(':')]?.bold??(table.header&&selected[0]===0))})}>单元格粗体</button><select aria-label="单元格对齐" value={table.styles[selected.join(':')]?.align||'left'} onChange={e=>style({align:e.target.value})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select><button onClick={()=>style({fill:table.styles[selected.join(':')]?.fill?'':'#fff1ad'})}>单元格高亮</button></div>
    <div className="nm-table-options"><label><input type="checkbox" checked={table.header} onChange={e=>update({...table,header:e.target.checked})}/>首行为表头</label><label>列宽 <input type="number" min={80} max={300} value={columnWidth} onChange={e=>{setColumnWidth(e.target.value);setDirty(true);}} onBlur={()=>update({...table,columnWidth:Number(columnWidth)})}/></label><label>字号 <input type="number" min={12} max={28} value={fontSize} onChange={e=>{setFontSize(e.target.value);setDirty(true);}} onBlur={()=>update({...table,fontSize:Number(fontSize)})}/></label><button onClick={async()=>{try{await navigator.clipboard.writeText(toTSV(table));setError('表格已复制，可粘贴到 Excel');}catch{setError('复制失败，请检查浏览器剪贴板权限');}}}>复制表格</button></div>
    <div className="nm-table-scroll"><table><tbody>{table.cells.map((row:string[],r:number)=><tr key={r}>{row.map((value,c)=><td key={c} className={selected[0]===r&&selected[1]===c?'selected':''} style={{background:table.styles[`${r}:${c}`]?.fill || (table.header&&r===0?'#eeeafd':'white')}}><textarea data-row={r} data-column={c} aria-label={`第 ${r+1} 行第 ${c+1} 列`} value={value} onFocus={()=>setSelected([r,c])} onChange={e=>cell(r,c,e.target.value)} onPaste={e=>pasteCells(e,r,c)} onKeyDown={e=>navigate(e,r,c)} style={{width:table.columnWidth,fontSize:table.fontSize,fontWeight:(table.styles[`${r}:${c}`]?.bold??(table.header&&r===0))?700:400,textAlign:table.styles[`${r}:${c}`]?.align || 'left'}}/></td>)}</tr>)}</tbody></table></div>
    <p role="status">{error || '点击单元格编辑；Tab 切换单元格，Enter 向下移动，Shift＋Enter 换行。可在单元格粘贴多个行列。'}</p>
    <button className="nm-table-save" disabled={saving} onClick={()=>void apply()}>{saving?'正在保存…':'保存到画布'}</button>
  </div></div>,document.body);
}
