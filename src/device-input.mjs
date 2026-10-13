export function touchView(previous,current,view,allowZoom=true){
  const center=points=>({x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length});
  const a=center(previous),b=center(current);let zoom=view.zoom;
  if(allowZoom&&previous.length>=2&&current.length>=2){const distance=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);const before=distance(previous);if(before>2)zoom=Math.max(.1,Math.min(30,view.zoom*distance(current)/before));}
  return {zoom,scrollX:view.scrollX+(b.x-view.offsetLeft)/zoom-(a.x-view.offsetLeft)/view.zoom,scrollY:view.scrollY+(b.y-view.offsetTop)/zoom-(a.y-view.offsetTop)/view.zoom};
}
export function createTouchGesture(points,view){return {points:points.map(p=>({...p})),view:{...view},pinching:false};}
export function updateTouchGesture(gesture,current){
  if(current.length>=2&&gesture.points.length>=2){const distance=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);const initial=distance(gesture.points);if(Math.abs(distance(current)-initial)>=Math.max(4,initial*.03))gesture.pinching=true;}
  return touchView(gesture.points,current,gesture.view,gesture.pinching);
}
export function useRawPen(tool,button){return tool==='freedraw'&&button===0;}
export function appendPenSamples(stroke,samples,view,ending=false){
  for(const sample of samples){const x=(sample.clientX-view.offsetLeft)/view.zoom-view.scrollX-stroke.x,y=(sample.clientY-view.offsetTop)/view.zoom-view.scrollY-stroke.y;
    if(Number.isFinite(sample.timeStamp)){if(sample.timeStamp<(stroke.lastTimeStamp??-Infinity))continue;stroke.lastTimeStamp=sample.timeStamp;}
    const pressure=ending&&sample.pressure===0?(stroke.pressures.at(-1)||.5):Math.max(.15,Math.min(1,sample.pressure||.5));const last=stroke.points.at(-1);
    if(last&&last[0]===x&&last[1]===y){stroke.pressures[stroke.pressures.length-1]=pressure;continue;}stroke.points.push([x,y]);stroke.pressures.push(pressure);
  }
}
