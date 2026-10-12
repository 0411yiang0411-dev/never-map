// Screen-space navigation shared by wheel, drag panning and edge selection.
export function wheelPixels(event,pageHeight){
  const unit=event.deltaMode===1?16:event.deltaMode===2?pageHeight:1;
  let x=event.deltaX*unit,y=event.deltaY*unit;
  if(event.shiftKey&&!x){x=y;y=0;}
  return {x,y};
}
export function edgeVelocity(point,viewport){
  const axis=(value,min,max)=>{
    const band=Math.min(48,(max-min)/4);
    if(value<min+band)return -720*Math.min(1,(min+band-value)/band);
    if(value>max-band)return 720*Math.min(1,(value-max+band)/band);
    return 0;
  };
  return {x:axis(point.x,viewport.left,viewport.right),y:axis(point.y,viewport.top,viewport.bottom)};
}
export function tableCellAt(point,position,layout){
  const dx=point.x-position.left,dy=point.y-position.top;
  const cos=Math.cos(position.angle),sin=Math.sin(position.angle);
  const x=Math.max(0,Math.min(layout.width-0.001,(dx*cos+dy*sin)/position.sx));
  const y=Math.max(0,Math.min(layout.height-0.001,(-dx*sin+dy*cos)/position.sy));
  return layout.cells.find(cell=>x>=cell.x&&x<cell.x+cell.width&&y>=cell.y&&y<cell.y+cell.height);
}
