export function createSceneGate(){let previous=null,version=-1,background=null,fingerprint='';
 const sum=elements=>{let total=0;for(const e of elements)total+=e.version||0;return total;};
 const full=(elements,bg)=>elements.map(e=>`${e.id}:${e.version}:${e.isDeleted}:${e.fileId||''}`).join('|')+bg;
 return {reset(elements,bg){previous=elements;version=sum(elements);background=bg;fingerprint=full(elements,bg);},changed(elements,bg){const next=sum(elements);if(previous===elements&&version===next&&background===bg)return false;previous=elements;version=next;background=bg;const value=full(elements,bg);if(value===fingerprint)return false;fingerprint=value;return true;}};
}
