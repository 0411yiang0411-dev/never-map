import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, exportToBlob, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, BinaryFiles } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import './style.css';
import './cloud.css';

(window as any).EXCALIDRAW_ASSET_PATH = '/';
type Drawing = { elements: any[]; appState: any; files: BinaryFiles };
const sharedToken = new URLSearchParams(window.location.hash.slice(1)).get('share');
const localSlot = sharedToken ? 'shared-current' : 'current';
const signatureOf = (elements: readonly any[], appState: any, files: BinaryFiles) => elements.map(e => `${e.id}:${e.version}:${e.isDeleted}`).join('|') + appState.viewBackgroundColor + Object.keys(files).sort().join('|');
const openDB = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('never-map', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('drawing');
  req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
});
async function localRead(): Promise<Drawing | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drawing'); const req = tx.objectStore('drawing').get(localSlot);
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); tx.oncomplete = () => db.close();
  });
}
async function localWrite(drawing: Drawing) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('drawing', 'readwrite'); tx.objectStore('drawing').put(drawing, localSlot);
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
  const [panel, setPanel] = useState(!!sharedToken);
  const [token, setToken] = useState(sharedToken || sessionStorage.getItem('never-map-token') || '');
  const [shareURL, setShareURL] = useState(sharedToken ? window.location.href : '');
  const [progress, setProgress] = useState<{value: number; label: string; failed?: boolean} | null>(null);
  const [connecting, setConnecting] = useState(!!sharedToken);
  const [usage, setUsage] = useState<any>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const latest = useRef<Drawing | null>(null);
  const lastSignature = useRef('');
  const revision = useRef<number | null>(null);
  const cloudActive = useRef(false);
  const syncing = useRef(false);
  const dirty = useRef(false);
  const cloudDirty = useRef(false);
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
    localRead().then(async value => {
      setInitial(value); latest.current = value; setMessage('本地自动保存 · 云端尚未连接');
      if (sharedToken) {
        sessionStorage.setItem('never-map-token', sharedToken);
        if (value?.elements.length) {
          const db = await openDB();
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('drawing', 'readwrite'); tx.objectStore('drawing').put(value, 'shared-recovery');
            tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
          });
        }
        await loadCloud();
      }
    })
      .catch(() => { setInitial(null); setConnecting(false); setMessage('本地存储不可用，请及时导出备份'); });
    fetch('/api/config').then(json).then(v => setCloudAvailable(v.cloudEnabled)).catch(() => {});
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current || cloudDirty.current || syncing.current) { event.preventDefault(); event.returnValue = ''; } };
    const poll = setInterval(async () => {
      if (!cloudActive.current || cloudDirty.current || dirty.current || syncing.current || document.visibilityState !== 'visible') return;
      try {
        const remote = await json(await request('scene'));
        if (remote.revision !== revision.current) await loadCloud(remote);
      } catch (error) { cloudActive.current = false; setMessage(`云端暂停：${(error as Error).message}`); }
    }, 20000);
    window.addEventListener('beforeunload', unload);
    return () => { clearInterval(poll); window.removeEventListener('beforeunload', unload); if (localTimer.current) clearTimeout(localTimer.current); if (cloudTimer.current) clearTimeout(cloudTimer.current); };
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
      if (latest.current === drawing) cloudDirty.current = false;
      const info = await refreshUsage();
      setMessage(info.warning ? '已保存 · 提醒：免费额度剩余不足 10%' : '已保存到云端');
      if (latest.current !== drawing) {
        if (cloudTimer.current) clearTimeout(cloudTimer.current);
        cloudTimer.current = setTimeout(() => { cloudTimer.current = null; void sync(); }, 3000);
      }
    } catch (error) { cloudActive.current = false; setMessage(`云端暂停：${(error as Error).message}；继续本地编辑`); }
    finally { syncing.current = false; }
  }

  async function connect() {
    if (connecting) return;
    setConnecting(true); setProgress({ value: 10, label: '正在验证访问密码…' });
    sessionStorage.setItem('never-map-token', token);
    try {
      await refreshUsage();
      setProgress({ value: 45, label: '密码已验证，正在检查画布…' });
      const result = await json(await request('scene'));
      revision.current = result.revision;
      setProgress({ value: 75, label: '正在获取常驻共享链接…' });
      const share = await json(await request('share')); setShareURL(share.url);
      if (result.scene) {
        setMessage('云端已有画布。请先导出本地备份，再点击“读取云端”或“以本地覆盖云端”。');
      } else { cloudActive.current = true; await sync(); if (!cloudActive.current) throw new Error('云端保存失败，请检查额度或连接状态'); }
      setProgress({ value: 100, label: '连接完成 · 共享链接可在其他设备打开' });
    } catch (error) { setMessage((error as Error).message); setProgress({ value: 0, label: (error as Error).message, failed: true }); }
    finally { setConnecting(false); }
  }
  async function loadCloud(remote?: any) {
    if (syncing.current) { setMessage('正在保存当前画布，请完成后再读取云端'); return; }
    cloudActive.current = false;
    if (cloudTimer.current) { clearTimeout(cloudTimer.current); cloudTimer.current = null; }
    if (localTimer.current) { clearTimeout(localTimer.current); localTimer.current = null; }
    setConnecting(true); setProgress({ value: 10, label: '正在连接共享画布…' });
    try {
      await refreshUsage();
      setProgress({ value: 30, label: '正在读取云端画布…' });
      const result = remote || await json(await request('scene'));
      if (!result.scene) {
        revision.current = result.revision; cloudActive.current = true; cloudDirty.current = true;
        await sync(); setProgress({ value: 100, label: '共享画布已连接' }); return;
      }
      const files: BinaryFiles = {};
      let loaded = 0; const total = Object.keys(result.scene.files).length;
      for (const [id, entry] of Object.entries(result.scene.files) as [string, any][]) {
        const blob = await (await request(`files/${entry.key}`)).blob();
        const dataURL = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(blob); });
        const { key, ...metadata } = entry;
        files[id] = { ...metadata, dataURL }; knownFiles.current.set(id, { key, dataURL });
        setProgress({ value: 30 + Math.round(++loaded / total * 55), label: `正在读取图片 ${loaded} / ${total}…` });
      }
      const drawing = { ...result.scene, files };
      await localWrite(drawing); latest.current = drawing; revision.current = result.revision;
      lastSignature.current = signatureOf(drawing.elements, drawing.appState, drawing.files);
      dirty.current = false; cloudDirty.current = false;
      setInitial(drawing); setGeneration(x => x + 1);
      cloudActive.current = true; setMessage('已读取云端画布 · 自动保存已开启');
      if (!shareURL) { const share = await json(await request('share')); setShareURL(share.url); }
      setProgress({ value: 100, label: '画布已连接 · 可直接编辑并自动保存' });
    } catch (error) { cloudActive.current = false; setMessage((error as Error).message); setProgress({ value: 0, label: (error as Error).message, failed: true }); }
    finally { setConnecting(false); }
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
        <label>个人访问密码<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /></label>
        <button disabled={connecting} onClick={connect}>连接并检查</button><button disabled={connecting} onClick={() => loadCloud()}>读取云端</button>
        <button disabled={connecting} onClick={async () => { if (revision.current === null) { setMessage('请先连接并检查云端'); return; } cloudActive.current = true; await sync(); }}>以本地覆盖云端</button>
      </>}
      {progress && <div className="connection-progress" role="status"><progress max={100} value={progress.value} aria-label="连接进度"/><p className={progress.failed ? 'error' : ''}>{progress.label}</p></div>}
      {shareURL && <div className="share-link"><label>常驻共享链接<input aria-label="常驻共享链接" value={shareURL} readOnly onFocus={e => e.currentTarget.select()} /></label><button onClick={async () => { try { await navigator.clipboard.writeText(shareURL); setMessage('共享链接已复制'); } catch { setMessage('请选中链接并手动复制'); } }}>复制链接</button><small>拥有链接的人可编辑同一画布，无需重复输入密码。链接持续有效。</small></div>}
      {usage && <><p role="alert">{usage.reason || '当前项目计数在安全范围内'}</p><ul>{Object.entries(usage.limits).map(([key, limit]) => <li key={key}>{({ bytes: '存储字节', class_a: 'A 类操作', class_b: 'B 类操作' } as any)[key]}：{Number(usage.usage[key]).toLocaleString()} / {Number(limit).toLocaleString()}（剩余 {(Number(usage.remaining[key]) * 100).toFixed(1)}%）</li>)}</ul></>}
      <p>90% 提醒，99% 提前暂停；用量核验失败时也暂停。停止云端后仍可本地编辑、导出。</p>
      <small>额度保护同时适用于密码访问和共享链接。</small>
      <button onClick={() => setPanel(false)}>关闭</button>
    </aside>}
    <section className="canvas" data-loading={connecting}>{initial !== undefined && <Excalidraw key={generation} langCode="zh-CN" initialData={initial || undefined} excalidrawAPI={value => { api.current = value; }} onChange={(elements, appState, files) => {
      const signature = signatureOf(elements, appState, files);
      if (signature === lastSignature.current) return; lastSignature.current = signature;
      const drawing = { elements: [...elements], appState: { viewBackgroundColor: appState.viewBackgroundColor, theme: appState.theme }, files };
      latest.current = drawing; dirty.current = true;
      if (cloudActive.current) cloudDirty.current = true;
      if (localTimer.current) clearTimeout(localTimer.current);
      localTimer.current = setTimeout(() => { localWrite(drawing).then(() => { if (latest.current === drawing) dirty.current = false; if (!cloudActive.current) setMessage('已保存到此浏览器 · 可导出备份'); }).catch(() => setMessage('本地保存失败，请立即导出备份')); }, 1000);
      if (cloudActive.current && !cloudTimer.current) cloudTimer.current = setTimeout(() => { cloudTimer.current = null; void sync(); }, 3000);
    }} />}</section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
