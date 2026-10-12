import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Excalidraw,exportToBlob,serializeAsJSON,CaptureUpdateAction} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI,BinaryFiles} from '@excalidraw/excalidraw/types';
import {RichNotes} from './rich-notes';
import {TableTools,handleTablePaste} from './table-tools';
import './workspace.css';

type Drawing={elements:any[];appState:any;files:BinaryFiles};
type Canvas={id:string;name:string;revision:number};
type Cache={drawing:Drawing;revision:number|null;pending:boolean;fileKeys:Record<string,string>};
type BoardHandle={flush:()=>Promise<boolean>;flushLocal:()=>Promise<void>;readCloud:()=>Promise<void>;overwrite:()=>Promise<void>;recover:()=>Promise<void>};
const params=new URLSearchParams(location.hash.slice(1));
const shareToken=params.get('share');
const firstId=params.get('canvas') || (shareToken?'main':localStorage.getItem('never-map-last-canvas') || 'main');
const blank=():Drawing=>({elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}});
const signature=(drawing:Drawing)=>drawing.elements.map(e=>`${e.id}:${e.version}:${e.isDeleted}:${e.fileId || ''}`).join('|')+drawing.appState.viewBackgroundColor;
const json=(response:Response):Promise<any>=>response.json();
async function request(path:string,options:RequestInit={}) {
  const response=await fetch(`/api/${path}`,{...options,headers:{...options.headers,Authorization:`Bearer ${sessionStorage.getItem('never-map-token') || ''}`}});
  if (!response.ok) { const body=await json(response); const error=new Error(body.error || '云端请求失败') as Error&{status:number};error.status=response.status;throw error; }
  return response;
}
async function db() {
  return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('never-map',1);r.onupgradeneeded=()=>r.result.createObjectStore('drawing');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
async function readCache(key:string):Promise<any> {
  const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('drawing');const r=tx.objectStore('drawing').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>database.close();});
}
async function writeCache(key:string,value:unknown) {
  const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('drawing','readwrite');tx.objectStore('drawing').put(value,key);tx.oncomplete=()=>{database.close();resolve();};tx.onerror=()=>{database.close();reject(tx.error);};});
}
function download(blob:Blob,name:string) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export default function Workspace() {
  const [canvases,setCanvases]=useState<Canvas[]>([]);
  const [canvasId,setCanvasId]=useState(firstId);
  const [connected,setConnected]=useState(false);
  const [authEpoch,setAuthEpoch]=useState(0);
  const [ready,setReady]=useState(false);
  const [panel,setPanel]=useState(false);
  const [password,setPassword]=useState(shareToken || sessionStorage.getItem('never-map-token') || '');
  const [message,setMessage]=useState('正在连接…');
  const [working,setWorking]=useState(false);
  const [progress,setProgress]=useState<{value:number;label:string}|null>(null);
  const [usage,setUsage]=useState<any>(null);
  const [shareURL,setShareURL]=useState('');
  const [dialog,setDialog]=useState<'new'|'rename'|null>(null);
  const [name,setName]=useState('');
  const board=useRef<BoardHandle|null>(null);
  const selected=canvases.find(c=>c.id===canvasId);

  async function connect(value=password,boot=false) {
    setWorking(true);setProgress({value:10,label:'正在验证访问密码…'});
    try {
      if (!boot) await board.current?.flushLocal();
      sessionStorage.setItem('never-map-token',value);
      const quota=await json(await request('usage'));setUsage(quota);
      if (quota.paused) throw new Error(quota.reason);
      setProgress({value:50,label:'正在读取画布列表…'});
      const list=(await json(await request('canvases'))).canvases as Canvas[];
      setCanvases(list);
      const id=list.some(c=>c.id===canvasId)?canvasId:'main';
      setCanvasId(id);setConnected(true);setAuthEpoch(e=>e+1);
      setProgress({value:100,label:'连接完成 · 正在自动读取云端画布'});
      setMessage('已登录，正在读取云端内容…');setPanel(false);
    } catch(error) {setConnected(false);setPanel(true);setMessage((error as Error).message);setProgress({value:0,label:(error as Error).message});}
    finally {setReady(true);setWorking(false);}
  }
  useEffect(()=>{
    const token=shareToken || sessionStorage.getItem('never-map-token');
    if(token) void connect(token,true); else {setReady(true);setPanel(true);setMessage('本地编辑模式 · 登录后自动读取云端');}
  },[]);
  useEffect(()=>{
    if (!connected) return;
    localStorage.setItem('never-map-last-canvas',canvasId);
    request(`share?canvas=${encodeURIComponent(canvasId)}`).then(json).then(v=>setShareURL(v.url)).catch(error=>setMessage(error.message));
    const hash=new URLSearchParams(location.hash.slice(1));if(canvasId==='main')hash.delete('canvas');else hash.set('canvas',canvasId);history.replaceState(null,'',`${location.pathname}${location.search}${hash.size?'#'+hash:''}`);
  },[canvasId,connected]);
  async function refreshList(){setCanvases((await json(await request('canvases'))).canvases);}
  async function switchCanvas(id:string) {
    if(id===canvasId || working) return;
    if(document.querySelector('.note-modal,.inline-rich-editor,.nm-table-editor,.nm-table-inline')){setMessage('请先完成文字或表格编辑');return;}
    setWorking(true);
    try {if(!(await board.current?.flush()))return;setCanvasId(id);setMessage('正在切换画布…');}
    finally {setWorking(false);}
  }
  async function submitName() {
    if(working || !name.trim())return;
    if(document.querySelector('.note-modal,.inline-rich-editor,.nm-table-editor,.nm-table-inline')){setMessage('请先完成文字或表格编辑');return;}
    setWorking(true);
    try {
      if(dialog==='new') {
        if(!(await board.current?.flush()))return;
        const created=await json(await request('canvases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}));
        await refreshList();setCanvasId(created.id);setMessage('新画布已创建');
      } else {await request(`canvases/${canvasId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});await refreshList();setMessage('画布已重命名');}
      setDialog(null);
    } catch(error){setMessage((error as Error).message);} finally {setWorking(false);}
  }
  return <main>
    <header><strong>never-map</strong><div className="canvas-management">
      <select aria-label="画布列表" value={canvasId} disabled={!connected || working} onChange={e=>void switchCanvas(e.target.value)}>
        {canvases.length?canvases.map(c=><option key={c.id} value={c.id}>{c.name}</option>):<option value={canvasId}>我的画布（本地）</option>}
      </select>
      <button disabled={!connected || working} onClick={()=>{setName('');setDialog('new');}}>新建画布</button>
      <button disabled={!connected || working} onClick={()=>{setName(selected?.name || '我的画布');setDialog('rename');}}>重命名</button>
    </div><span role="status">{message}</span><button onClick={()=>setPanel(!panel)}>云端与共享</button></header>
    {panel && <aside><h2>个人云端画布</h2><label>个人访问密码<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off"/></label>
      <button disabled={working} onClick={()=>void connect()}>连接并检查</button>
      <button disabled={!connected || working} onClick={()=>void board.current?.readCloud()}>读取云端</button>
      <button disabled={!connected || working} onClick={()=>void board.current?.overwrite()}>以本机版本覆盖云端</button>
      <button disabled={working} onClick={()=>void board.current?.recover()}>恢复本机未同步备份</button>
      {progress && <div className="connection-progress" role="status"><progress value={progress.value} max={100}/><p>{progress.label}</p></div>}
      {shareURL && <div className="share-link"><label>当前画布共享链接<input value={shareURL} readOnly onFocus={e=>e.currentTarget.select()}/></label><button onClick={async()=>{try{await navigator.clipboard.writeText(shareURL);setMessage('当前画布链接已复制');}catch{setMessage('请选中链接并手动复制');}}}>复制链接</button><small>链接持有人可编辑此工作区的画布。链接会直接打开当前选定画布。</small></div>}
      <p>内容修改后约 5 秒自动上传；其他设备登录时自动读取，打开期间每 5 秒检查更新。</p>
      {usage && <p>{usage.reason || '免费额度正常'} · 90% 提醒，99% 暂停。</p>}
      <button onClick={()=>setPanel(false)}>关闭</button>
    </aside>}
    {dialog && <div className="canvas-name-modal"><form onSubmit={e=>{e.preventDefault();void submitName();}}><h2>{dialog==='new'?'新建画布':'重命名画布'}</h2><label>画布名称<input autoFocus maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><div><button disabled={working || !name.trim()} type="submit">保存</button><button type="button" disabled={working} onClick={()=>setDialog(null)}>取消</button></div></form></div>}
    {ready && <Board key={`${canvasId}:${authEpoch}`} ref={board} id={canvasId} name={selected?.name || '我的画布'} connected={connected} locked={working} onStatus={setMessage}/>}
  </main>;
}

const Board=forwardRef<BoardHandle,{id:string;name:string;connected:boolean;locked:boolean;onStatus:(s:string)=>void}>(function Board({id,name,connected,locked,onStatus},ref){
  const [initial,setInitial]=useState<Drawing|null>(null);
  const [loading,setLoading]=useState(true);
  const [apiReady,setApiReady]=useState<ExcalidrawImperativeAPI|null>(null);
  const [selection,setSelection]=useState<{id:string;version:number}|null>(null);
  const [tableSelection,setTableSelection]=useState<{id:string;version:number}|null>(null);
  const api=useRef<ExcalidrawImperativeAPI|null>(null);
  const latest=useRef<Drawing>(blank());
  const revision=useRef<number|null>(null);
  const pending=useRef(false),active=useRef(false),mounted=useRef(true),loadingRef=useRef(true);
  const fileKeys=useRef<Record<string,string>>({});
  const known=useRef(new Map<string,{key:string;dataURL:string}>());
  const savedSignature=useRef('');
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),localTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const flight=useRef<Promise<boolean>|null>(null);
  const path=`canvases/${encodeURIComponent(id)}/scene`,slot=`canvas:${id}`;
  const status=(text:string)=>{if(mounted.current)onStatus(text);};
  async function persist(){await writeCache(slot,{drawing:latest.current,revision:revision.current,pending:pending.current,fileKeys:fileKeys.current} satisfies Cache);}
  function show(drawing:Drawing) {
    latest.current=drawing;savedSignature.current=signature(drawing);
    if(api.current) {api.current.addFiles(Object.values(drawing.files));api.current.updateScene({elements:drawing.elements,appState:drawing.appState,captureUpdate:CaptureUpdateAction.NEVER});}
    else setInitial(drawing);
  }
  async function decode(remote:any):Promise<{drawing:Drawing;keys:Record<string,string>}> {
    if(!remote.scene)return {drawing:blank(),keys:{}};
    const files:BinaryFiles={};
    const keys:Record<string,string>={};
    for(const [fileId,entry] of Object.entries(remote.scene.files) as [string,any][]) {
      const local=latest.current.files[fileId];
      let dataURL=local && fileKeys.current[fileId]===entry.key ? local.dataURL : '';
      if(!dataURL) {const blob=await(await request(`files/${entry.key}`)).blob();dataURL=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=reject;r.readAsDataURL(blob);});}
      const {key,...metadata}=entry;files[fileId]={...metadata,dataURL};keys[fileId]=key;
    }
    return {drawing:{...remote.scene,files},keys};
  }
  async function applyRemote(remote:any,onlyIfClean=false) {
    if(onlyIfClean && (pending.current || flight.current))return;
    const baseline=signature(latest.current);
    const {drawing,keys}=await decode(remote);
    if(!mounted.current)return;
    if(onlyIfClean && (pending.current || flight.current || signature(latest.current)!==baseline))return;
    fileKeys.current={...fileKeys.current,...keys};
    for(const [fileId,file] of Object.entries(drawing.files))known.current.set(fileId,{key:keys[fileId],dataURL:file.dataURL});
    const wasLoading=loadingRef.current;loadingRef.current=true;
    revision.current=remote.revision;pending.current=false;show(drawing);loadingRef.current=wasLoading;await persist();active.current=true;
    status('已与云端同步 · 修改后约 5 秒自动保存');
  }
  function queue(){if(!timer.current)timer.current=setTimeout(()=>{timer.current=null;void sync();},5000);}
  function sync():Promise<boolean> {
    if(flight.current)return flight.current;
    if(!connected || !active.current || !pending.current)return Promise.resolve(!pending.current || !connected);
    const snapshot=latest.current;
    flight.current=(async()=>{
      try {
        status('正在上传当前画布…');
        const files:Record<string,any>={};
        const used=new Set(snapshot.elements.filter(e=>e.type==='image'&&!e.isDeleted).map(e=>e.fileId));
        for(const [fileId,file] of Object.entries(snapshot.files)) {
          if(!used.has(fileId))continue;
          const cached=known.current.get(fileId);let key=cached?.dataURL===file.dataURL?cached.key:'';
          if(!key){const data=await(await(await fetch(file.dataURL)).blob()).arrayBuffer();key=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');await request(`files/${key}`,{method:'PUT',headers:{'Content-Type':file.mimeType},body:data});known.current.set(fileId,{key,dataURL:file.dataURL});}
          fileKeys.current[fileId]=key;const {dataURL:_url,...metadata}=file;files[fileId]={...metadata,key};
        }
        const remote=await json(await request(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:revision.current || 0,scene:{elements:snapshot.elements,appState:snapshot.appState,files}})}));
        revision.current=remote.revision;
        if(signature(latest.current)===signature(snapshot))pending.current=false;
        await persist();status(pending.current?'正在保存后续修改…':'已同步到云端');
        return true;
      } catch(error){active.current=false;await persist().catch(()=>{});status(`云端暂停：${(error as Error).message}；本机内容已保留`);return false;}
      finally {flight.current=null;if(pending.current && active.current && mounted.current)queue();}
    })();
    return flight.current;
  }
  async function flush(){if(timer.current){clearTimeout(timer.current);timer.current=null;}await persist();if(flight.current)await flight.current;for(let i=0;i<3 && pending.current && active.current;i++)if(!(await sync()))return false;return !pending.current || !connected;}
  async function readCloud(force=false) {
    if(flight.current)await flight.current;
    if(pending.current && !force)return;
    loadingRef.current=true;setLoading(true);
    try {if(pending.current)await writeCache(`recovery:${id}`,{drawing:latest.current,revision:revision.current,pending:true,fileKeys:fileKeys.current});await applyRemote(await json(await request(path)));}
    catch(error){active.current=false;status((error as Error).message);}
    finally {loadingRef.current=false;if(mounted.current)setLoading(false);}
  }
  useImperativeHandle(ref,()=>({flush,flushLocal:persist,readCloud:()=>readCloud(true),overwrite:async()=>{
    try {const remote=await json(await request(path));revision.current=remote.revision;pending.current=true;active.current=true;await sync();}catch(error){status((error as Error).message);}
  },recover:async()=>{try{const cache=await readCache(`recovery:${id}`) as Cache|undefined;if(!cache){status('此画布没有本机恢复备份');return;}show(cache.drawing);revision.current=cache.revision;pending.current=true;active.current=false;await persist();status('本机备份已恢复；确认后可选择覆盖云端');}catch(error){status((error as Error).message);}}}));
  useEffect(()=>{
    mounted.current=true;
    (async()=>{
      try {
        let cache=await readCache(slot) as Cache|undefined;
        if(!cache && id==='main'){const legacy=await readCache(shareToken?'shared-current':'current');if(legacy)cache={drawing:legacy,revision:null,pending:true,fileKeys:{}};}
        if(cache){latest.current=cache.drawing;revision.current=cache.revision;pending.current=cache.pending;fileKeys.current=cache.fileKeys || {};}
        if(!connected){show(latest.current);status('本地编辑模式 · 登录后自动同步');return;}
        const remote=await json(await request(path));
        if(cache?.pending && (cache.revision!==remote.revision)) {
          if(cache.revision===null) {await writeCache(`recovery:${id}`,cache);await applyRemote(remote);status('已自动读取云端；原本机内容保留在恢复备份中');}
          else {show(cache.drawing);active.current=false;status('云端已有新版本，本机也有未同步修改；请导出备份或选择读取云端');}
        } else if(cache?.pending && cache.revision===remote.revision) {show(cache.drawing);active.current=true;await sync();}
        else await applyRemote(remote);
      }catch(error){show(latest.current);active.current=false;status(`云端未连接：${(error as Error).message}`);}
      finally {loadingRef.current=false;if(mounted.current)setLoading(false);}
    })();
    const poll=setInterval(async()=>{
      if(!connected || !active.current || pending.current || flight.current || loadingRef.current || document.visibilityState!=='visible' || document.querySelector('.note-modal,.inline-rich-editor,.nm-table-editor,.nm-table-inline') || api.current?.getAppState().editingTextElement)return;
      try {const response=await request(`${path}?after=${revision.current || 0}`);if(response.status!==204)await applyRemote(await json(response),true);}
      catch(error){active.current=false;status(`同步暂停：${(error as Error).message}`);}
    },5000);
    const unload=(event:BeforeUnloadEvent)=>{if(pending.current || flight.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',unload);
    return()=>{mounted.current=false;clearInterval(poll);window.removeEventListener('beforeunload',unload);if(timer.current)clearTimeout(timer.current);if(localTimer.current)clearTimeout(localTimer.current);};
  },[]);
  async function exportDrawing(){if(!api.current)return;download(new Blob([serializeAsJSON(api.current.getSceneElements(),api.current.getAppState(),api.current.getFiles(),'local')],{type:'application/json'}),`${name}.excalidraw`);}
  async function exportPNG(){if(!api.current)return;try{download(await exportToBlob({elements:api.current.getSceneElements(),appState:api.current.getAppState(),files:api.current.getFiles()}),`${name}.png`);}catch{status('PNG 导出失败，请导出画布文件');}}
  return <>
    <div className="board-toolbar"><RichNotes api={apiReady} selection={selection} onStatus={status}/><TableTools api={apiReady} selection={tableSelection} onStatus={status}/><button onClick={exportDrawing}>导出备份</button><button onClick={exportPNG}>导出 PNG</button><span>{name}{loading?' · 正在读取…':''}</span></div>
    <section className="canvas" data-loading={loading || locked}>{initial && <Excalidraw initialData={initial} langCode="zh-CN" onPaste={(data,event)=>handleTablePaste(api.current,event,data.text || '',status)} excalidrawAPI={value=>{api.current=value;setApiReady(value);}} onChange={(elements,appState,files)=>{
      const picked=elements.find(e=>!e.isDeleted && (appState.selectedElementIds[e.id] || appState.editingTextElement?.id===e.id) && (e.type==='text' || e.customData?.richNote)) || elements.find(e=>e.type==='text' && !e.isDeleted && e.containerId && appState.selectedElementIds[e.containerId]);
      setSelection(previous=>picked?previous?.id===picked.id&&previous.version===picked.version?previous:{id:picked.id,version:picked.version}:previous?null:previous);
      const table=elements.find(e=>!e.isDeleted&&appState.selectedElementIds[e.id]&&e.customData?.richTable);
      setTableSelection(previous=>table?previous?.id===table.id&&previous.version===table.version?previous:{id:table.id,version:table.version}:previous?null:previous);
      if(loadingRef.current)return;
      const drawing={elements:[...elements],appState:{viewBackgroundColor:appState.viewBackgroundColor,theme:appState.theme},files};
      const sig=signature(drawing);if(sig===savedSignature.current)return;savedSignature.current=sig;latest.current=drawing;pending.current=true;
      status(active.current?'有修改 · 约 5 秒后自动上传':'本机内容已修改 · 云端未同步');
      if(localTimer.current)clearTimeout(localTimer.current);localTimer.current=setTimeout(()=>void persist().catch(()=>status('本地保存失败，请立即导出备份')),500);
      if(active.current)queue();
    }}/>}</section>
  </>;
});
