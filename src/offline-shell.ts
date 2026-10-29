/// <reference types="vite/client" />
export function registerOfflineShell(){
  if(!('serviceWorker' in navigator) || !window.isSecureContext || import.meta.env.DEV)return;
  let registration:ServiceWorkerRegistration|undefined,lastUpdate=0;
  const update=()=>{if(registration && navigator.onLine && Date.now()-lastUpdate>3600000){lastUpdate=Date.now();void registration.update().catch(()=>{});}};
  const start=()=>{void navigator.serviceWorker.register('/offline-shell.js',{updateViaCache:'none'}).then(async value=>{
    registration=value;lastUpdate=Date.now();
    const ready=await navigator.serviceWorker.ready;
    const urls=performance.getEntriesByType('resource').map(entry=>entry.name).filter(url=>{try{return new URL(url).origin===location.origin;}catch{return false;}});
    ready.active?.postMessage({type:'WARM_STATIC',urls});
  }).catch(()=>{});};
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
  for(const event of ['online','focus','never-map-resume'])window.addEventListener(event,update);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')update();});
}
