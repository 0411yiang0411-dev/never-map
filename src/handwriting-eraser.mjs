import {linearWorldPoints} from './auto-align.mjs';
import {pressureGeometry} from './pen-pressure.mjs';
export const isHandwriting=e=>!e.isDeleted&&(e.type==='freedraw'||e.customData?.neverMapPen===true||!!e.customData?.pressurePenV1||!!e.customData?.pressurePenV2);
export function handwritingPoints(e){
  const old=e.customData?.pressurePenV1;if(!old)return linearWorldPoints(e);
  const g=pressureGeometry(old.points,old.pressures,old.settings),cx=e.width/2,cy=e.height/2,cos=Math.cos(e.angle||0),sin=Math.sin(e.angle||0);
  return old.points.map(([x,y])=>{x=(x-g.x)*e.width/g.width;y=(y-g.y)*e.height/g.height;if(e.scale?.[0]===-1)x=e.width-x;if(e.scale?.[1]===-1)y=e.height-y;return [e.x+cx+(x-cx)*cos-(y-cy)*sin,e.y+cy+(x-cx)*sin+(y-cy)*cos];});
}
function pointDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
export function segmentsNear(a,b,c,d,r){const cross=(p,q,s)=>(q[0]-p[0])*(s[1]-p[1])-(q[1]-p[1])*(s[0]-p[0]);const c1=cross(a,b,c),c2=cross(a,b,d),c3=cross(c,d,a),c4=cross(c,d,b);if(c1*c2<0&&c3*c4<0)return true;return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b))<=r;}
export function strokeHit(points,a,b,r){for(let i=0;i<points.length;i++)if(segmentsNear(a,b,points[Math.max(0,i-1)],points[i],r))return true;return false;}
