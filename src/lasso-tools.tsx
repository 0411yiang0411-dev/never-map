import {useEffect,useState} from 'react';
import {CaptureUpdateAction,getCommonBounds,newElementWith} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {enclosedBounds} from './selection-geometry.mjs';

export function LassoTools({api}:{api:ExcalidrawImperativeAPI|null}){
  const [active,setActive]=useState(false),[open,setOpen]=useState(false),[count,setCount]=useState(0);
  useEffect(()=>{
    if(!api)return;let polygon:number[][]=[],pointer=-1,overlay:SVGSVGElement|null=null,path:SVGPathElement|null=null;
    const unsubscribe=api.onChange((elements,app)=>{setActive(app.activeTool.type==='custom'&&app.activeTool.customType==='lasso');setCount(elements.filter(e=>!e.isDeleted&&app.selectedElementIds[e.id]).length);});
    const stop=(e:PointerEvent)=>{e.preventDefault();e.stopImmediatePropagation();};
    const point=(e:PointerEvent)=>{const app=api.getAppState();return [(e.clientX-app.offsetLeft)/app.zoom.value-app.scrollX,(e.clientY-app.offsetTop)/app.zoom.value-app.scrollY];};
    const down=(e:PointerEvent)=>{const app=api.getAppState();if(e.pointerType==='touch'||e.button!==0||app.activeTool.type!=='custom'||app.activeTool.customType!=='lasso'||!(e.target instanceof Element)||!e.target.matches('.excalidraw canvas'))return;
      stop(e);pointer=e.pointerId;polygon=[point(e)];const ns='http://www.w3.org/2000/svg';overlay=document.createElementNS(ns,'svg');overlay.classList.add('nm-lasso-preview');path=document.createElementNS(ns,'path');overlay.appendChild(path);document.body.appendChild(overlay);try{e.target.setPointerCapture(pointer);}catch{}
    };
    const move=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;stop(e);polygon.push(point(e));const app=api.getAppState();path?.setAttribute('d',polygon.map((p,i)=>`${i?'L':'M'}${(p[0]+app.scrollX)*app.zoom.value+app.offsetLeft},${(p[1]+app.scrollY)*app.zoom.value+app.offsetTop}`).join(' ')+'Z');};
    const up=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;stop(e);if(e.type==='pointerup'&&polygon.length>2){const elements=api.getSceneElements(),map=new Map(elements.map(e=>[e.id,e])),ids:Record<string,true>={};
        for(const element of elements)if(!element.isDeleted&&!element.locked&&enclosedBounds(getCommonBounds([element],map),polygon))ids[element.id]=true;
        // Keep groups and bound text together when the enclosing shape is picked.
        const groups=new Set(elements.filter(e=>ids[e.id]).flatMap(e=>e.groupIds));
        for(const e of elements)if(!e.isDeleted&&!e.locked&&(e.groupIds.some(g=>groups.has(g))||(e.type==='text'&&e.containerId&&ids[e.containerId])))ids[e.id]=true;
        api.setActiveTool({type:'selection'});api.updateScene({appState:{selectedElementIds:ids},captureUpdate:CaptureUpdateAction.NEVER});setOpen(Object.keys(ids).length>0);
      }pointer=-1;overlay?.remove();overlay=null;};
    for(const [name,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up]] as const)document.addEventListener(name,fn,{capture:true,passive:false});
    return()=>{unsubscribe();overlay?.remove();for(const [name,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up]] as const)document.removeEventListener(name,fn,true);};
  },[api]);
  function align(axis:number,edge:number){if(!api)return;const elements=api.getSceneElements(),app=api.getAppState(),picked=elements.filter(e=>app.selectedElementIds[e.id]),map=new Map(elements.map(e=>[e.id,e]));if(picked.length<2)return;
    const all=getCommonBounds(picked,map),at=(box:readonly number[])=>edge===1?(box[axis]+box[axis+2])/2:box[axis+edge];const target=at(all),moves=new Map(picked.map(e=>[e.id,target-at(getCommonBounds([e],map))]));
    api.updateScene({elements:elements.map(e=>moves.has(e.id)?newElementWith(e,{[axis===0?'x':'y']:(axis===0?e.x:e.y)+moves.get(e.id)!}):e),captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  }
  return <><button aria-label="套索选择" aria-pressed={active} disabled={!api} onClick={()=>api?.setActiveTool(active?{type:'selection'}:{type:'custom',customType:'lasso'})}>♧ 套索</button>
    {open&&count>0&&<aside className="nm-selection-sidebar" aria-label="选区编辑"><button className="nm-close" aria-label="关闭选区编辑" onClick={()=>setOpen(false)}>×</button><h2>已选择 {count} 个元素</h2><p>拖动选区时自动吸附附近边框。Ctrl / Command 临时关闭吸附。</p><div className="nm-align-grid">{[['左对齐',0,0],['水平居中',0,1],['右对齐',0,2],['顶端对齐',1,0],['垂直居中',1,1],['底端对齐',1,2]].map(([label,a,b])=><button key={label} disabled={count<2} onClick={()=>align(Number(a),Number(b))}>{label}</button>)}</div></aside>}</>;
}
