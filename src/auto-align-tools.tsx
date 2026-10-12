import {useEffect,useRef} from 'react';
import {CaptureUpdateAction,getCommonBounds,newElementWith} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {linearWorldPoints,moveLinearEndpoint,snapEndpoint} from './auto-align.mjs';

export function AutoAlign({api,enabled,onToggle}:{api:ExcalidrawImperativeAPI|null;enabled:boolean;onToggle:()=>void}){
  const toggle=useRef(onToggle);toggle.current=onToggle;
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
