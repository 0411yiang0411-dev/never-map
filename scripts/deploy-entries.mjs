// Deploy both public entries from one build; credentials stay in the environment.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
function run(args){
  const result=spawnSync(process.execPath,args,{cwd:root,env:process.env,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0){
    console.error('Deployment stopped. One entry may already be updated; verify both entries before reporting completion.');
    process.exit(result.status||1);
  }
}
run(['node_modules/wrangler/bin/wrangler.js','deploy']);
run(['scripts/prepare-pages.mjs']);
run(['node_modules/wrangler/bin/wrangler.js','--cwd','deploy/pages','pages','deploy','../../.tmp/pages','--project-name','never-map-0411yiang0411','--branch','main','--force']);
console.log('Both entries deployed from dist. Verify public assets and cloud save/reload next.');
