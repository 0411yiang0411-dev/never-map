import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Excalidraw,exportToBlob,serializeAsJSON,CaptureUpdateAction} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI,BinaryFiles} from '@excalidraw/excalidraw/types';
import {RichNotes} from './rich-notes';
import {TableTools,handleTablePaste} from './table-tools';
import {AutoAlign} from './auto-align-tools';
import {DeviceInput} from './device-input-tools';
import {HandwritingEraser} from './handwriting-eraser-tools';
import {createSceneGate} from './scene-gate.mjs';
import {retryPolicy,resumeDecision} from './sync-policy.mjs';
import {storedAccess,rememberAccess,forgetAccess} from './session.mjs';
import './workspace.css';

type Drawing={elements:any[];appState:any;files:BinaryFiles};
type Canvas={id:string;name:string;revision:number};
type Cache={drawing:Drawing;revision:number|null;pending:boolean;fileKeys:Record<string,string>;lastUploadSignature?:string};
type BoardHandle={flush:()=>Promise<boolean>;flushLocal:()=>Promise<void>;readCloud:()=>Promise<void>;overwrite:()=>Promise<void>;recover:()=>Promise<void>};
const params=new URLSearchParams(location.hash.slice(1));
const shareToken=params.get('share');
const nativeBridge=(window as Window & {NeverMapAndroid?:{postMessage:(message:string)=>void}}).NeverMapAndroid;
const androidApp=!!nativeBridge || new URLSearchParams(location.search).get('app')==='android';
const firstId=params.get('canvas') || (shareToken?'main':localStorage.getItem('never-map-last-canvas') || 'main');
const blank=():Drawing=>({elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}});
const signature=(drawing:Drawing)=>drawing.elements.map(e=>`${e.id}:${e.version}:${e.isDeleted}:${e.fileId || ''}`).join('|')+drawing.appState.viewBackgroundColor;
const json=(response:Response):Promise<any>=>response.json();
async function request(path:string,options:RequestInit={},token=storedAccess()) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetch(`/api/${path}`,{...options,signal:controller.signal,cache:'no-store',headers:{...options.headers,Authorization:`Bearer ${token}`}});
    if (!response.ok) {const body=await json(response).catch(()=>({}));const error=new Error(body.error || `云端请求失败（${response.status}）`) as Error&{status:number};error.status=response.status;throw error;}
    return response;
  } finally {clearTimeout(timeout);}
}
function cachedCanvases():Canvas[]{try{return JSON.parse(localStorage.getItem('never-map-canvases') || '[]');}catch{return [];}}
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
  const [canvases,setCanvases]=useState<Canvas[]>(cachedCanvases);
  const [canvasId,setCanvasId]=useState(firstId);
  const [connected,setConnected]=useState(false);
  const [authEpoch,setAuthEpoch]=useState(0);
  const [ready]=useState(true);
  const [panel,setPanel]=useState(false);
  const [password,setPassword]=useState(shareToken || storedAccess());
  const [message,setMessage]=useState('正在连接…');
  const [working,setWorking]=useState(false);
  const [progress,setProgress]=useState<{value:number;label:string}|null>(null);
  const [usage,setUsage]=useState<any>(null);
  const [shareURL,setShareURL]=useState('');
  const [dialog,setDialog]=useState<'new'|'rename'|null>(null);
  const [name,setName]=useState('');
  const [toolbarHost,setToolbarHost]=useState<HTMLDivElement|null>(null);
  const board=useRef<BoardHandle|null>(null);
  const connectedRef=useRef(false),connecting=useRef(false),connectRetry=useRef(0),connectFailures=useRef(0),currentId=useRef(canvasId),alive=useRef(true);
  currentId.current=canvasId;
  const selected=canvases.find(c=>c.id===canvasId);
  useEffect(()=>{if(androidApp && toolbarHost)nativeBridge?.postMessage(JSON.stringify({type:'chromeReady'}));},[toolbarHost]);

  async function connect(value=password,boot=false) {
    if(connecting.current || !value)return;connecting.current=true;
    if(!boot){setWorking(true);setProgress({value:10,label:'正在验证访问密码…'});}
    try {
      if (!boot) await board.current?.flushLocal();
      const quota=await json(await request('usage',{},value));if(!alive.current)return;setUsage(quota);rememberAccess(value);
      if(quota.paused)throw Object.assign(new Error(quota.reason),{status:429});
      if(!boot)setProgress({value:50,label:'正在读取画布列表…'});
      const list=(await json(await request('canvases',{},value))).canvases as Canvas[];
      if(!alive.current)return;
      rememberAccess(value);rememberList(list);
      const id=list.some(c=>c.id===currentId.current)?currentId.current:'main';
      setCanvasId(id);connectedRef.current=true;setConnected(true);setAuthEpoch(e=>e+1);connectFailures.current=0;connectRetry.current=0;
      setProgress({value:100,label:'连接完成 · 正在自动读取云端画布'});
      setMessage('已登录，正在读取云端内容…');setPanel(false);
    } catch(error) {
      if(!alive.current)return;connectedRef.current=false;setConnected(false);
      const policy=retryPolicy((error as any).status,connectFailures.current++);connectRetry.current=Date.now()+policy.delay;
      if(policy.kind==='auth'){forgetAccess();setPanel(true);setMessage('登录已失效，请重新输入访问密码');}
      else{setMessage(`连接暂未恢复：${(error as Error).message}；本机画布可用，将自动重连`);if(!boot)setPanel(true);}
      if(!boot)setProgress({value:0,label:(error as Error).message});
    }
    finally {connecting.current=false;if(alive.current)setWorking(false);}
  }
  useEffect(()=>{
    alive.current=true;
    const token=shareToken || storedAccess();
    if(token)void connect(token,true);else{setPanel(true);setMessage('本地编辑模式 · 登录后自动读取云端');}
    let lastListCheck=0;
    const resume=()=>{
      if(document.visibilityState==='hidden')return;
      const value=storedAccess() || token;
      if(!connectedRef.current && value && Date.now()>=connectRetry.current)void connect(value,true);
      else if(connectedRef.current && Date.now()-lastListCheck>30000){lastListCheck=Date.now();void refreshList().catch(()=>{});}
    };
    const wake=()=>{if(Number.isFinite(connectRetry.current))connectRetry.current=0;resume();};
    const interval=setInterval(resume,10000);
    for(const event of ['online','focus','never-map-resume'])window.addEventListener(event,wake);
    document.addEventListener('visibilitychange',wake);
    return()=>{alive.current=false;clearInterval(interval);for(const event of ['online','focus','never-map-resume'])window.removeEventListener(event,wake);document.removeEventListener('visibilitychange',wake);};
  },[]);
  useEffect(()=>{
    if (!connected) return;
    localStorage.setItem('never-map-last-canvas',canvasId);
    request(`share?canvas=${encodeURIComponent(canvasId)}`).then(json).then(v=>setShareURL(v.url)).catch(error=>setMessage(error.message));
    const hash=new URLSearchParams(location.hash.slice(1));if(canvasId==='main')hash.delete('canvas');else hash.set('canvas',canvasId);history.replaceState(null,'',`${location.pathname}${location.search}${hash.size?'#'+hash:''}`);
  },[canvasId,connected]);
  function rememberList(list:Canvas[]){setCanvases(list);try{localStorage.setItem('never-map-canvases',JSON.stringify(list));}catch{}}
  async function refreshList(){const list=(await json(await request('canvases'))).canvases;if(alive.current)rememberList(list);}
  function authLost(){forgetAccess();connectedRef.current=false;setConnected(false);connectRetry.current=Infinity;setPanel(true);setMessage('登录已失效，请重新输入访问密码');}
  async function logout(){await board.current?.flushLocal();forgetAccess();connectedRef.current=false;setConnected(false);connectRetry.current=Infinity;setPassword('');setShareURL('');const hash=new URLSearchParams(location.hash.slice(1));hash.delete('share');history.replaceState(null,'',`${location.pathname}${location.search}${hash.size?'#'+hash:''}`);setMessage('已退出云端登录，本机画布仍保留');}
  async function switchCanvas(id:string) {
    if(id===canvasId || working) return;
    if(document.querySelector('.note-modal,.inline-rich-editor,.nm-table-editor,.nm-table-inline,.nm-pen-preview')){setMessage('请先完成书写、文字或表格编辑');return;}
    setWorking(true);
    try {if(!(await board.current?.flush()))return;setCanvasId(id);setMessage('正在切换画布…');}
    finally {setWorking(false);}
  }
  async function submitName() {
    if(working || !name.trim())return;
    if(document.querySelector('.note-modal,.inline-rich-editor,.nm-table-editor,.nm-table-inline,.nm-pen-preview')){setMessage('请先完成书写、文字或表格编辑');return;}
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
    <header className={androidApp?'app-header':undefined}><div className={androidApp?'app-command-scroll':'workspace-header-content'} aria-label={androidApp?'画布操作栏，可左右滑动':undefined} tabIndex={androidApp?0:undefined}><strong>never-map</strong><div className="canvas-management">
      <select aria-label="画布列表" value={canvasId} disabled={!connected || working} onChange={e=>void switchCanvas(e.target.value)}>
        {canvases.length?canvases.map(c=><option key={c.id} value={c.id}>{c.name}</option>):<option value={canvasId}>我的画布（本地）</option>}
      </select>
      <button disabled={!connected || working} onClick={()=>{setName('');setDialog('new');}}>新建画布</button>
      <button disabled={!connected || working} onClick={()=>{setName(selected?.name || '我的画布');setDialog('rename');}}>重命名</button>
    </div>{androidApp && <div className="app-board-tools" ref={setToolbarHost}/>}
    <span className="sync-status" role="status" title={message}>{message}</span><button onClick={()=>setPanel(!panel)}>云端与共享</button>
    {nativeBridge && <button className="app-menu-button" aria-label="应用菜单" onClick={()=>nativeBridge.postMessage(JSON.stringify({type:'appMenu'}))}>⋮</button>}</div></header>
    {panel && <aside><h2>个人云端画布</h2><p role="status">{message}</p><label>个人访问密码<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off"/></label>
      <button disabled={working} onClick={()=>void connect()}>连接并检查</button>
      <button disabled={!connected || working} onClick={()=>void board.current?.readCloud()}>读取云端</button>
      <button disabled={!connected || working} onClick={()=>void board.current?.overwrite()}>以本机版本覆盖云端</button>
      <button disabled={working} onClick={()=>void board.current?.recover()}>恢复本机未同步备份</button>
      {progress && <div className="connection-progress" role="status"><progress value={progress.value} max={100}/><p>{progress.label}</p></div>}
      {shareURL && <div className="share-link"><label>当前画布共享链接<input value={shareURL} readOnly onFocus={e=>e.currentTarget.select()}/></label><button onClick={async()=>{try{await navigator.clipboard.writeText(shareURL);setMessage('当前画布链接已复制');}catch{setMessage('请选中链接并手动复制');}}}>复制链接</button><small>链接持有人可编辑此工作区的画布。链接会直接打开当前选定画布。</small></div>}
      <p>登录会保存在此设备。打开或返回应用、网络恢复时自动同步；离线修改保存在本机，联网后自动补传。两端未同步修改冲突时会保留备份。</p>
      <button disabled={working} onClick={()=>void logout()}>退出云端登录</button>
      {usage && <p>{usage.reason || '免费额度正常'} · 90% 提醒，99% 暂停。</p>}
      <button onClick={()=>setPanel(false)}>关闭</button>
    </aside>}
    {dialog && <div className="canvas-name-modal"><form onSubmit={e=>{e.preventDefault();void submitName();}}><h2>{dialog==='new'?'新建画布':'重命名画布'}</h2><label>画布名称<input autoFocus maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><div><button disabled={working || !name.trim()} type="submit">保存</button><button type="button" disabled={working} onClick={()=>setDialog(null)}>取消</button></div></form></div>}
    {ready && <Board key={canvasId} ref={board} id={canvasId} name={selected?.name || '我的画布'} connected={connected} authEpoch={authEpoch} onAuthLost={authLost} locked={working} toolbarHost={toolbarHost} onStatus={setMessage}/>}
  </main>;
}

const Board=forwardRef<BoardHandle,{id:string;name:string;connected:boolean;authEpoch:number;onAuthLost:()=>void;locked:boolean;toolbarHost:HTMLElement|null;onStatus:(s:string)=>void}>(function Board({id,name,connected,authEpoch,onAuthLost,locked,toolbarHost,onStatus},ref){
  const [initial,setInitial]=useState<Drawing|null>(null);
  const [loading,setLoading]=useState(true);
  const [localReady,setLocalReady]=useState(false);
  const [apiReady,setApiReady]=useState<ExcalidrawImperativeAPI|null>(null);
  const [selection,setSelection]=useState<{id:string;version:number}|null>(null);
  const [tableSelection,setTableSelection]=useState<{id:string;version:number}|null>(null);
  const [alignEnabled,setAlignEnabled]=useState(()=>localStorage.getItem('never-map-auto-align')!=='off');
  const api=useRef<ExcalidrawImperativeAPI|null>(null);
  const latest=useRef<Drawing>(blank());
  const revision=useRef<number|null>(null);
  const pending=useRef(false),active=useRef(false),mounted=useRef(true),loadingRef=useRef(true);
  const fileKeys=useRef<Record<string,string>>({});
  const known=useRef(new Map<string,{key:string;dataURL:string}>());
  const savedSignature=useRef('');
  const sceneGate=useRef(createSceneGate()),selectionKey=useRef('');
  const selectionDirty=useRef(false),selectionTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),localTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const flight=useRef<Promise<boolean>|null>(null);
  const onlineSession=useRef(connected),recoveryFlight=useRef<Promise<void>|null>(null),retryAt=useRef(0),failures=useRef(0),blocked=useRef(''),lastUpload=useRef('');
  onlineSession.current=connected;
  const path=`canvases/${encodeURIComponent(id)}/scene`,slot=`canvas:${id}`;
  const status=(text:string)=>{if(mounted.current)onStatus(text);};
  async function persist(){await writeCache(slot,{drawing:latest.current,revision:revision.current,pending:pending.current,fileKeys:fileKeys.current,lastUploadSignature:lastUpload.current} satisfies Cache);}
  function failed(error:any){active.current=false;const policy=retryPolicy(error.status,failures.current++);blocked.current=policy.kind;retryAt.current=Date.now()+policy.delay;if(policy.kind==='auth')onAuthLost();status(policy.kind==='conflict'?'两端有未同步修改，已保留本机备份；请在云端面板选择版本':`同步暂缓：${error.message || '网络连接未完成'}；本机已保留${Number.isFinite(policy.delay)?'，将自动重连':''}`);}
  function healthy(){active.current=true;blocked.current='';retryAt.current=0;failures.current=0;}
  function show(drawing:Drawing) {
    latest.current=drawing;savedSignature.current=signature(drawing);
    sceneGate.current.reset(drawing.elements,drawing.appState.viewBackgroundColor);
    if(api.current) {api.current.addFiles(Object.values(drawing.files));api.current.updateScene({elements:drawing.elements,appState:drawing.appState,captureUpdate:CaptureUpdateAction.NEVER});}
    else setInitial(drawing);
  }
  async function decode(remote:any):Promise<{drawing:Drawing;keys:Record<string,string>}> {
    if(!remote.scene)return {drawing:blank(),keys:{}};
    const files:BinaryFiles={};
    const keys:Record<string,string>={};
    const entries=Object.entries(remote.scene.files) as [string,any][];
    const downloads=new Map<string,Promise<string>>();
    for(let offset=0;offset<entries.length;offset+=4)await Promise.all(entries.slice(offset,offset+4).map(async([fileId,entry])=>{
      const local=latest.current.files[fileId];
      let dataURL=local && fileKeys.current[fileId]===entry.key ? local.dataURL : '';
      if(!dataURL){let download=downloads.get(entry.key);if(!download){download=(async()=>{const blob=await(await request(`files/${entry.key}`)).blob();return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=reject;r.readAsDataURL(blob);});})();downloads.set(entry.key,download);}dataURL=await download;}
      const {key,...metadata}=entry;files[fileId]={...metadata,dataURL};keys[fileId]=key;
    }));
    return {drawing:{...remote.scene,files},keys};
  }
  async function applyRemote(remote:any,onlyIfClean=true) {
    if(onlyIfClean && (pending.current || flight.current))return;
    const baseline=signature(latest.current);
    const {drawing,keys}=await decode(remote);
    if(!mounted.current)return;
    if(onlyIfClean && (pending.current || flight.current || signature(latest.current)!==baseline))return;
    fileKeys.current={...fileKeys.current,...keys};
    for(const [fileId,file] of Object.entries(drawing.files))known.current.set(fileId,{key:keys[fileId],dataURL:file.dataURL});
    const wasLoading=loadingRef.current;loadingRef.current=true;
    revision.current=remote.revision;pending.current=false;show(drawing);loadingRef.current=wasLoading;await persist();healthy();
    status('已与云端同步 · 修改后约 5 秒自动保存');
  }
  function queue(){if(!timer.current)timer.current=setTimeout(()=>{timer.current=null;void sync();},5000);}
  function sync():Promise<boolean> {
    if(flight.current)return flight.current;
    if(!onlineSession.current || !active.current || !pending.current)return Promise.resolve(!pending.current || !onlineSession.current);
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
        lastUpload.current=signature(snapshot);await persist();
        const remote=await json(await request(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:revision.current || 0,scene:{elements:snapshot.elements,appState:snapshot.appState,files}})}));
        revision.current=remote.revision;
        if(signature(latest.current)===signature(snapshot))pending.current=false;
        healthy();await persist();status(pending.current?'正在保存后续修改…':'已同步到云端');
        return true;
      } catch(error){failed(error);await persist().catch(()=>{});return false;}
      finally {flight.current=null;if(pending.current && active.current && mounted.current)queue();}
    })();
    return flight.current;
  }
  async function flush(){if(timer.current){clearTimeout(timer.current);timer.current=null;}await persist();if(flight.current)await flight.current;for(let i=0;i<3 && pending.current && active.current;i++)if(!(await sync()))return false;return !pending.current || !onlineSession.current;}
  async function readCloud(force=false) {
    if(flight.current)await flight.current;
    if(pending.current && !force)return;
    loadingRef.current=true;setLoading(true);
    try {if(pending.current)await writeCache(`recovery:${id}`,{drawing:latest.current,revision:revision.current,pending:true,fileKeys:fileKeys.current});await applyRemote(await json(await request(path)),false);}
    catch(error){failed(error);}
    finally {loadingRef.current=false;if(mounted.current)setLoading(false);}
  }
  useImperativeHandle(ref,()=>({flush,flushLocal:persist,readCloud:()=>readCloud(true),overwrite:async()=>{
    try {const remote=await json(await request(path));revision.current=remote.revision;pending.current=true;healthy();await sync();}catch(error){failed(error);}
  },recover:async()=>{try{const cache=await readCache(`recovery:${id}`) as Cache|undefined;if(!cache){status('此画布没有本机恢复备份');return;}show(cache.drawing);revision.current=cache.revision;pending.current=true;active.current=false;blocked.current='conflict';retryAt.current=Infinity;await persist();status('本机备份已恢复；确认后可选择覆盖云端');}catch(error){status((error as Error).message);}}}));
  function resumeCloud():Promise<void>{
    if(recoveryFlight.current)return recoveryFlight.current;
    if(!onlineSession.current || loadingRef.current || flight.current || Date.now()<retryAt.current || document.visibilityState==='hidden')return Promise.resolve();
    if(document.querySelector('.note-modal,.inline-rich-editor,.nm-table-editor,.nm-table-inline,.nm-pen-preview') || api.current?.getAppState().editingTextElement)return Promise.resolve();
    recoveryFlight.current=(async()=>{
      try{
        if(blocked.current==='quota'){const quota=await json(await request('usage'));if(quota.paused)throw Object.assign(new Error(quota.reason),{status:429});}
        const response=await request(revision.current===null?path:`${path}?after=${revision.current}`);
        if(!mounted.current)return;
        if(response.status===204){healthy();if(pending.current)await sync();return;}
        const remote=await json(response),remoteSignature=signature(remote.scene || blank());
        const decision=resumeDecision({pending:pending.current,revision:revision.current,localSignature:signature(latest.current),lastUploadSignature:lastUpload.current},remote.revision,remoteSignature);
        if(decision==='download')await applyRemote(remote,true);
        else if(decision==='upload'){healthy();await sync();}
        else if(decision==='acknowledged' || decision==='acknowledged-upload-again'){
          revision.current=remote.revision;pending.current=decision!=='acknowledged';healthy();await persist();if(pending.current)await sync();else status('已与云端同步');
        } else {
          await writeCache(`recovery:${id}`,{drawing:latest.current,revision:revision.current,pending:true,fileKeys:fileKeys.current});
          throw Object.assign(new Error('两端有未同步修改'),{status:409});
        }
      }catch(error){failed(error);}finally{recoveryFlight.current=null;}
    })();return recoveryFlight.current;
  }
  useEffect(()=>{
    mounted.current=true;
    (async()=>{
      try {
        let cache=await readCache(slot) as Cache|undefined;
        if(!cache && id==='main'){const legacy=await readCache(shareToken?'shared-current':'current');if(legacy)cache={drawing:legacy,revision:null,pending:true,fileKeys:{}};}
        if(!mounted.current)return;
        if(cache){latest.current=cache.drawing;revision.current=cache.revision;pending.current=cache.pending;fileKeys.current=cache.fileKeys || {};lastUpload.current=cache.lastUploadSignature || '';
          if(!cache.pending)for(const [fileId,file] of Object.entries(cache.drawing.files))if(fileKeys.current[fileId])known.current.set(fileId,{key:fileKeys.current[fileId],dataURL:file.dataURL});}
        show(latest.current);status(cache?'已读取本机画布 · 正在核对云端':'正在准备画布…');
      }catch(error){show(latest.current);status('本机缓存读取失败，请保留设备数据并导出备份');}
      finally {loadingRef.current=false;if(mounted.current){setLoading(false);setLocalReady(true);}}
    })();
    const poll=setInterval(()=>void resumeCloud(),5000);
    const wake=()=>{if(blocked.current==='network')retryAt.current=0;void resumeCloud();};
    const background=()=>{if(document.visibilityState==='hidden')void persist().catch(()=>{});else wake();};
    const save=()=>void persist().catch(()=>{});
    for(const event of ['online','focus','never-map-resume'])window.addEventListener(event,wake);
    for(const event of ['pagehide','never-map-pause'])window.addEventListener(event,save);
    document.addEventListener('visibilitychange',background);
    const unload=(event:BeforeUnloadEvent)=>{if(pending.current || flight.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',unload);
    return()=>{mounted.current=false;clearInterval(poll);for(const event of ['online','focus','never-map-resume'])window.removeEventListener(event,wake);for(const event of ['pagehide','never-map-pause'])window.removeEventListener(event,save);document.removeEventListener('visibilitychange',background);window.removeEventListener('beforeunload',unload);if(timer.current)clearTimeout(timer.current);if(localTimer.current)clearTimeout(localTimer.current);if(!loadingRef.current)void persist().catch(()=>{});};
  },[]);
  useEffect(()=>{if(localReady && connected){if(blocked.current==='auth'){blocked.current='';retryAt.current=0;}void resumeCloud();}},[localReady,connected,authEpoch]);
  async function exportDrawing(){if(!api.current)return;download(new Blob([serializeAsJSON(api.current.getSceneElements(),api.current.getAppState(),api.current.getFiles(),'local')],{type:'application/json'}),`${name}.excalidraw`);}
  async function exportPNG(){if(!api.current)return;try{download(await exportToBlob({elements:api.current.getSceneElements(),appState:api.current.getAppState(),files:api.current.getFiles()}),`${name}.png`);}catch{status('PNG 导出失败，请导出画布文件');}}
  function refreshSelection(elements:readonly any[],appState:any){
    selectionDirty.current=false;
    const picked=elements.find(e=>!e.isDeleted && (appState.selectedElementIds[e.id] || appState.editingTextElement?.id===e.id) && (e.type==='text' || e.customData?.richNote)) || elements.find(e=>e.type==='text' && !e.isDeleted && e.containerId && appState.selectedElementIds[e.containerId]);
    setSelection(previous=>picked?previous&&previous.id===picked.id&&previous.version===picked.version?previous:{id:picked.id,version:picked.version}:previous?null:previous);
    const table=elements.find(e=>!e.isDeleted&&appState.selectedElementIds[e.id]&&e.customData?.richTable);
    setTableSelection(previous=>table?previous&&previous.id===table.id&&previous.version===table.version?previous:{id:table.id,version:table.version}:previous?null:previous);
  }
  useEffect(()=>()=>{if(selectionTimer.current)clearTimeout(selectionTimer.current);},[]);
  const toolbar=<div className="board-toolbar"><RichNotes api={apiReady} selection={selection} onStatus={status}/><TableTools api={apiReady} selection={tableSelection} onStatus={status}/><AutoAlign api={apiReady} enabled={alignEnabled} onToggle={()=>setAlignEnabled(previous=>{const next=!previous;localStorage.setItem('never-map-auto-align',next?'on':'off');return next;})}/><button onClick={exportDrawing}>导出备份</button><button onClick={exportPNG}>导出 PNG</button>{!androidApp && <span>{name}{loading?' · 正在读取…':''}</span>}</div>;
  return <>
    <DeviceInput api={apiReady}/>
    <HandwritingEraser api={apiReady}/>
    {androidApp?(toolbarHost?createPortal(toolbar,toolbarHost):null):toolbar}
    <section className="canvas" data-loading={loading || locked}>{initial && <Excalidraw initialData={initial} langCode="zh-CN" objectsSnapModeEnabled={alignEnabled} gridModeEnabled={alignEnabled?false:undefined} onPaste={(data,event)=>handleTablePaste(api.current,event,data.text || '',status)} excalidrawAPI={value=>{api.current=value;setApiReady(value);}} onChange={(elements,appState,files)=>{
      const contentChanged=sceneGate.current.changed(elements,appState.viewBackgroundColor),key=Object.keys(appState.selectedElementIds).join('|')+'|'+(appState.editingTextElement?.id||'');
      if(contentChanged||key!==selectionKey.current||selectionDirty.current){selectionKey.current=key;
        if(appState.selectedElementsAreBeingDragged||appState.resizingElement){selectionDirty.current=true;if(!selectionTimer.current)selectionTimer.current=setTimeout(()=>{selectionTimer.current=null;if(api.current&&mounted.current)refreshSelection(api.current.getSceneElements(),api.current.getAppState());},120);}
        else{if(selectionTimer.current){clearTimeout(selectionTimer.current);selectionTimer.current=null;}refreshSelection(elements,appState);}
      }
      if(loadingRef.current||!contentChanged)return;
      const drawing={elements:[...elements],appState:{viewBackgroundColor:appState.viewBackgroundColor,theme:appState.theme},files};
      const sig=signature(drawing);if(sig===savedSignature.current)return;savedSignature.current=sig;latest.current=drawing;pending.current=true;
      status(active.current?'有修改 · 约 5 秒后自动上传':'本机内容已修改 · 云端未同步');
      if(localTimer.current)clearTimeout(localTimer.current);localTimer.current=setTimeout(()=>void persist().catch(()=>status('本地保存失败，请立即导出备份')),500);
      if(active.current)queue();
    }}/>}</section>
  </>;
});
