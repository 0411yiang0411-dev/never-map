import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, exportToBlob, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, BinaryFiles } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import './style.css';

(window as any).EXCALIDRAW_ASSET_PATH = '/';
type Drawing = { elements: any[]; appState: any; files: BinaryFiles };
const openDB = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('never-map', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('drawing');
  req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
});
async function localRead(): Promise<Drawing | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drawing'); const req = tx.objectStore('drawing').get('current');
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); tx.oncomplete = () => db.close();
  });
}
async function localWrite(drawing: Drawing) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('drawing', 'readwrite'); tx.objectStore('drawing').put(drawing, 'current');
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
const hex = (a: ArrayBuffer) => [...new Uint8Array(a)].map(x => x.toString(16).padStart(2, '0')).join('');
const json = (response: Response): Promise<any> => response.json();
function App() {
  const [initial, setInitial] = useState<Drawing | null | undefined>(undefined);
  const [generation, setGeneration] = useState(0);
  const [message, setMessage] = useState('正在读取本地画布…');
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [panel, setPanel] = useState(false);
  const [token, setToken] = useState(sessionStorage.getItem('never-map-token') || '');
  const [usage, setUsage] = useState<any>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const latest = useRef<Drawing | null>(null);
  const lastSignature = useRef('');
  const revision = useRef<number | null>(null);
  const cloudActive = useRef(false);
  const syncing = useRef(false);
  const dirty = useRef(false);
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownFiles = useRef(new Map<string, { key: string; dataURL: string }>());

  async function request(path: string, options: RequestInit = {}) {
    const res = await fetch(`/api/${path}`, { ...options, headers: { ...options.headers, Authorization: `Bearer ${sessionStorage.getItem('never-map-token') || ''}` } });
    if (!res.ok) { const body = await json(res); throw new Error(body.error || '请求失败'); }
    return res;
  }
  async function refreshUsage() {
    const info = await json(await request('usage')); setUsage(info);
    if (info.paused) { cloudActive.current = false; throw new Error(info.reason); }
    if (info.warning) setMessage('提醒：免费额度剩余不足 10%，请检查用量');
    return info;
  }
  useEffect(() => {
    localRead().then(value => { setInitial(value); latest.current = value; setMessage('本地自动保存 · 云端尚未连接'); })
      .catch(() => { setInitial(null); setMessage('本地存储不可用，请及时导出备份'); });
    fetch('/api/config').then(json).then(v => setCloudAvailable(v.cloudEnabled)).catch(() => {});
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current || syncing.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('beforeunload', unload); if (localTimer.current) clearTimeout(localTimer.current); if (cloudTimer.current) clearTimeout(cloudTimer.current); };
  }, []);

  async function sync() {
    if (!cloudActive.current || syncing.current || !latest.current || revision.current === null) return;
    syncing.current = true;
    const drawing = latest.current;
    setMessage('正在保存到云端…');
    try {
      await refreshUsage();
      const files: Record<string, any> = {};
      for (const [id, file] of Object.entries(drawing.files)) {
        const cached = knownFiles.current.get(id);
        let key = cached?.dataURL === file.dataURL ? cached.key : undefined;
        if (!key) {
          const blob = await (await fetch(file.dataURL)).blob();
          const data = await blob.arrayBuffer();
          key = hex(await crypto.subtle.digest('SHA-256', data));
          await request(`files/${key}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: data });
          knownFiles.current.set(id, { key, dataURL: file.dataURL });
        }
        const { dataURL: _dataURL, ...metadata } = file;
        files[id] = { ...metadata, key };
      }
      const appState = { viewBackgroundColor: drawing.appState.viewBackgroundColor, theme: drawing.appState.theme };
      const result = await json(await request('scene', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: revision.current, scene: { elements: drawing.elements, appState, files } }) }));
      revision.current = result.revision;
      const info = await refreshUsage();
      setMessage(info.warning ? '已保存 · 提醒：免费额度剩余不足 10%' : '已保存到云端');
      if (latest.current !== drawing) cloudTimer.current = setTimeout(sync, 15000);
    } catch (error) { cloudActive.current = false; setMessage(`云端暂停：${(error as Error).message}；继续本地编辑`); }
    finally { syncing.current = false; }
  }

  async function connect() {
    sessionStorage.setItem('never-map-token', token);
    try {
      await refreshUsage();
      const result = await json(await request('scene'));
      revision.current = result.revision;
      if (result.scene) {
        setMessage('云端已有画布。请先导出本地备份，再点击“读取云端”或“以本地覆盖云端”。');
      } else { cloudActive.current = true; await sync(); }
    } catch (error) { setMessage((error as Error).message); }
  }
  async function loadCloud() {
    try {
      await refreshUsage();
      const result = await json(await request('scene'));
      if (!result.scene) { setMessage('云端还没有画布，请连接后保存'); return; }
      const files: BinaryFiles = {};
      for (const [id, entry] of Object.entries(result.scene.files) as [string, any][]) {
        const blob = await (await request(`files/${entry.key}`)).blob();
        const dataURL = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(blob); });
        const { key, ...metadata } = entry;
        files[id] = { ...metadata, dataURL }; knownFiles.current.set(id, { key, dataURL });
      }
      const drawing = { ...result.scene, files };
      await localWrite(drawing); latest.current = drawing; revision.current = result.revision;
      lastSignature.current = ''; setInitial(drawing); setGeneration(x => x + 1);
      cloudActive.current = true; setMessage('已读取云端画布 · 自动保存已开启');
    } catch (error) { cloudActive.current = false; setMessage((error as Error).message); }
  }
  async function backup() {
    if (!api.current) return;
    const blob = new Blob([serializeAsJSON(api.current.getSceneElements(), api.current.getAppState(), api.current.getFiles(), 'local')], { type: 'application/json' });
    download(blob, `never-map-${new Date().toISOString().slice(0, 10)}.excalidraw`);
  }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function png() {
    if (!api.current) return;
    try { download(await exportToBlob({ elements: api.current.getSceneElements(), appState: api.current.getAppState(), files: api.current.getFiles() }), 'never-map.png'); }
    catch { setMessage('图片导出失败，请使用画布文件备份'); }
  }

  return <main>
    <header><strong>never-map</strong><span role="status">{message}</span><div><button onClick={backup}>导出备份</button><button onClick={png}>导出 PNG</button><button onClick={() => setPanel(!panel)}>云端与额度</button></div></header>
    {panel && <aside>
      <h2>个人云端画布</h2>
      {!cloudAvailable ? <p>云端尚未启用。账号授权、免费计划和用量核实完成前，保持本地编辑模式。</p> : <>
        <label>个人访问密钥<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /></label>
        <button onClick={connect}>连接并检查</button><button onClick={loadCloud}>读取云端</button>
        <button onClick={async () => { if (revision.current === null) { setMessage('请先连接并检查云端'); return; } cloudActive.current = true; await sync(); }}>以本地覆盖云端</button>
      </>}
      {usage && <><p role="alert">{usage.reason || '当前项目计数在安全范围内'}</p><ul>{Object.entries(usage.limits).map(([key, limit]) => <li key={key}>{({ bytes: '存储字节', class_a: 'A 类操作', class_b: 'B 类操作' } as any)[key]}：{Number(usage.usage[key]).toLocaleString()} / {Number(limit).toLocaleString()}（剩余 {(Number(usage.remaining[key]) * 100).toFixed(1)}%）</li>)}</ul></>}
      <p>90% 提醒，99% 提前暂停；每月用量未重新核实也暂停。停止云端后仍可本地编辑、导出。</p>
      <small>这里的提醒在页面内显示。项目计数不能覆盖同账号其他程序的后续用量。</small>
      <button onClick={() => setPanel(false)}>关闭</button>
    </aside>}
    <section className="canvas">{initial !== undefined && <Excalidraw key={generation} langCode="zh-CN" initialData={initial || undefined} excalidrawAPI={value => { api.current = value; }} onChange={(elements, appState, files) => {
      const signature = elements.map(e => `${e.id}:${e.version}:${e.isDeleted}`).join('|') + appState.viewBackgroundColor + Object.keys(files).sort().join('|');
      if (signature === lastSignature.current) return; lastSignature.current = signature;
      const drawing = { elements: [...elements], appState: { viewBackgroundColor: appState.viewBackgroundColor, theme: appState.theme }, files };
      latest.current = drawing; dirty.current = true;
      if (localTimer.current) clearTimeout(localTimer.current);
      localTimer.current = setTimeout(() => { localWrite(drawing).then(() => { if (latest.current === drawing) dirty.current = false; if (!cloudActive.current) setMessage('已保存到此浏览器 · 可导出备份'); }).catch(() => setMessage('本地保存失败，请立即导出备份')); }, 1000);
      if (cloudActive.current && !cloudTimer.current) cloudTimer.current = setTimeout(() => { cloudTimer.current = null; void sync(); }, 15000);
    }} />}</section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
