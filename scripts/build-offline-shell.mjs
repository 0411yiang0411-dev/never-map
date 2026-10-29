import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const html=await readFile('dist/index.html','utf8');
const manifest=JSON.parse(await readFile('dist/.vite/manifest.json','utf8'));
const assets=new Set(['/index.html']);
function include(key){const entry=manifest[key];if(!entry)return;assets.add('/'+entry.file);for(const css of entry.css || [])assets.add('/'+css);for(const imported of entry.imports || [])if(!assets.has('/'+manifest[imported]?.file))include(imported);}
for(const [key,value] of Object.entries(manifest))if(value.isEntry || /zh-CN/.test(value.file))include(key);
const version=createHash('sha256').update(html).digest('hex').slice(0,16);
const template=await readFile('scripts/offline-shell-worker.js','utf8');
const entry=Object.values(manifest).find(value=>value.isEntry).file;
await writeFile('dist/offline-shell.js',template.replace('__CACHE_VERSION__',version).replace('__CORE_ASSETS__',JSON.stringify([...assets])).replace('__ENTRY_SCRIPT__',JSON.stringify('/'+entry)));
console.log(`Offline shell: ${assets.size} core resources, ${version}; API and private images excluded`);
