import {useEffect,useRef,useState} from 'react';
import {CaptureUpdateAction,convertToExcalidrawElements,newElementWith} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {appendPenSamples,createTouchGesture,updateTouchGesture,useRawPen} from './device-input.mjs';
import {penSettings,pressureGeometry} from './pen-pressure.mjs';
import {PenSettings} from './pen-settings';

export function DeviceInput({api}:{api:ExcalidrawImperativeAPI|null}){
  const [settings,setSettings]=useState(()=>{try{return penSettings(JSON.parse(localStorage.getItem('never-map-pen-settings')||'{}'));}catch{return penSettings();}});
  const settingsRef=useRef(settings);settingsRef.current=settings;
  const changeSettings=(value:any)=>{const next=penSettings(value);setSettings(next);localStorage.setItem('never-map-pen-settings',JSON.stringify(next));};
  useEffect(()=>{
    if(!api)return;
    const touches=new Map<number,{x:number;y:number}>(),palms=new Set<number>();let pen:any=null,frame=0,touchFrame=0,gesture:any=null,nativePen:number|null=null;
    const view=()=>{const app=api.getAppState();return {scrollX:app.scrollX,scrollY:app.scrollY,zoom:app.zoom.value,offsetLeft:app.offsetLeft,offsetTop:app.offsetTop};};
    const surface=(target:EventTarget|null)=>target instanceof Element&&(target.matches('.excalidraw canvas')||!!target.closest('.nm-table-inline,.inline-rich-editor'));
    const stop=(event:PointerEvent)=>{event.preventDefault();event.stopImmediatePropagation();};
    const release=(event:PointerEvent)=>{try{(event.target as Element).releasePointerCapture(event.pointerId);}catch{}};
    const flushTouch=()=>{if(touchFrame){cancelAnimationFrame(touchFrame);touchFrame=0;}if(!gesture||!touches.size)return;const next=updateTouchGesture(gesture,[...touches.values()]);api.updateScene({appState:{scrollX:next.scrollX,scrollY:next.scrollY,zoom:{value:next.zoom as any}},captureUpdate:CaptureUpdateAction.NEVER});};
    const resetGesture=()=>{gesture=touches.size?createTouchGesture([...touches.values()],view()):null;};
    const flush=(finished=false)=>{if(!pen)return;if(frame){cancelAnimationFrame(frame);frame=0;}const stroke=pen,points=stroke.points.map((p:number[])=>[...p]);if(points.length===1)points.push([points[0][0]+.001,points[0][1]+.001]);
      if(stroke.settings.enabled){const geometry=pressureGeometry(stroke.points,stroke.pressures,stroke.settings);if(!finished){const app=api.getAppState();stroke.preview.setAttribute('viewBox',`0 0 ${window.innerWidth} ${window.innerHeight}`);stroke.group.setAttribute('transform',`translate(${app.offsetLeft+(stroke.x+app.scrollX)*app.zoom.value} ${app.offsetTop+(stroke.y+app.scrollY)*app.zoom.value}) scale(${app.zoom.value})`);stroke.path.setAttribute('d',geometry.path);return;}
        const xs=stroke.points.map((p:number[])=>p[0]),ys=stroke.points.map((p:number[])=>p[1]);
        const native={...stroke.element,type:'freedraw',points:stroke.points.map((p:number[])=>[...p]),pressures:[...stroke.pressures],simulatePressure:false,lastCommittedPoint:stroke.points[stroke.points.length-1],width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),customData:{neverMapPen:true,pressurePenV2:{settings:stroke.settings}}};
        api.updateScene({elements:[...api.getSceneElements(),native as any],captureUpdate:CaptureUpdateAction.IMMEDIATELY});requestAnimationFrame(()=>requestAnimationFrame(()=>stroke.preview.remove()));return;
      }
      const xs=points.map((p:number[])=>p[0]),ys=points.map((p:number[])=>p[1]);
      const updated=newElementWith(stroke.element,{points,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),lastCommittedPoint:points[points.length-1]} as any);stroke.element=updated;
      const elements=api.getSceneElements();api.updateScene({elements:elements.some(e=>e.id===updated.id)?elements.map(e=>e.id===updated.id?updated:e):[...elements,updated],captureUpdate:finished?CaptureUpdateAction.IMMEDIATELY:CaptureUpdateAction.NEVER});
    };
    const samples=(event:PointerEvent,ending=false)=>{const coalesced=event.getCoalescedEvents?.()||[];appendPenSamples(pen,[...coalesced,event],view(),ending);};
    const down=(event:PointerEvent)=>{
      if(!surface(event.target))return;
      if(event.pointerType==='touch'){stop(event);if(pen||nativePen!==null){palms.add(event.pointerId);return;}flushTouch();touches.set(event.pointerId,{x:event.clientX,y:event.clientY});resetGesture();try{(event.target as Element).setPointerCapture(event.pointerId);}catch{}return;}
      if(event.pointerType!=='pen'||!(event.target as Element).matches('.excalidraw canvas'))return;
      flushTouch();for(const id of touches.keys())palms.add(id);touches.clear();resetGesture();const app=api.getAppState();
      if(!useRawPen(app.activeTool.type,event.button)){nativePen=event.pointerId;return;}
      stop(event);if(pen)return;const v=view(),x=(event.clientX-v.offsetLeft)/v.zoom-v.scrollX,y=(event.clientY-v.offsetTop)/v.zoom-v.scrollY;
      // Raw fixed-width polyline: no global stroke smoothing or pressure-driven
      // outline recomputation. Appending samples never changes prior vertices.
      const selectedSettings={...settingsRef.current};
      const element=convertToExcalidrawElements([{type:'line',x,y,points:[[0,0]],strokeColor:app.currentItemStrokeColor,strokeWidth:selectedSettings.width,opacity:app.currentItemOpacity,roughness:0,roundness:null,strokeStyle:'solid',startArrowhead:null,endArrowhead:null,customData:{neverMapPen:true,rawPenV2:true}}])[0];
      pen={id:event.pointerId,x,y,element,settings:selectedSettings,points:[],pressures:[]};
      if(selectedSettings.enabled){const ns='http://www.w3.org/2000/svg',preview=document.createElementNS(ns,'svg'),group=document.createElementNS(ns,'g'),path=document.createElementNS(ns,'path');preview.classList.add('nm-pen-preview');path.setAttribute('fill',element.strokeColor);path.setAttribute('fill-rule','nonzero');group.setAttribute('opacity',String(element.opacity/100));group.appendChild(path);preview.appendChild(group);document.body.appendChild(preview);Object.assign(pen,{preview,group,path});}
      samples(event);try{(event.target as Element).setPointerCapture(event.pointerId);}catch{}flush();
    };
    const move=(event:PointerEvent)=>{
      if(palms.has(event.pointerId)){stop(event);return;}
      if(event.pointerType==='touch'&&(touches.has(event.pointerId)||pen||nativePen!==null)){stop(event);if(pen||nativePen!==null)return;touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(!touchFrame)touchFrame=requestAnimationFrame(()=>{touchFrame=0;flushTouch();});return;}
      if(!pen||pen.id!==event.pointerId)return;stop(event);samples(event);if(!frame)frame=requestAnimationFrame(()=>{frame=0;flush();});
    };
    const up=(event:PointerEvent)=>{
      if(nativePen===event.pointerId){nativePen=null;return;}
      if(palms.has(event.pointerId)){stop(event);palms.delete(event.pointerId);release(event);return;}
      if(event.pointerType==='touch'&&(touches.has(event.pointerId)||pen||nativePen!==null)){stop(event);flushTouch();touches.delete(event.pointerId);resetGesture();release(event);return;}
      if(!pen||pen.id!==event.pointerId)return;stop(event);if(event.type==='pointerup')samples(event,true);flush(true);pen=null;release(event);
    };
    const raw=(input:Event)=>{const event=input as PointerEvent;if(!pen||pen.id!==event.pointerId)return;samples(event);if(!frame)frame=requestAnimationFrame(()=>{frame=0;flush();});};
    const blur=()=>{if(pen){flush(true);pen=null;}flushTouch();touches.clear();palms.clear();gesture=null;nativePen=null;};
    const warn=(event:BeforeUnloadEvent)=>{if(pen){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);
    document.addEventListener('pointerdown',down,{capture:true,passive:false});document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',up,{capture:true,passive:false});document.addEventListener('pointercancel',up,{capture:true,passive:false});window.addEventListener('blur',blur);
    // Timestamp filtering avoids replaying old coalesced samples from the
    // overlapping raw-update and pointer-move streams.
    const hasRaw='onpointerrawupdate' in window;if(hasRaw)document.addEventListener('pointerrawupdate',raw,true);
    return()=>{if(pen){flush(true);pen=null;}if(frame)cancelAnimationFrame(frame);if(touchFrame)cancelAnimationFrame(touchFrame);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);if(hasRaw)document.removeEventListener('pointerrawupdate',raw,true);window.removeEventListener('blur',blur);window.removeEventListener('beforeunload',warn);};
  },[api]);
  return <PenSettings api={api} settings={settings} onChange={changeSettings}/>;
}
