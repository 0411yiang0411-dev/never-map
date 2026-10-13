export function penSettings(input={}){
  const number=(value,fallback,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):fallback));
  return {enabled:input.enabled!==false,width:number(input.width,2,.5,24),sensitivity:number(input.sensitivity,1,.25,3),minimum:number(input.minimum,.15,.05,1)};
}
export function pressureWidth(pressure,settings){
  const s=penSettings(settings),p=Math.max(0,Math.min(1,pressure));
  return s.enabled?s.width*(s.minimum+(1-s.minimum)*Math.pow(p,1/s.sensitivity)):s.width;
}
const n=value=>String(Math.round(value*1000)/1000);
export function pressureGeometry(points,pressures,settings){
  if(!points.length)return {path:'',x:0,y:0,width:1,height:1};
  const radii=points.map((_,i)=>pressureWidth(pressures[i]??.5,settings)/2);let path='',minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  points.forEach(([x,y],i)=>{const r=radii[i];minX=Math.min(minX,x-r);minY=Math.min(minY,y-r);maxX=Math.max(maxX,x+r);maxY=Math.max(maxY,y+r);
    // Each circle and segment is independent. Appending a sample never edits
    // the preceding outline or smooths a sharp turn.
    path+=`M${n(x-r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2*r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2*r)} 0Z`;
    if(i){const [px,py]=points[i-1],length=Math.hypot(x-px,y-py);if(length){const nx=-(y-py)/length,ny=(x-px)/length,pr=radii[i-1];path+=`M${n(px+nx*pr)} ${n(py+ny*pr)}L${n(x+nx*r)} ${n(y+ny*r)}L${n(x-nx*r)} ${n(y-ny*r)}L${n(px-nx*pr)} ${n(py-ny*pr)}Z`;}}
  });return {path,x:minX-1,y:minY-1,width:Math.max(1,maxX-minX+2),height:Math.max(1,maxY-minY+2)};
}
export function pressureSVG(geometry,color,opacity=100){
  const safe=/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(color)?color:'#1b1b1f';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(geometry.width)}" height="${n(geometry.height)}" viewBox="${n(geometry.x)} ${n(geometry.y)} ${n(geometry.width)} ${n(geometry.height)}"><path d="${geometry.path}" fill="${safe}" fill-rule="nonzero" opacity="${Math.max(0,Math.min(1,opacity/100))}"/></svg>`;
}
