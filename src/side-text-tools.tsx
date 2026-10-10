import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {readHTML,sourceModel,writeNote} from './rich-notes';
import {escapeHTML,modelHTML} from './rich-layout.mjs';
import {formatSelection} from './selection-format.mjs';
import './side-text-tools.css';

const tools=[['高亮','highlight'],['粗体','bold'],['下划线','underline'],['分割线','rule'],['项目符号','bullet'],['数字编号','number'],['待办勾选','todo']];
type Handle={format:(command:string)=>void;finish:()=>Promise<void>};
type Session={source:any;blocks:any[];start:number;end:number;selectAll:boolean;initialCommand?:string};

export function SideTextTools({api,selection,onStatus}:{api:ExcalidrawImperativeAPI|null;selection:{id:string;version:number}|null;onStatus:(s:string)=>void}) {
  const [target,setTarget]=useState<Element|null>(null);
  const [session,setSession]=useState<Session|null>(null);
  const editor=useRef<Handle|null>(null);
  const source:any=api && selection?api.getSceneElements().find(e=>e.id===selection.id):null;
  useEffect(()=>{
    const find=()=>setTarget(previous=>{const next=document.querySelector('.excalidraw .selected-shape-actions .panelColumn');return previous===next?previous:next;});
    find();const observer=new MutationObserver(find);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();
  },[]);
  function start(command?:string) {
    if(!api)return;
    if(session && editor.current){if(command)editor.current.format(command);return;}
    const native=document.querySelector('textarea.excalidraw-wysiwyg') as HTMLTextAreaElement|null;
    const selectedSource:any=api.getAppState().editingTextElement || source;
    const text=native?.value ?? selectedSource?.originalText ?? selectedSource?.text ?? sourceModel(selectedSource).map(b=>b.runs?.map(r=>r.text).join('') || '').join('\n');
    const from=native?.selectionStart ?? 0,to=native?.selectionEnd ?? text.length;
    const blocks=selectedSource?.customData?.richNote?.blocks || (command?formatSelection(text,from,to,command):sourceModel(selectedSource));
    if(native)native.blur();
    requestAnimationFrame(()=>{
      const current=selectedSource?api.getSceneElements().find(e=>e.id===selectedSource.id) || selectedSource:null;
      setSession({source:current,blocks,start:from,end:to,selectAll:!native,initialCommand:(selectedSource?.customData?.richNote || (native && from===to)) && command?command:undefined});
      onStatus('直接编辑画布文字 · 选区格式会自动保存');
    });
  }
  useEffect(()=>{
    if(!api)return;
    const double=(event:MouseEvent)=>{
      if(!source?.customData?.richNote || !(event.target instanceof Element) || !event.target.closest('.excalidraw') || event.target.closest('.selected-shape-actions'))return;
      const app=api.getAppState(),x=(event.clientX-app.offsetLeft)/app.zoom.value-app.scrollX,y=(event.clientY-app.offsetTop)/app.zoom.value-app.scrollY;
      if(x<source.x || x>source.x+source.width || y<source.y || y>source.y+source.height)return;
      event.preventDefault();event.stopPropagation();start();
    };
    document.addEventListener('dblclick',double,true);return()=>document.removeEventListener('dblclick',double,true);
  },[api,source,session]);
  const dark=api?.getAppState().theme==='dark';
  return <>
    <button disabled={!api} onClick={()=>start()}>{source?'编辑文字':'新建格式文本'}</button>
    {target && (source || session) && createPortal(<section className={`nm-format ${dark?'dark':''}`} aria-label="文字格式">
      <h3>文字格式</h3><div className="nm-format-buttons">{tools.map(([label,command])=><button key={command} title={label} onPointerDown={e=>e.preventDefault()} onMouseDown={e=>e.preventDefault()} onClick={()=>start(command)}>{label}</button>)}</div>
      <small>选中文字后点击即可开启</small>
      {session && <button className="nm-text-finish" onMouseDown={e=>e.preventDefault()} onClick={()=>void editor.current?.finish()}>完成文字编辑</button>}
      {!session && source?.customData?.richNote && <button onClick={()=>start()}>编辑文字 / 勾选待办</button>}
    </section>,target)}
    {session && api && <InlineText key="inline-editor" ref={editor} api={api} session={session} onDone={()=>setSession(null)} onStatus={onStatus}/>}
  </>;
}

const InlineText=forwardRef<Handle,{api:ExcalidrawImperativeAPI;session:Session;onDone:()=>void;onStatus:(s:string)=>void}>(function InlineText({api,session,onDone,onStatus},handle){
  const element=useRef<HTMLDivElement>(null),range=useRef<Range|null>(null);
  const source=useRef<any>(session.source);
  const changed=useRef(false),busy=useRef(false),again=useRef(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [placement,setPlacement]=useState({left:0,top:0,zoom:1,angle:0});
  const width=Math.max(180,Math.min(1200,session.source?.width || 440));
  const size=session.source?.customData?.richNote?.fontSize || session.source?.fontSize || 22;
  const color=session.source?.customData?.richNote?.color || session.source?.strokeColor || (api.getAppState().theme==='dark'?'#f5f5f5':'#1e1e1e');
  function remember(){const s=window.getSelection();if(s?.rangeCount && element.current?.contains(s.anchorNode))range.current=s.getRangeAt(0).cloneRange();}
  function restore(){element.current!.focus();if(range.current){const s=window.getSelection()!;s.removeAllRanges();s.addRange(range.current);}}
  function queue(){changed.current=true;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void commit(),300);}
  async function commit(){
    if(busy.current){again.current=true;return;}
    if(!changed.current)return;
    busy.current=true;changed.current=false;
    try {
      const blocks=readHTML(element.current!.innerHTML);
      if(blocks.flatMap(b=>b.runs || []).reduce((n,r)=>n+r.text.length,0)>3000)throw new Error('文字过长，请拆分为多段');
      source.current=await writeNote(api,source.current,blocks,width,size,true);
      onStatus('文字格式已更新 · 约 5 秒同步云端');
    }catch(error){changed.current=true;onStatus((error as Error).message);}
    finally{busy.current=false;if(again.current){again.current=false;queue();}}
  }
  function format(command:string){
    restore();
    if(command==='todo') {
      const selected=window.getSelection()!.toString();document.execCommand('insertHTML',false,`<div data-todo="true"><input type="checkbox" contenteditable="false"> <span>${escapeHTML(selected || '待办事项')}</span></div>`);
    } else {
      if(command==='rule'){const s=window.getSelection();if(s?.rangeCount){const r=s.getRangeAt(0).cloneRange();r.collapse(false);s.removeAllRanges();s.addRange(r);}}
      document.execCommand(({highlight:'hiliteColor',bold:'bold',underline:'underline',rule:'insertHorizontalRule',bullet:'insertUnorderedList',number:'insertOrderedList'} as any)[command],false,command==='highlight'?'#ffe58f':undefined);
    }
    remember();queue();
  }
  async function finish(){if(timer.current)clearTimeout(timer.current);while(busy.current)await new Promise(resolve=>setTimeout(resolve,25));await commit();if(!changed.current)onDone();}
  useImperativeHandle(handle,()=>({format,finish}));
  useEffect(()=>{
    element.current!.innerHTML=modelHTML(session.blocks);element.current!.focus();
    let offset=0,startNode:Node|null=null,endNode:Node|null=null,startAt=0,endAt=0;
    for(const block of [...element.current!.children]){
      const textRoot=block.querySelector('input[type=checkbox]')?block.querySelector('span') || block:block;
      const walker=document.createTreeWalker(textRoot,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){const n=walker.currentNode,len=n.textContent?.length || 0;if(!startNode && session.start<=offset+len){startNode=n;startAt=Math.max(0,session.start-offset);}if(!endNode && session.end<=offset+len){endNode=n;endAt=Math.max(0,session.end-offset);}offset+=len;}
      offset++;
    }
    if(session.selectAll){const r=document.createRange();r.selectNodeContents(element.current!);range.current=r;restore();}
    else if(startNode && endNode){const r=document.createRange();r.setStart(startNode,startAt);r.setEnd(endNode,endAt);range.current=r;restore();}
    if(session.initialCommand)format(session.initialCommand);
    else if(session.blocks.some(b=>b.type!=='paragraph' || b.runs?.some((r:any)=>r.bold || r.underline || r.highlight)))queue();
    const locate=()=>{const app=api.getAppState(),s=source.current;setPlacement({left:((s?.x ?? -app.scrollX+180)+app.scrollX)*app.zoom.value+app.offsetLeft,top:((s?.y ?? -app.scrollY+100)+app.scrollY)*app.zoom.value+app.offsetTop,zoom:app.zoom.value,angle:s?.angle || 0});};
    locate();const position=setInterval(locate,150);
    const outside=(event:PointerEvent)=>{const target=event.target as Element;if(element.current?.contains(target) || target.closest('.nm-format'))return;void finish();};
    document.addEventListener('pointerdown',outside,true);
    const warn=(event:BeforeUnloadEvent)=>{if(changed.current || busy.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);
    return()=>{clearInterval(position);document.removeEventListener('pointerdown',outside,true);window.removeEventListener('beforeunload',warn);if(timer.current)clearTimeout(timer.current);};
  },[]);
  return createPortal(<div ref={element} className="inline-rich-editor" role="textbox" aria-label="画布文字编辑" aria-multiline="true" contentEditable suppressContentEditableWarning
    style={{left:placement.left,top:placement.top,width,fontSize:size,color,background:api.getAppState().viewBackgroundColor,transform:`scale(${placement.zoom}) rotate(${placement.angle}rad)`}}
    onMouseUp={remember} onKeyUp={remember} onInput={queue} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();void finish();}}}
    onPointerDown={e=>e.stopPropagation()} onClick={e=>{const target=e.target as HTMLInputElement;if(target.matches('input[type=checkbox]')){target.toggleAttribute('checked',target.checked);queue();}}}
    onPaste={e=>{e.preventDefault();restore();document.execCommand('insertHTML',false,modelHTML(readHTML(escapeHTML(e.clipboardData.getData('text/plain')).replace(/\n/g,'<br>'))));queue();}}/>,document.body);
});
