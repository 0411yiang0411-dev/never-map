import {useEffect,useRef} from 'react';
import {CaptureUpdateAction,getCommonBounds,newElementWith} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {linearWorldPoints,moveLinearEndpoint,snapEndpoint} from './auto-align.mjs';
import {snapBounds} from './selection-geometry.mjs';

export function AutoAlign({api,enabled,onToggle}:{api:ExcalidrawImperativeAPI|null;enabled:boolean;onToggle:()=>void}){
  const toggle=useRef(onToggle);toggle.current=onToggle;
  useEffect(()=>{
    if(!api)return;
    api.updateScene({appState:{objectsSnapModeEnabled:enabled},captureUpdate:CaptureUpdateAction.NEVER});
    if(!enabled)return;
    let frame=0,updating=false,bypass=false,tracking=false,pointer=-1;
    const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'svg'),guide=document.createElementNS(ns,'path');overlay.classList.add('nm-align-guides');overlay.appendChild(guide);document.body.appendChild(overlay);
    const apply=()=>{frame=0;if(updating||bypass)return;const app=api.getAppState();
      if((!app.selectedElementsAreBeingDragged&&!tracking)||app.editingLinearElement||app.resizingElement||(app as any).isRotating||app.editingTextElement)return;
      const elements=api.getSceneElements(),picked=elements.filter(e=>app.selectedElementIds[e.id]&&!e.isDeleted);
      if(!picked.length)return;const map=new Map(elements.map(e=>[e.id,e])),ids=new Set(picked.map(e=>e.id));
      const references=elements.filter(e=>!e.isDeleted&&!ids.has(e.id)&&!(e.type==='text'&&e.containerId&&ids.has(e.containerId))).map(e=>getCommonBounds([e],map));
      const snapped=snapBounds(getCommonBounds(picked,map),references,app.zoom.value);
      guide.setAttribute('d',snapped.guides.map((g:any)=>g.points.map((p:number[],i:number)=>`${i?'L':'M'}${app.offsetLeft+(p[0]+app.scrollX)*app.zoom.value},${app.offsetTop+(p[1]+app.scrollY)*app.zoom.value}`).join(' ')).join(' '));
      if(!snapped.dx&&!snapped.dy)return;
      updating=true;try{api.updateScene({elements:elements.map(e=>ids.has(e.id)?newElementWith(e,{x:e.x+snapped.dx,y:e.y+snapped.dy}):e),captureUpdate:CaptureUpdateAction.NEVER});}finally{updating=false;}
    };
    const unsubscribe=api.onChange((_elements,app)=>{if(!updating&&(tracking||app.selectedElementsAreBeingDragged)&&!frame)frame=requestAnimationFrame(apply);});
    const down=(e:PointerEvent)=>{tracking=false;if(e.button!==0||e.pointerType==='touch'||!(e.target instanceof Element)||!e.target.matches('.excalidraw canvas'))return;const app=api.getAppState();if(app.activeTool.type!=='selection')return;const elements=api.getSceneElements(),picked=elements.filter(el=>app.selectedElementIds[el.id]);if(!picked.length)return;const b=getCommonBounds(picked,new Map(elements.map(el=>[el.id,el]))),x=(e.clientX-app.offsetLeft)/app.zoom.value-app.scrollX,y=(e.clientY-app.offsetTop)/app.zoom.value-app.scrollY;tracking=x>=b[0]-4/app.zoom.value&&x<=b[2]+4/app.zoom.value&&y>=b[1]-4/app.zoom.value&&y<=b[3]+4/app.zoom.value;pointer=e.pointerId;};
    const move=(e:PointerEvent)=>{bypass=e.ctrlKey||e.metaKey;if(e.pointerId!==pointer||!(e.buttons&1))tracking=false;if(!frame)frame=requestAnimationFrame(apply);};
    const up=()=>{cancelAnimationFrame(frame);frame=0;tracking=false;pointer=-1;guide.setAttribute('d','');api.updateScene({appState:{snapLines:[]},captureUpdate:CaptureUpdateAction.NEVER});};
    document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);window.addEventListener('blur',up);
    return()=>{unsubscribe();cancelAnimationFrame(frame);overlay.remove();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);window.removeEventListener('blur',up);};
  },[api,enabled]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.altKey&&event.code==='KeyS'&&!event.ctrlKey&&!event.metaKey&&!(event.target as Element).closest('input,textarea,[contenteditable="true"]')){event.preventDefault();event.stopPropagation();toggle.current();}};document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);},[]);
  useEffect(()=>{
    if(!api||!enabled)return;
    let frame=0,upFrame=0,updating=false,candidate:{id:string;index:number}|null=null;
    const modifiers={bypass:false,shift:false};
    const track=(event:PointerEvent|KeyboardEvent)=>{modifiers.bypass=event.ctrlKey||event.metaKey;modifiers.shift=event.shiftKey;};
    document.addEventListener('pointermove',track,true);document.addEventListener('pointerdown',track,true);document.addEventListener('keydown',track,true);document.addEventListener('keyup',track,true);
    const apply=()=>{frame=0;if(!candidate||modifiers.bypass||modifiers.shift)return;const elements=api.getSceneElements(),element=elements.find(e=>e.id===candidate!.id) as any;if(!element||element.elbowed)return;
      const index=candidate.index;if(index!==0&&index!==element.points.length-1)return;
      // Preserve Excalidraw's actual arrow binding and elbow routing.
      if((index===0?element.startBinding:element.endBinding))return;
      const map=new Map(elements.map(e=>[e.id,e]));const references:number[][]=[];
      for(const target of elements){if(target.id===element.id||target.isDeleted||(target.type==='text'&&target.containerId===element.id))continue;
        if(target.type==='line'||target.type==='arrow'){const points=linearWorldPoints(target);references.push(points[0],points[points.length-1]);}
        else{const [x1,y1,x2,y2]=getCommonBounds([target],map);references.push([x1,y1],[x2,y1],[x1,y2],[x2,y2],[(x1+x2)/2,(y1+y2)/2],[(x1+x2)/2,y1],[(x1+x2)/2,y2],[x1,(y1+y2)/2],[x2,(y1+y2)/2]);}
      }
      const snapped=snapEndpoint(linearWorldPoints(element)[index],references,api.getAppState().zoom.value);
      if(!snapped.changed)return;
      updating=true;try{const updated=newElementWith(element,moveLinearEndpoint(element,index,snapped.point) as any);api.updateScene({elements:elements.map(e=>e.id===element.id?updated:e),appState:{snapLines:snapped.guides as any},captureUpdate:CaptureUpdateAction.NEVER});}finally{updating=false;}
    };
    const unsubscribe=api.onChange((_elements,app)=>{if(updating)return;const editor=app.editingLinearElement||app.selectedLinearElement;const indices=editor?.selectedPointsIndices;
      if(!editor?.isDragging||indices?.length!==1){candidate=null;return;}candidate={id:editor.elementId,index:indices[0]};if(!frame)frame=requestAnimationFrame(apply);
    });
    const up=api.onPointerUp(()=>{if(frame)cancelAnimationFrame(frame);apply();candidate=null;upFrame=requestAnimationFrame(()=>{api.updateScene({appState:{snapLines:[]},captureUpdate:CaptureUpdateAction.NEVER});});});
    return()=>{unsubscribe();up();cancelAnimationFrame(frame);cancelAnimationFrame(upFrame);document.removeEventListener('pointermove',track,true);document.removeEventListener('pointerdown',track,true);document.removeEventListener('keydown',track,true);document.removeEventListener('keyup',track,true);};
  },[api,enabled]);
  return <button aria-pressed={enabled} title="移动、拉伸及端点编辑时自动对齐；Alt＋S 切换，Ctrl／Command 临时绕过" onClick={onToggle}>自动对齐：{enabled?'开':'关'}</button>;
}
