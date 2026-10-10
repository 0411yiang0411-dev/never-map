export const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function modelHTML(blocks) {
  const inline = runs => (runs || []).map(run => {
    let text = escapeHTML(run.text || '').replace(/\n/g, '<br>');
    if (run.bold) text = `<strong>${text}</strong>`;
    if (run.underline) text = `<u>${text}</u>`;
    if (run.highlight) text = `<mark>${text}</mark>`;
    return text;
  }).join('') || '<br>';
  return blocks.map(block => {
    if (block.type === 'rule') return '<hr>';
    const text = inline(block.runs);
    if (block.type === 'bullet') return `<ul><li>${text}</li></ul>`;
    if (block.type === 'number') return `<ol start="${Math.max(1, Number(block.number) || 1)}"><li>${text}</li></ol>`;
    if (block.type === 'todo') return `<div data-todo="true"><input type="checkbox" contenteditable="false" ${block.checked ? 'checked' : ''}> <span>${text}</span></div>`;
    return `<div>${text}</div>`;
  }).join('');
}

/** @param {Array<any>} blocks
 * @param {{width?:number,fontSize?:number,color?:string,padding?:number,measure?:(char:string,bold:boolean,size:number)=>number}} options */
export function layoutNote(blocks, {width = 440, fontSize = 22, color = '#1e1e1e', padding:requestedPadding=12, measure} = {}) {
  width = Math.max(180, Math.min(1200, Number(width) || 440));
  fontSize = Math.max(12, Math.min(64, Number(fontSize) || 22));
  color = /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#1e1e1e';
  const lineHeight = fontSize * 1.55, padding = Math.max(0,Math.min(24,requestedPadding));
  let y = padding + fontSize;
  const shapes = [], texts = [];
  let number = 0;
  for (const block of blocks) {
    if (block.type === 'rule') {
      shapes.push(`<line x1="${padding}" y1="${y - fontSize / 3}" x2="${width - padding}" y2="${y - fontSize / 3}" stroke="${color}" stroke-width="1.5"/>`);
      y += lineHeight * .7; number = 0; continue;
    }
    if (block.type === 'number') number++; else number = 0;
    const prefix = block.type === 'bullet' ? '•' : block.type === 'number' ? `${number}.` : '';
    const indent = ['bullet', 'number', 'todo'].includes(block.type) ? fontSize * 1.6 : 0;
    let x = padding + indent;
    if (prefix) texts.push(`<text x="${padding}" y="${y}" fill="${color}">${prefix}</text>`);
    if (block.type === 'todo') {
      const size = fontSize * .75, top = y - fontSize * .8;
      shapes.push(`<rect x="${padding}" y="${top}" width="${size}" height="${size}" rx="3" fill="${block.checked ? '#6965db' : 'none'}" stroke="${block.checked ? '#6965db' : color}" stroke-width="1.5"/>`);
      if (block.checked) shapes.push(`<path d="M ${padding+size*.2} ${top+size*.5} l ${size*.22} ${size*.22} l ${size*.4} ${-size*.46}" fill="none" stroke="white" stroke-width="2"/>`);
    }
    for (const run of block.runs || []) {
      for (const char of [...String(run.text || '')]) {
        if (char === '\n') { x = padding + indent; y += lineHeight; continue; }
        const w = Math.max(1, measure ? measure(char, !!run.bold, fontSize) : fontSize * .65);
        if (x + w > width - padding && x > padding + indent) { x = padding + indent; y += lineHeight; }
        if (run.highlight) shapes.push(`<rect x="${x}" y="${y-fontSize}" width="${w+.5}" height="${fontSize*1.25}" rx="1" fill="#ffe58f"/>`);
        const ink = run.highlight ? '#262626' : color;
        texts.push(`<text x="${x}" y="${y}" fill="${ink}" font-weight="${run.bold ? 700 : 400}"${block.checked ? ' opacity="0.6"' : ''}>${escapeHTML(char)}</text>`);
        if (run.underline) shapes.push(`<line x1="${x}" y1="${y+3}" x2="${x+w}" y2="${y+3}" stroke="${ink}" stroke-width="1.2"/>`);
        x += w;
      }
    }
    y += lineHeight;
  }
  const height = Math.max(lineHeight + padding * 2, y - lineHeight + padding + fontSize * .4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="Arial,Microsoft YaHei,sans-serif" font-size="${fontSize}">${shapes.join('')}${texts.join('')}</g></svg>`;
  return { svg, width, height };
}
