import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import './pen-settings.css';

export function PenSettings({api,settings,onChange}:{api:ExcalidrawImperativeAPI|null;settings:any;onChange:(value:any)=>void}){
  const [target,setTarget]=useState<Element|null>(null),[active,setActive]=useState(false);
  useEffect(()=>{if(!api)return;const find=()=>{setActive(api.getAppState().activeTool.type==='freedraw');setTarget(previous=>{const next=document.querySelector('.excalidraw .selected-shape-actions .panelColumn');return next===previous?previous:next;});};find();const unsubscribe=api.onChange(find),observer=new MutationObserver(find);observer.observe(document.body,{childList:true,subtree:true});return()=>{unsubscribe();observer.disconnect();};},[api]);
  if(!api||!active||!target)return null;
  const change=(patch:any)=>onChange({...settings,...patch});
  return createPortal(<section className={`nm-pen-settings ${api.getAppState().theme==='dark'?'dark':''}`} aria-label="触控笔压感设置"><h3>触控笔</h3>
    <label><span>启用压感</span><input type="checkbox" checked={settings.enabled} onChange={e=>change({enabled:e.target.checked})}/></label>
    <label htmlFor="nm-pen-width">笔画粗细 <output>{settings.width} px</output></label><input id="nm-pen-width" aria-label="笔画粗细" type="range" min="0.5" max="24" step="0.5" value={settings.width} onChange={e=>change({width:Number(e.target.value)})}/>
    <label htmlFor="nm-pen-sensitivity">压感灵敏度 <output>{settings.sensitivity.toFixed(2)}</output></label><input id="nm-pen-sensitivity" aria-label="压感灵敏度" type="range" min="0.25" max="3" step="0.05" disabled={!settings.enabled} value={settings.sensitivity} onChange={e=>change({sensitivity:Number(e.target.value)})}/>
    <label htmlFor="nm-pen-minimum">最细比例 <output>{Math.round(settings.minimum*100)}%</output></label><input id="nm-pen-minimum" aria-label="最细比例" type="range" min="0.05" max="1" step="0.05" disabled={!settings.enabled} value={settings.minimum} onChange={e=>change({minimum:Number(e.target.value)})}/>
    <small>粗细为最大线宽；灵敏度越高，轻压越容易写粗。关闭压感使用固定线宽。设置用于下一笔，不改变已有笔画。</small>
  </section>,target);
}
