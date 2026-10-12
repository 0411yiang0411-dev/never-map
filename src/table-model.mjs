import {escapeHTML} from './rich-layout.mjs';
export const TABLE_LIMITS={rows:100,columns:30,characters:50000};
export function normalizeTable(input) {
  const cells=input.cells;
  if(!Array.isArray(cells)||!cells.length)throw new Error('表格没有内容');
  const columns=Math.max(...cells.map(row=>Array.isArray(row)?row.length:0));
  if(!columns||cells.length>100||columns>30)throw new Error('表格最多支持 100 行、30 列，请拆分后粘贴');
  const rows=cells.map(row=>Array.from({length:columns},(_,i)=>String(row[i]??'')));
  if(rows.flat().reduce((n,text)=>n+text.length,0)>50000)throw new Error('表格文字过多，请拆分为多个表格');
  const styles={};
  for(const [key,value] of Object.entries(input.styles||{})){
    if(!/^\d+:\d+$/.test(key)||!value||typeof value!=='object')continue;
    const [r,c]=key.split(':').map(Number);if(r>=rows.length||c>=columns)continue;
    const safe={};if(typeof value.bold==='boolean')safe.bold=value.bold;
    if(['left','center','right'].includes(value.align))safe.align=value.align;
    if(/^#[0-9a-f]{6}$/i.test(value.fill||''))safe.fill=value.fill;
    styles[key]=safe;
  }
  const columnWidth=Math.max(40,Math.min(800,Number(input.columnWidth)||140));
  const columnWidths=Array.from({length:columns},(_,i)=>Math.max(40,Math.min(800,Number(input.columnWidths?.[i])||columnWidth)));
  const rowHeights=Array.from({length:rows.length},(_,i)=>Math.max(32,Math.min(800,Number(input.rowHeights?.[i])||40)));
  const merges=[];const occupied=new Set();
  for(const raw of input.merges||[]){
    const m={r:Number(raw.r),c:Number(raw.c),rows:Number(raw.rows),columns:Number(raw.columns)};
    if(!Object.values(m).every(Number.isInteger)||m.r<0||m.c<0||m.rows<1||m.columns<1||m.r+m.rows>rows.length||m.c+m.columns>columns)throw new Error('合并单元格范围无效');
    if(m.rows*m.columns===1)continue;
    for(let r=m.r;r<m.r+m.rows;r++)for(let c=m.c;c<m.c+m.columns;c++){const key=`${r}:${c}`;if(occupied.has(key))throw new Error('合并单元格不能重叠');occupied.add(key);}
    merges.push(m);
  }
  return {version:2,cells:rows,header:!!input.header,columnWidth,columnWidths,rowHeights,merges,fontSize:Math.max(12,Math.min(28,Number(input.fontSize)||16)),styles};
}
export function parseTSV(text) {
  if(!text.includes('\t'))return null;
  const rows=[];let row=[],value='',quoted=false,cellStart=true;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(ch==='"' && cellStart){quoted=true;cellStart=false;continue;}
    if(ch==='"' && quoted){if(text[i+1]==='"'){value+='"';i++;}else quoted=false;continue;}
    if(!quoted && (ch==='\t'||ch==='\n'||ch==='\r')) {
      row.push(value);value='';cellStart=true;
      if(ch!=='\t'){rows.push(row);row=[];if(ch==='\r'&&text[i+1]==='\n')i++;}
    } else {value+=ch;cellStart=false;}
  }
  if(quoted)throw new Error('复制的表格引号不完整，请重新复制');
  if(value||row.length) {row.push(value);rows.push(row);}
  if(!rows.length)return null;
  return normalizeTable({cells:rows,header:false});
}
export function toTSV(table){return table.cells.map(row=>row.map(value=>/[\t\r\n"]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value).join('\t')).join('\r\n');}
export function changeAxis(table,axis,index,remove=false) {
  const result=normalizeTable(table);const rows=result.cells.length,cols=result.cells[0].length;
  if(remove && (axis==='row'?rows:cols)<=1)return result;
  const position=Math.max(0,Math.min(axis==='row'?rows-1:cols-1,index));
  const at=remove?position:position+1;
  if(axis==='row'){if(remove)result.cells.splice(at,1);else result.cells.splice(at,0,Array(cols).fill(''));}
  else for(const row of result.cells){if(remove)row.splice(at,1);else row.splice(at,0,'');}
  if(axis==='row'){if(remove)result.rowHeights.splice(at,1);else result.rowHeights.splice(at,0,40);}
  else {if(remove)result.columnWidths.splice(at,1);else result.columnWidths.splice(at,0,result.columnWidths[position]);}
  result.merges=result.merges.flatMap(m=>{
    const start=axis==='row'?m.r:m.c,count=axis==='row'?m.rows:m.columns;
    let nextStart=start,nextCount=count;
    if(remove){if(at<start)nextStart--;else if(at<start+count)nextCount--;}
    else {if(at<=start)nextStart++;else if(at<start+count)nextCount++;}
    if(nextCount<1)return [];
    return [{...m,...(axis==='row'?{r:nextStart,rows:nextCount}:{c:nextStart,columns:nextCount})}];
  });
  const styles={};
  for(const [key,value] of Object.entries(table.styles||{})) {
    let [r,c]=key.split(':').map(Number);let coordinate=axis==='row'?r:c;
    if(remove&&coordinate===at)continue;
    if(remove&&coordinate>at)coordinate--;if(!remove&&coordinate>=at)coordinate++;
    if(axis==='row')r=coordinate;else c=coordinate;styles[`${r}:${c}`]=value;
  }
  return normalizeTable({...result,styles});
}
export function cellOwner(table,r,c){return table.merges?.find(m=>r>=m.r&&r<m.r+m.rows&&c>=m.c&&c<m.c+m.columns)||{r,c,rows:1,columns:1};}
export function selectionBounds(table,a,b=a){
  let range={r:Math.min(a[0],b[0]),c:Math.min(a[1],b[1]),endR:Math.max(a[0],b[0]),endC:Math.max(a[1],b[1])};
  let changed=true;
  while(changed){changed=false;for(const m of table.merges||[]){if(m.r<=range.endR&&m.r+m.rows-1>=range.r&&m.c<=range.endC&&m.c+m.columns-1>=range.c){const next={r:Math.min(range.r,m.r),c:Math.min(range.c,m.c),endR:Math.max(range.endR,m.r+m.rows-1),endC:Math.max(range.endC,m.c+m.columns-1)};if(JSON.stringify(next)!==JSON.stringify(range)){range=next;changed=true;}}}}
  return range;
}
export function mergeSelection(input,range,split=false){
  const table=normalizeTable(input);
  const merges=table.merges.filter(m=>!(m.r<=range.endR&&m.r+m.rows-1>=range.r&&m.c<=range.endC&&m.c+m.columns-1>=range.c));
  if(!split&&((range.endR-range.r+1)*(range.endC-range.c+1)>1))merges.push({r:range.r,c:range.c,rows:range.endR-range.r+1,columns:range.endC-range.c+1});
  return normalizeTable({...table,merges});
}
export function tableLayout(input,measure){
  const table=normalizeTable(input),size=table.fontSize,width=table.columnWidths.reduce((a,b)=>a+b,0),heights=[...table.rowHeights],cells=[];
  for(let r=0;r<table.cells.length;r++)for(let c=0;c<table.cells[0].length;c++){
    const owner=cellOwner(table,r,c);if(owner.r!==r||owner.c!==c)continue;
    const w=table.columnWidths.slice(c,c+owner.columns).reduce((a,b)=>a+b,0),lines=[];
    for(const paragraph of table.cells[r][c].split(/\r?\n/)){let line='';for(const char of [...paragraph]){const next=line+char;if(line&&(measure?measure(next,size):next.length*size*.7)>w-20){lines.push(line);line=char;}else line=next;}lines.push(line);}
    const required=lines.length*size*1.5+20,current=heights.slice(r,r+owner.rows).reduce((a,b)=>a+b,0);
    if(required>current)heights[r+owner.rows-1]+=required-current;
    cells.push({...owner,lines,width:w});
  }
  const height=heights.reduce((a,b)=>a+b,0);
  if(width*height>12000000||height>16000)throw new Error('表格画面过大，请分成多个表格');
  for(const cell of cells){cell.x=table.columnWidths.slice(0,cell.c).reduce((a,b)=>a+b,0);cell.y=heights.slice(0,cell.r).reduce((a,b)=>a+b,0);cell.height=heights.slice(cell.r,cell.r+cell.rows).reduce((a,b)=>a+b,0);}
  return {table,width,height,heights,cells};
}
export function tableSVG(input,measure) {
  const layout=tableLayout(input,measure),{table,width,height}=layout,size=table.fontSize,pieces=[];
  layout.cells.forEach(cell=>{
    const {r,c,x,y}=cell,style=table.styles[`${r}:${c}`]||{};
    const fill=/^#[0-9a-f]{6}$/i.test(style.fill||'')?style.fill:(table.header&&r===0?'#eeeafd':'#ffffff');
    pieces.push(`<rect x="${x}" y="${y}" width="${cell.width}" height="${cell.height}" fill="${fill}" stroke="#aaa6b7" stroke-width="1"/>`);
    const align=['left','center','right'].includes(style.align)?style.align:'left';
    const tx=align==='center'?x+cell.width/2:align==='right'?x+cell.width-10:x+10;
    cell.lines.forEach((line,k)=>pieces.push(`<text x="${tx}" y="${y+10+size+k*size*1.5}" text-anchor="${align==='center'?'middle':align==='right'?'end':'start'}" font-weight="${(style.bold??(table.header&&r===0))?700:400}">${escapeHTML(line)}</text>`));
  });
  return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="Arial,Microsoft YaHei,sans-serif" font-size="${size}" fill="#252332">${pieces.join('')}</g></svg>`};
}
