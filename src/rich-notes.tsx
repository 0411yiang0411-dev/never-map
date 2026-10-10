import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { escapeHTML, layoutNote, modelHTML } from './rich-layout.mjs';
import './rich-notes.css';
import {SideTextTools} from './side-text-tools';

type Run = { text: string; bold?: boolean; underline?: boolean; highlight?: boolean };
type Block = { type: 'paragraph'|'bullet'|'number'|'todo'|'rule'; runs?: Run[]; checked?: boolean; number?: number };
export function readHTML(html: string): Block[] {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const blocks: Block[] = [];
  const runs = (node: Node, inherited: Omit<Run,'text'> = {}): Run[] => {
    if (node.nodeType === Node.TEXT_NODE) return [{ ...inherited, text: node.textContent || '' }];
    if (!(node instanceof HTMLElement) || ['SCRIPT','STYLE','IFRAME','IMG','SVG','OBJECT'].includes(node.tagName)) return [];
    if (node.tagName === 'INPUT') return [];
    if (node.tagName === 'BR') return [{ ...inherited, text: '\n' }];
    const style = { ...inherited,
      bold: inherited.bold || ['B','STRONG'].includes(node.tagName) || /bold|[6-9]00/.test(node.style.fontWeight),
      underline: inherited.underline || node.tagName === 'U' || node.style.textDecoration.includes('underline'),
      highlight: inherited.highlight || node.tagName === 'MARK' || (!!node.style.backgroundColor && !['transparent','rgba(0, 0, 0, 0)'].includes(node.style.backgroundColor)) };
    return [...node.childNodes].flatMap(child => runs(child, style));
  };
  const walk = (node: Node) => {
    if (node instanceof HTMLElement && ['SCRIPT','STYLE','IFRAME','SVG','IMG','OBJECT'].includes(node.tagName)) return;
    if (node instanceof HTMLElement && node.tagName === 'HR') { blocks.push({ type: 'rule' }); return; }
    if (node instanceof HTMLElement && ['UL','OL'].includes(node.tagName)) {
      let index = Number(node.getAttribute('start')) || 1;
      for (const child of [...node.children]) {
        if (child.tagName !== 'LI') continue;
        blocks.push({ type: node.tagName === 'OL' ? 'number' : 'bullet', number: index++, runs: runs(child) });
      }
      return;
    }
    if (node instanceof HTMLElement && node.querySelector(':scope > div,:scope > p,:scope > ul,:scope > ol,:scope > hr')) {
      for (const child of [...node.childNodes]) walk(child); return;
    }
    const checkbox = node instanceof HTMLElement ? node.querySelector('input[type=checkbox]') : null;
    const content=runs(node);
    if(checkbox && content[0]?.text.trim()==='')content.shift();
    blocks.push({ type: checkbox ? 'todo' : 'paragraph', checked: checkbox ? (checkbox as HTMLInputElement).checked : undefined, runs: content });
  };
  for (const node of [...root.childNodes]) walk(node);
  return blocks.length ? blocks : [{ type: 'paragraph', runs: [{ text: '' }] }];
}

export const sourceModel = (source: any): Block[] => source?.customData?.richNote?.blocks ||
  String(source?.originalText || source?.text || '').split('\n').map(text => ({ type: 'paragraph', runs: [{ text }] }));

export async function writeNote(api: ExcalidrawImperativeAPI, source: any, blocks: Block[], width: number, fontSize: number,inline=false) {
  const elements = api.getSceneElementsIncludingDeleted();
  const current = source && elements.find(e => e.id === source.id && !e.isDeleted);
  if (source && !current) throw new Error('这段文本已被删除，请重新选择');
  const container: any = source?.containerId ? elements.find(e => e.id === source.containerId && !e.isDeleted) : null;
  const color = source?.customData?.richNote?.color || source?.strokeColor || (api.getAppState().theme === 'dark' ? '#f5f5f5' : '#1e1e1e');
  const context = document.createElement('canvas').getContext('2d')!;
  const rendered = layoutNote(blocks, { width, fontSize, color, padding:inline?0:12,measure: (char: string, bold: boolean, size: number) => {
    context.font = `${bold ? 700 : 400} ${size}px Arial,Microsoft YaHei,sans-serif`; return context.measureText(char).width;
  }});
  const raw = new TextEncoder().encode(rendered.svg);
  if (raw.byteLength > 1_900_000) throw new Error('格式文本过大，请拆分为多段');
  const fileId = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map(x => x.toString(16).padStart(2,'0')).join('');
  const dataURL = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject;
    reader.readAsDataURL(new Blob([rendered.svg], { type: 'image/svg+xml' }));
  });
  const liveElements = api.getSceneElementsIncludingDeleted();
  const liveSource = source && liveElements.find(e => e.id === source.id && !e.isDeleted);
  if (source && (!liveSource || liveSource.version !== source.version)) throw new Error('这段文本已更新，请重新选择后编辑，避免覆盖其他修改');
  api.addFiles([{ id: fileId as any, dataURL: dataURL as any, mimeType: 'image/svg+xml', created: Date.now() }]);
  const app = api.getAppState();
  const x = source ? container && !inline ? container.x + 16 : source.x : (window.innerWidth / 2 - app.offsetLeft) / app.zoom.value - app.scrollX - width / 2;
  const y = source ? container && !inline ? container.y + 16 : source.y : (window.innerHeight / 2 - app.offsetTop) / app.zoom.value - app.scrollY - rendered.height / 2;
  const richNote = { blocks, width: rendered.width, fontSize, color, formatVersion: 1,inline };
  const [fresh] = convertToExcalidrawElements([{ type: 'image', x, y, width: rendered.width, height: rendered.height, fileId, status: 'saved', scale: [1,1], customData: { richNote } } as any]);
  const image: any = source?.type === 'image' ? { ...current, width: rendered.width, height: rendered.height, fileId, customData: { ...current?.customData, richNote }, version: current!.version + 1, versionNonce: Math.floor(Math.random()*2147483647), updated: Date.now() } : { ...fresh, angle: source?.angle || 0, groupIds: source?.groupIds || [] };
  const next = liveElements.map((e: any) => {
    if (source?.type === 'image' && e.id === source.id) return image;
    if (source?.type === 'text' && e.id === source.id) return { ...e, isDeleted: true, version: e.version + 1, versionNonce: Math.floor(Math.random()*2147483647), updated: Date.now() };
    if (container && e.id === container.id) return { ...e, height: Math.max(e.height, rendered.height + 32), boundElements: e.boundElements?.filter((bound: any) => bound.id !== source.id), version: e.version + 1, versionNonce: Math.floor(Math.random()*2147483647), updated: Date.now() };
    return e;
  });
  if (source?.type !== 'image') next.push(image);
  api.updateScene({ elements: next, appState: { selectedElementIds: { [image.id]: true } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  return image;
}

export function RichNotes({ api, selection, onStatus }: { api: ExcalidrawImperativeAPI|null; selection: {id: string; version: number}|null; onStatus: (text:string)=>void }) {
  return <SideTextTools api={api} selection={selection} onStatus={onStatus}/>;
}

function NoteEditor({ api, source, onClose, onStatus }: {api: ExcalidrawImperativeAPI; source:any; onClose:()=>void; onStatus:(s:string)=>void}) {
  const editor = useRef<HTMLDivElement>(null);
  const range = useRef<Range|null>(null);
  const [saving,setSaving] = useState(false);
  const draftDirty = useRef(false);
  const container: any = source?.containerId ? api.getSceneElements().find(e=>e.id===source.containerId) : null;
  const [width,setWidth] = useState(Math.max(240,Math.round(source?.type === 'image' ? source.width : container ? container.width - 32 : 440)));
  const [fontSize,setFontSize] = useState(source?.customData?.richNote?.fontSize || source?.fontSize || 22);
  useEffect(() => { editor.current!.innerHTML = modelHTML(sourceModel(source)); editor.current!.focus(); }, []);
  useEffect(() => {
    const warn = (event:BeforeUnloadEvent) => { if (draftDirty.current) { event.preventDefault(); event.returnValue=''; } };
    window.addEventListener('beforeunload',warn); return () => window.removeEventListener('beforeunload',warn);
  },[]);
  function saveRange() { const selection = window.getSelection(); if (selection?.rangeCount && editor.current?.contains(selection.anchorNode)) range.current = selection.getRangeAt(0).cloneRange(); }
  function restoreRange() { editor.current!.focus(); if (range.current) { const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range.current); } }
  function format(command:string, value?:string) { restoreRange(); document.execCommand(command,false,value); draftDirty.current=true; saveRange(); }
  async function apply() {
    setSaving(true);
    try {
      const blocks = readHTML(editor.current!.innerHTML);
      if (blocks.flatMap(b => b.runs || []).reduce((sum,r)=>sum+r.text.length,0) > 3000) throw new Error('文本过长，请拆分为多段（每段最多 3000 字）');
      await writeNote(api,source,blocks,width,fontSize); onStatus('格式文本已更新 · 支持保存和共享'); onClose();
    } catch(error) { onStatus((error as Error).message); setSaving(false); }
  }
  return createPortal(<div className="note-modal" onKeyDown={e => { e.stopPropagation(); if (e.key==='Escape') onClose(); }}>
    <div className="note-dialog" role="dialog" aria-modal="true" aria-label="格式化文本">
      <div className="note-dialog-heading"><h2>格式化文本</h2><button onClick={onClose}>关闭</button></div>
      <div className="note-toolbar" role="toolbar" aria-label="文字格式">
        {[['高亮','hiliteColor','#ffe58f'],['粗体','bold'],['下划线','underline'],['分割线','insertHorizontalRule'],['项目符号','insertUnorderedList'],['数字编号','insertOrderedList']].map(([label,command,value]) => <button key={command} onMouseDown={e=>e.preventDefault()} onClick={()=>format(command,value)}>{label}</button>)}
        <button onMouseDown={e=>e.preventDefault()} onClick={()=>format('insertHTML','<div data-todo="true"><input type="checkbox" contenteditable="false"> <span>待办事项</span></div><div><br></div>')}>待办勾选</button>
      </div>
      <div className="note-options"><label>宽度 <input type="number" min="240" max="1200" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label><label>字号 <input type="number" min="12" max="64" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}/></label></div>
      <div ref={editor} className="note-editor" style={{fontSize,width,maxWidth:'100%'}} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="文本内容" onMouseUp={saveRange} onKeyUp={saveRange} onInput={()=>{draftDirty.current=true;}}
        onClick={e=>{ const target=e.target as HTMLInputElement; if (target.matches('input[type=checkbox]')) { target.toggleAttribute('checked',target.checked); draftDirty.current=true; saveRange(); } }}
        onPaste={e=>{ e.preventDefault(); const html=e.clipboardData.getData('text/html') || escapeHTML(e.clipboardData.getData('text/plain')).replace(/\n/g,'<br>'); format('insertHTML',modelHTML(readHTML(html))); }} />
      <p className="note-help">选中文字后设置高亮、粗体或下划线。待办可直接勾选；选择画布中的格式文本也可勾选待办。</p>
      <button className="note-apply" disabled={saving} onClick={apply}>{saving ? '正在更新…' : '应用到画布'}</button>
    </div>
  </div>,document.body);
}
