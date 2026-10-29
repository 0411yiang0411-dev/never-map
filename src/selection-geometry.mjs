export function insidePolygon(point,polygon){
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [x,y]=point,[a,b]=polygon[i],[c,d]=polygon[j];
    if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
  }return inside;
}
export function enclosedBounds(bounds,polygon){
  const [x,y,r,b]=bounds;return [[x,y],[r,y],[r,b],[x,b]].every(p=>insidePolygon(p,polygon));
}
// Independent axes, matching the official snap distance (8 screen pixels).
export function snapBounds(bounds,references,zoom=1){
  let dx=0,dy=0,bestX=8/zoom,bestY=8/zoom;const guides=[];
  const xs=[bounds[0],(bounds[0]+bounds[2])/2,bounds[2]],ys=[bounds[1],(bounds[1]+bounds[3])/2,bounds[3]];
  let gx=null,gy=null;
  for(const box of references){for(const x of [box[0],(box[0]+box[2])/2,box[2]])for(const a of xs)if(Math.abs(x-a)<bestX){bestX=Math.abs(x-a);dx=x-a;gx=x;}
    for(const y of [box[1],(box[1]+box[3])/2,box[3]])for(const a of ys)if(Math.abs(y-a)<bestY){bestY=Math.abs(y-a);dy=y-a;gy=y;}}
  if(gx!==null)guides.push({type:'points',points:[[gx,Math.min(bounds[1],...references.map(b=>b[1]))],[gx,Math.max(bounds[3],...references.map(b=>b[3]))]]});
  if(gy!==null)guides.push({type:'points',points:[[Math.min(bounds[0],...references.map(b=>b[0])),gy],[Math.max(bounds[2],...references.map(b=>b[2])),gy]]});
  return {dx,dy,guides};
}
