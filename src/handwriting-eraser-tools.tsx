import {useEffect} from 'react';
import {CaptureUpdateAction,newElementWith} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {isHandwriting,handwritingPoints,strokeHit} from './handwriting-eraser.mjs';
export function HandwritingEraser({api}:{api:ExcalidrawImperativeAPI|null}){
  useEffect(()=>{if(!api)return;let pointer:number|null=null,previous:number[]=[0,0],frame=0,candidates:any[]=[],segments:number[][][]=[],erased=new Set<string>();
    const point=(event:PointerEvent)=>{const app=api.getAppState();return [(event.clientX-app.offsetLeft)/app.zoom.value-app.scrollX,(event.clientY-app.offsetTop)/app.zoom.value-app.scrollY];};
    const stop=(event:PointerEvent)=>{event.preventDefault();event.stopImmediatePropagation();};
    const flush=(finished=false)=>{if(frame){cancelAnimationFrame(frame);frame=0;}const radius=12/api.getAppState().zoom.value;for(const candidate of candidates){if(erased.has(candidate.element.id)||candidate.element.locked)continue;if(segments.some(([a,b])=>strokeHit(candidate.points,a,b,radius+candidate.width/2)))erased.add(candidate.element.id);}segments=[];
      if(erased.size){const elements=api.getSceneElementsIncludingDeleted();api.updateScene({elements:elements.map(e=>erased.has(e.id)&&!e.isDeleted?newElementWith(e,{isDeleted:true}):e),captureUpdate:finished?CaptureUpdateAction.IMMEDIATELY:CaptureUpdateAction.NEVER});}
    };
    const down=(event:PointerEvent)=>{if(event.pointerType==='touch'||!(event.target instanceof Element)||!event.target.matches('.excalidraw canvas'))return;const app=api.getAppState();if(app.activeTool.type!=='eraser'&&!(event.pointerType==='pen'&&event.button===5))return;stop(event);pointer=event.pointerId;previous=point(event);erased=new Set();candidates=api.getSceneElements().filter(isHandwriting).map((element:any)=>({element,points:handwritingPoints(element),width:element.customData?.pressurePenV1?.settings.width||element.strokeWidth||1}));segments=[[previous,previous]];try{event.target.setPointerCapture(event.pointerId);}catch{}flush();};
    const move=(event:PointerEvent)=>{if(event.pointerId!==pointer)return;stop(event);for(const sample of [...(event.getCoalescedEvents?.()||[]),event]){const next=point(sample);segments.push([previous,next]);previous=next;}if(!frame)frame=requestAnimationFrame(()=>{frame=0;flush();});};
    const up=(event:PointerEvent)=>{if(event.pointerId!==pointer)return;move(event);flush(true);pointer=null;candidates=[];erased.clear();};
    const blur=()=>{if(pointer!==null)flush(true);pointer=null;candidates=[];erased.clear();};window.addEventListener('blur',blur);
    document.addEventListener('pointerdown',down,{capture:true,passive:false});document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);
    return()=>{blur();cancelAnimationFrame(frame);window.removeEventListener('blur',blur);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);};
  },[api]);return null;
}
