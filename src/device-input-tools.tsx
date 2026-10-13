import {useEffect} from 'react';
import {CaptureUpdateAction,convertToExcalidrawElements,newElementWith} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {appendPenSamples,touchView} from './device-input.mjs';

export function DeviceInput({api}:{api:ExcalidrawImperativeAPI|null}){
  useEffect(()=>{
    if(!api)return;
    const touches=new Map<number,{x:number;y:number}>(),palms=new Set<number>();let pen:any=null,frame=0;
    const view=()=>{const app=api.getAppState();return {scrollX:app.scrollX,scrollY:app.scrollY,zoom:app.zoom.value,offsetLeft:app.offsetLeft,offsetTop:app.offsetTop};};
    const surface=(target:EventTarget|null)=>target instanceof Element&&(target.matches('.excalidraw canvas')||!!target.closest('.nm-table-inline,.inline-rich-editor'));
    const stop=(event:PointerEvent)=>{event.preventDefault();event.stopImmediatePropagation();};
    const release=(event:PointerEvent)=>{try{(event.target as Element).releasePointerCapture(event.pointerId);}catch{}};
    const flush=(finished=false)=>{if(!pen)return;if(frame){cancelAnimationFrame(frame);frame=0;}const stroke=pen,points=stroke.points.map((p:number[])=>[...p]);if(points.length===1)points.push([points[0][0]+.001,points[0][1]+.001]);const pressures=[...stroke.pressures];while(pressures.length<points.length)pressures.push(pressures[0]);
      const xs=points.map((p:number[])=>p[0]),ys=points.map((p:number[])=>p[1]);
      const updated=newElementWith(stroke.element,{points,pressures,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),lastCommittedPoint:points[points.length-1]} as any);stroke.element=updated;
      const elements=api.getSceneElements();api.updateScene({elements:elements.some(e=>e.id===updated.id)?elements.map(e=>e.id===updated.id?updated:e):[...elements,updated],captureUpdate:finished?CaptureUpdateAction.IMMEDIATELY:CaptureUpdateAction.NEVER});
    };
    const samples=(event:PointerEvent,ending=false)=>{const coalesced=event.getCoalescedEvents?.()||[];appendPenSamples(pen,[...coalesced,event],view(),ending);};
    const down=(event:PointerEvent)=>{
      if(!surface(event.target))return;
      if(event.pointerType==='touch'){stop(event);if(pen){palms.add(event.pointerId);return;}touches.set(event.pointerId,{x:event.clientX,y:event.clientY});try{(event.target as Element).setPointerCapture(event.pointerId);}catch{}return;}
      if(event.pointerType!=='pen'||event.button!==0||!(event.target as Element).matches('.excalidraw canvas'))return;
      stop(event);if(pen)return;for(const id of touches.keys())palms.add(id);touches.clear();const app=api.getAppState(),v=view(),x=(event.clientX-v.offsetLeft)/v.zoom-v.scrollX,y=(event.clientY-v.offsetTop)/v.zoom-v.scrollY;
      // The public converter does not fill defaults for freedraw skeletons.
      // Start from its fully initialized base, then supply all stroke fields.
      const base=convertToExcalidrawElements([{type:'rectangle',x,y,width:.001,height:.001,strokeColor:app.currentItemStrokeColor,strokeWidth:app.currentItemStrokeWidth,opacity:app.currentItemOpacity,roughness:0}])[0];
      const element={...base,type:'freedraw',points:[[0,0]],pressures:[event.pressure||.5],simulatePressure:false,lastCommittedPoint:null,roundness:null,customData:{neverMapPen:true}};
      pen={id:event.pointerId,x,y,element,points:[],pressures:[]};samples(event);try{(event.target as Element).setPointerCapture(event.pointerId);}catch{}flush();
    };
    const move=(event:PointerEvent)=>{
      if(palms.has(event.pointerId)){stop(event);return;}
      if(event.pointerType==='touch'&&(touches.has(event.pointerId)||pen)){stop(event);if(pen)return;const previous=[...touches.values()];touches.set(event.pointerId,{x:event.clientX,y:event.clientY});const next=touchView(previous,[...touches.values()],view());api.updateScene({appState:{scrollX:next.scrollX,scrollY:next.scrollY,zoom:{value:next.zoom as any}},captureUpdate:CaptureUpdateAction.NEVER});return;}
      if(!pen||pen.id!==event.pointerId)return;stop(event);samples(event);if(!frame)frame=requestAnimationFrame(()=>{frame=0;flush();});
    };
    const up=(event:PointerEvent)=>{
      if(palms.has(event.pointerId)){stop(event);palms.delete(event.pointerId);release(event);return;}
      if(event.pointerType==='touch'&&(touches.has(event.pointerId)||pen)){stop(event);touches.delete(event.pointerId);release(event);return;}
      if(!pen||pen.id!==event.pointerId)return;stop(event);if(event.type==='pointerup')samples(event,true);flush(true);pen=null;release(event);
    };
    const blur=()=>{if(pen){flush(true);pen=null;}touches.clear();palms.clear();};
    document.addEventListener('pointerdown',down,{capture:true,passive:false});document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',up,{capture:true,passive:false});document.addEventListener('pointercancel',up,{capture:true,passive:false});window.addEventListener('blur',blur);
    return()=>{if(frame)cancelAnimationFrame(frame);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);window.removeEventListener('blur',blur);};
  },[api]);
  return null;
}
