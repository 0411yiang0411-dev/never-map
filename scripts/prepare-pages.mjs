import {cp,mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
await mkdir('.tmp/pages',{recursive:true});
await cp('dist','.tmp/pages',{recursive:true});
await rm('.tmp/pages/.vite',{recursive:true,force:true});
await copyFile('deploy/pages/worker.mjs','.tmp/pages/_worker.js');
await writeFile('.tmp/pages/_routes.json',JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
console.log('Prepared static Pages editor and authenticated API service binding');
