import {mkdir,readFile,writeFile,readdir,copyFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
const root=process.cwd(),dist=resolve(root,'dist'),cache=resolve(root,'.cache/browser-assets');
const safe=(base,file)=>{const path=resolve(base,file);if(!path.startsWith(base+sep)||!file.startsWith('assets/'))throw new Error('Asset path outside project assets');return path;};
await mkdir(cache,{recursive:true});let generations=[];
try{generations=JSON.parse(await readFile(resolve(cache,'generations.json'),'utf8'));}catch{}
if(process.argv[2]==='snapshot'){
 try{const html=await readFile(resolve(dist,'index.html'),'utf8'),entry=html.match(/src="\/([^" ]+\.js)"/)?.[1];if(!entry)process.exit(0);
   let files;try{const manifest=JSON.parse(await readFile(resolve(dist,'.vite/manifest.json'),'utf8'));files=[...new Set(Object.values(manifest).flatMap(item=>[item.file,...(item.css||[]),...(item.assets||[])])).values()].filter(file=>file?.startsWith('assets/'));}catch{files=(await readdir(resolve(dist,'assets'))).map(name=>'assets/'+name);}
   for(const file of files){const destination=safe(cache,file);await mkdir(resolve(destination,'..'),{recursive:true});await copyFile(safe(dist,file),destination);}
   generations=[...generations.filter(g=>g.entry!==entry),{entry,files}].slice(-2);await writeFile(resolve(cache,'generations.json'),JSON.stringify(generations));
 }catch(error){if(error.code!=='ENOENT')throw error;}
}else if(process.argv[2]==='restore'){
 for(const generation of generations)for(const file of generation.files){const destination=safe(dist,file);await mkdir(resolve(destination,'..'),{recursive:true});await copyFile(safe(cache,file),destination);}
 // Older deployed entry points that were already removed before retention was
 // added must trigger one fresh homepage load, not an HTML module response.
 const recovery="var u=new URL(location.href);if(u.searchParams.get('release')!=='compat20261013'){u.searchParams.set('release','compat20261013');location.replace(u.href);}else{var n=document.getElementById('root');if(n)n.textContent='旧版本资源尚未更新，请打开 /connection-check.html。画布数据仍保留。';}";
 for(const file of ['assets/index-B9Bxy0Ju.js','assets/index-B_wnPj42.js']){try{await readFile(safe(dist,file));}catch{await writeFile(safe(dist,file),recovery);}}
 console.log('Retained '+generations.length+' previous browser asset generations');
}
