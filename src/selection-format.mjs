export function formatSelection(text,start,end,command) {
  text=String(text);start=Math.max(0,Math.min(text.length,start));end=Math.max(start,Math.min(text.length,end));
  const selected=end>start;
  const blocks=[];let offset=0;
  for(const line of text.split('\n')) {
    const from=Math.max(0,start-offset),to=Math.min(line.length,end-offset);
    const chosen=selected ? start<offset+line.length+1 && end>offset : start>=offset && start<=offset+line.length;
    const runs=[];
    const inline=['bold','underline','highlight'].includes(command);
    if(inline && selected && to>from) {
      if(from>0)runs.push({text:line.slice(0,from)});
      runs.push({text:line.slice(from,to),[command]:true});
      if(to<line.length)runs.push({text:line.slice(to)});
    } else runs.push({text:line});
    blocks.push({type:chosen && ['bullet','number','todo'].includes(command)?command:'paragraph',runs,...(command==='todo'&&chosen?{checked:false}:{})});
    if(command==='rule' && chosen && end<=offset+line.length+1)blocks.push({type:'rule'});
    offset+=line.length+1;
  }
  return blocks;
}
