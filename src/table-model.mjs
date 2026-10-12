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
  return {version:1,cells:rows,header:!!input.header,columnWidth:Math.max(80,Math.min(300,Number(input.columnWidth)||140)),fontSize:Math.max(12,Math.min(28,Number(input.fontSize)||16)),styles};
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
  const styles={};
  for(const [key,value] of Object.entries(table.styles||{})) {
    let [r,c]=key.split(':').map(Number);let coordinate=axis==='row'?r:c;
    if(remove&&coordinate===at)continue;
    if(remove&&coordinate>at)coordinate--;if(!remove&&coordinate>=at)coordinate++;
    if(axis==='row')r=coordinate;else c=coordinate;styles[`${r}:${c}`]=value;
  }
  return normalizeTable({...result,styles});
}
export function tableSVG(input,measure) {
  const table=normalizeTable(input),size=table.fontSize,width=table.cells[0].length*table.columnWidth;
  const cellLines=table.cells.map(row=>row.map(text=>{
    const lines=[];for(const paragraph of text.split(/\r?\n/)){let line='';for(const char of [...paragraph]){const next=line+char;if(line&&(measure?measure(next,size):next.length*size*.7)>table.columnWidth-20){lines.push(line);line=char;}else line=next;}lines.push(line);}return lines;
  }));
  const heights=cellLines.map(row=>Math.max(40,...row.map(lines=>lines.length*size*1.5+20)));
  const height=heights.reduce((a,b)=>a+b,0);
  if(width*height>12000000||height>16000)throw new Error('表格画面过大，请分成多个表格');
  const pieces=[];let y=0;
  table.cells.forEach((row,r)=>{row.forEach((_,c)=>{
    const x=c*table.columnWidth,style=table.styles[`${r}:${c}`]||{};
    const fill=/^#[0-9a-f]{6}$/i.test(style.fill||'')?style.fill:(table.header&&r===0?'#eeeafd':'#ffffff');
    pieces.push(`<rect x="${x}" y="${y}" width="${table.columnWidth}" height="${heights[r]}" fill="${fill}" stroke="#aaa6b7" stroke-width="1"/>`);
    const align=['left','center','right'].includes(style.align)?style.align:'left';
    const tx=align==='center'?x+table.columnWidth/2:align==='right'?x+table.columnWidth-10:x+10;
    cellLines[r][c].forEach((line,k)=>pieces.push(`<text x="${tx}" y="${y+10+size+k*size*1.5}" text-anchor="${align==='center'?'middle':align==='right'?'end':'start'}" font-weight="${(style.bold??(table.header&&r===0))?700:400}">${escapeHTML(line)}</text>`));
  });y+=heights[r];});
  return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="Arial,Microsoft YaHei,sans-serif" font-size="${size}" fill="#252332">${pieces.join('')}</g></svg>`};
}
