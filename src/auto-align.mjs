export function linearWorldPoints(element){
  const xs=element.points.map(p=>p[0]),ys=element.points.map(p=>p[1]);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const cos=Math.cos(element.angle||0),sin=Math.sin(element.angle||0);
  return element.points.map(([x,y])=>[element.x+cx+(x-cx)*cos-(y-cy)*sin,element.y+cy+(x-cx)*sin+(y-cy)*cos]);
}
// Normalize about the first point while retaining every other world position,
// including the rotation pivot when an endpoint changes the bounds.
export function moveLinearEndpoint(element,index,point){
  const world=linearWorldPoints(element);world[index]=point;
  const angle=element.angle||0,cos=Math.cos(angle),sin=Math.sin(angle);
  const unrotated=world.map(([x,y])=>[x*cos+y*sin,-x*sin+y*cos]);
  const [ox,oy]=unrotated[0],points=unrotated.map(([x,y])=>[x-ox,y-oy]);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  return {points,x:(ox+cx)*cos-(oy+cy)*sin-cx,y:(ox+cx)*sin+(oy+cy)*cos-cy,width:maxX-minX,height:maxY-minY};
}
export function snapEndpoint(point,references,zoom){
  const threshold=8/Math.max(.1,zoom);let bestX=null,bestY=null,dx=threshold,dy=threshold;
  for(const reference of references){const x=Math.abs(reference[0]-point[0]),y=Math.abs(reference[1]-point[1]);if(x<dx){dx=x;bestX=reference;}if(y<dy){dy=y;bestY=reference;}}
  const snapped=[bestX?bestX[0]:point[0],bestY?bestY[1]:point[1]];
  const guides=[];if(bestX)guides.push({type:'points',points:[bestX,snapped]});if(bestY)guides.push({type:'points',points:[bestY,snapped]});
  return {point:snapped,guides,changed:Math.abs(snapped[0]-point[0])>1e-7||Math.abs(snapped[1]-point[1])>1e-7};
}
