import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {normalizeTable,changeAxis,tableLayout,selectionBounds,cellOwner,mergeSelection,toTSV} from './table-model.mjs';
import {clipboardTable,writeTable} from './table-tools';
import './inline-table.css';

export function InlineTable({initial,source,api,onClose,onStatus}:{initial:any;source:any;api:ExcalidrawImperativeAPI;onClose:()=>void;onStatus:(s:string)=>void}) {
  const [table,setTable]=useState<any>(()=>normalizeTable(initial));
  const model=useRef(table),live=useRef<any>(source),root=useRef<HTMLDivElement>(null);
  const [anchor,setAnchor]=useState([0,0]),[end,setEnd]=useState([0,0]);
  const [sidebar,setSidebar]=useState<Element|null>(null),[position,setPosition]=useState({left:0,top:0,sx:1,sy:1,angle:0});
  const [message,setMessage]=useState('');
  const changed=useRef(false),busy=useRef(false),queued=useRef(false),mounted=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const dragging=useRef(false);
  const measure=useMemo(()=>{const ctx=document.createElement('canvas').getContext('2d')!;return(text:string,size:number)=>{ctx.font=`700 ${size}px Arial,Microsoft YaHei,sans-serif`;return ctx.measureText(text).width;};},[]);
  const layout=useMemo(()=>tableLayout(table,measure),[table,measure]);
  const selected=selectionBounds(table,anchor,end);
  const selectedRef=useRef(selected);selectedRef.current=selected;
  async function commit(){
    if(busy.current){queued.current=true;return;}
    if(!changed.current)return;
    busy.current=true;const snapshot=model.current;
    try{live.current=await writeTable(api,live.current,snapshot,false);if(model.current===snapshot)changed.current=false;if(mounted.current){setMessage('');onStatus('表格已实时更新 · 约 5 秒同步云端');}}
    catch(error){if(mounted.current){setMessage((error as Error).message);onStatus((error as Error).message);}}
    finally{busy.current=false;if(mounted.current && (queued.current||model.current!==snapshot)){queued.current=false;schedule();}}
  }
  function schedule(){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void commit(),350);}
  function update(value:any){try{const next=normalizeTable(value);tableLayout(next,measure);if(JSON.stringify(next)===JSON.stringify(model.current))return;model.current=next;setTable(next);changed.current=true;setMessage('');schedule();}catch(error){setMessage((error as Error).message);}}
  function modifyCell(r:number,c:number,value:string){const cells=model.current.cells.map((row:string[])=>[...row]);cells[r][c]=value;update({...model.current,cells});}
  function format(patch:any){const styles={...model.current.styles},range=selectedRef.current;for(let r=range.r;r<=range.endR;r++)for(let c=range.c;c<=range.endC;c++)styles[`${r}:${c}`]={...styles[`${r}:${c}`],...patch};update({...model.current,styles});}
  function axis(type:string,remove=false){try{const next=changeAxis(model.current,type,type==='row'?selected.r:selected.c,remove);update(next);const r=Math.min(anchor[0],next.cells.length-1),c=Math.min(anchor[1],next.cells[0].length-1);setAnchor([r,c]);setEnd([r,c]);}catch(error){setMessage((error as Error).message);}}
  function dimension(type:'row'|'column',value:number){const next={...model.current};const values=[...(type==='row'?next.rowHeights:next.columnWidths)];const range=selectedRef.current;for(let i=type==='row'?range.r:range.c;i<=(type==='row'?range.endR:range.endC);i++)values[i]=value;if(type==='row')next.rowHeights=values;else next.columnWidths=values;update(next);}
  async function finish(){if(timer.current)clearTimeout(timer.current);while(busy.current)await new Promise(resolve=>setTimeout(resolve,20));await commit();if(!changed.current)onClose();}
  function choose(event:React.PointerEvent,r:number,c:number){
    if(event.shiftKey){event.preventDefault();setEnd([r,c]);return;}
    setAnchor([r,c]);setEnd([r,c]);
    const start={x:event.clientX,y:event.clientY},base=[r,c];
    const move=(e:PointerEvent)=>{if(Math.hypot(e.clientX-start.x,e.clientY-start.y)<5)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-table-cell]');if(target&&root.current?.contains(target)){dragging.current=true;setAnchor(base);setEnd([Number(target.dataset.row),Number(target.dataset.column)]);}};
    const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);setTimeout(()=>{dragging.current=false;},0);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});
  }
  function resize(event:React.PointerEvent,index:number,type:'row'|'column'){
    event.preventDefault();event.stopPropagation();const start={x:event.clientX,y:event.clientY},base=type==='row'?layout.heights[index]:table.columnWidths[index];
    const move=(e:PointerEvent)=>{const dx=e.clientX-start.x,dy=e.clientY-start.y,cos=Math.cos(position.angle),sin=Math.sin(position.angle);const delta=type==='column'?(dx*cos+dy*sin)/position.sx:(-dx*sin+dy*cos)/position.sy;const values=[...(type==='row'?model.current.rowHeights:model.current.columnWidths)];values[index]=Math.round(base+delta);update({...model.current,[type==='row'?'rowHeights':'columnWidths']:values});};
    const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});
  }
  function paste(event:React.ClipboardEvent,r:number,c:number){
    try{const incoming=clipboardTable(event.clipboardData.getData('text/html'),event.clipboardData.getData('text/plain'));if(!incoming)return;event.preventDefault();event.stopPropagation();const current=model.current,cells=current.cells.map((row:string[])=>[...row]);const nr=Math.max(cells.length,r+incoming.cells.length),nc=Math.max(cells[0].length,c+incoming.cells[0].length);if(nr>100||nc>30)throw new Error('粘贴范围超出 100 行或 30 列');while(cells.length<nr)cells.push(Array(nc).fill(''));for(const row of cells)while(row.length<nc)row.push('');incoming.cells.forEach((row:string[],dr:number)=>row.forEach((value,dc)=>{cells[r+dr][c+dc]=value;}));const pasted={r,c,endR:r+incoming.cells.length-1,endC:c+incoming.cells[0].length-1};const clean=mergeSelection({...current,cells},pasted,true);update({...clean,merges:[...clean.merges,...incoming.merges.map((m:any)=>({...m,r:m.r+r,c:m.c+c}))]});setEnd([pasted.endR,pasted.endC]);}
    catch(error){event.preventDefault();setMessage((error as Error).message);}
  }
  function key(event:React.KeyboardEvent,r:number,c:number){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();void finish();return;}if(event.key!=='Tab'&&!(event.key==='Enter'&&!event.shiftKey))return;event.preventDefault();const columns=table.cells[0].length,owner=cellOwner(table,r,c),step=event.shiftKey?-1:1;let index=event.key==='Enter'?(r+owner.rows)*columns+c:r*columns+c+step;while(index>=0&&index<table.cells.length*columns){const nr=Math.floor(index/columns),nc=index%columns,next=cellOwner(table,nr,nc);if(next.r===nr&&next.c===nc)break;index+=step;}if(index<0)return;if(index>=table.cells.length*columns){if(table.cells.length>=100)return;update(changeAxis(model.current,'row',table.cells.length-1));index=table.cells.length*columns+c;}const nr=Math.floor(index/columns),nc=index%columns;setAnchor([nr,nc]);setEnd([nr,nc]);setTimeout(()=>root.current?.querySelector<HTMLTextAreaElement>(`textarea[data-row="${nr}"][data-column="${nc}"]`)?.focus(),0);}
  useEffect(()=>{
    const locate=()=>{const app=api.getAppState(),s=live.current,meta=s.customData.richTable;const sx=s.width/(meta.layoutWidth || meta.cells[0].length*meta.columnWidth),sy=s.height/(meta.layoutHeight || layout.height),angle=s.angle || 0,cos=Math.cos(angle),sin=Math.sin(angle);setPosition({left:(s.x+app.scrollX+s.width/2-s.width*cos/2+s.height*sin/2)*app.zoom.value+app.offsetLeft,top:(s.y+app.scrollY+s.height/2-s.width*sin/2-s.height*cos/2)*app.zoom.value+app.offsetTop,sx:sx*app.zoom.value,sy:sy*app.zoom.value,angle});};
    const find=()=>setSidebar(previous=>{const target=document.querySelector('.excalidraw .selected-shape-actions .panelColumn');return previous===target?previous:target;});locate();find();const tick=setInterval(locate,150),observer=new MutationObserver(find);observer.observe(document.body,{childList:true,subtree:true});
    const outside=(event:PointerEvent)=>{const target=event.target as Element;if(root.current?.contains(target)||target.closest('.nm-table-properties'))return;void finish();};document.addEventListener('pointerdown',outside,true);
    const warn=(event:BeforeUnloadEvent)=>{if(changed.current||busy.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);
    return()=>{mounted.current=false;clearInterval(tick);observer.disconnect();document.removeEventListener('pointerdown',outside,true);window.removeEventListener('beforeunload',warn);if(timer.current)clearTimeout(timer.current);};
  },[]);
  let edgeX=0,edgeY=0;
  const dark=api.getAppState().theme==='dark';
  return <>
    {sidebar && createPortal(<section className={`nm-table-properties ${dark?'dark':''}`} aria-label="表格编辑栏"><h3>表格</h3><small>点击编辑文字；拖选或 Shift＋点击选择区域</small>
      <div className="nm-table-property-buttons"><button onClick={()=>axis('row')}>添加行</button><button onClick={()=>axis('row',true)} disabled={table.cells.length<=1}>删除行</button><button onClick={()=>axis('column')}>添加列</button><button onClick={()=>axis('column',true)} disabled={table.cells[0].length<=1}>删除列</button><button onClick={()=>update(mergeSelection(table,selected))}>合并单元格</button><button onClick={()=>update(mergeSelection(table,selected,true))}>取消合并</button><button onClick={()=>format({bold:!(table.styles[`${selected.r}:${selected.c}`]?.bold??(table.header&&selected.r===0))})}>粗体</button><button onClick={()=>format({fill:table.styles[`${selected.r}:${selected.c}`]?.fill?'':'#fff1ad'})}>单元格高亮</button></div>
      <label>对齐<select value={table.styles[`${selected.r}:${selected.c}`]?.align || 'left'} onChange={e=>format({align:e.target.value})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
      <label>选中列宽<Dimension key={`w:${selected.c}:${table.columnWidths[selected.c]}`} value={table.columnWidths[selected.c]} onChange={v=>dimension('column',v)}/></label><label>选中行高<Dimension key={`h:${selected.r}:${layout.heights[selected.r]}`} value={layout.heights[selected.r]} onChange={v=>dimension('row',v)}/></label>
      <label><input type="checkbox" checked={table.header} onChange={e=>update({...table,header:e.target.checked})}/>首行为表头</label>
      <button onClick={async()=>{try{await navigator.clipboard.writeText(toTSV(table));onStatus('表格已复制');}catch{setMessage('复制失败，请检查剪贴板权限');}}}>复制表格</button><button onClick={()=>void finish()}>完成编辑</button>{message&&<p role="status">{message}</p>}
    </section>,sidebar)}
    {createPortal(<div className="nm-table-inline" ref={root} style={{left:position.left,top:position.top,width:layout.width,height:layout.height,transform:`rotate(${position.angle}rad) scale(${position.sx},${position.sy})`}} onKeyDown={e=>e.stopPropagation()}>
      {layout.cells.map((cell:any)=>{const style=table.styles[`${cell.r}:${cell.c}`]||{},inRange=cell.r<=selected.endR&&cell.r+cell.rows-1>=selected.r&&cell.c<=selected.endC&&cell.c+cell.columns-1>=selected.c;return <textarea key={`${cell.r}:${cell.c}`} data-table-cell data-row={cell.r} data-column={cell.c} className={inRange?'selected':''} aria-label={`第 ${cell.r+1} 行第 ${cell.c+1} 列`} value={table.cells[cell.r][cell.c]} style={{left:cell.x,top:cell.y,width:cell.width,height:cell.height,fontSize:table.fontSize,fontWeight:(style.bold??(table.header&&cell.r===0))?700:400,textAlign:style.align||'left',background:style.fill || (table.header&&cell.r===0?'#eeeafd':'white')}} onPointerDown={e=>choose(e,cell.r,cell.c)} onFocus={()=>{if(!dragging.current){setAnchor([cell.r,cell.c]);setEnd([cell.r,cell.c]);}}} onChange={e=>modifyCell(cell.r,cell.c,e.target.value)} onPaste={e=>paste(e,cell.r,cell.c)} onKeyDown={e=>key(e,cell.r,cell.c)}/>;})}
      {table.columnWidths.map((width:number,index:number)=>{edgeX+=width;return <div key={`c${index}`} className="nm-table-col-resize" style={{left:edgeX-3,height:layout.height}} title="拖动调整列宽" onPointerDown={e=>resize(e,index,'column')}/>;})}
      {layout.heights.map((height:number,index:number)=>{edgeY+=height;return <div key={`r${index}`} className="nm-table-row-resize" style={{top:edgeY-3,width:layout.width}} title="拖动调整行高" onPointerDown={e=>resize(e,index,'row')}/>;})}
    </div>,document.body)}
  </>;
}
function Dimension({value,onChange}:{value:number;onChange:(n:number)=>void}){const [draft,setDraft]=useState(String(value));return <input type="number" min={32} max={800} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>onChange(Number(draft))} onKeyDown={e=>{if(e.key==='Enter')onChange(Number(draft));}}/>;}
