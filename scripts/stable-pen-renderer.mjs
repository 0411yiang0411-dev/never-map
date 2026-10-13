export function patchPenRenderer(code){
  const dev=/function getFreeDrawSvgPath\(element\) \{/;
  const prod=/function ([\w$]+)\(([\w$]+)\)\{(?=let [\w$]+=\2\.simulatePressure\?)/;
  const match=code.match(dev)||code.match(prod);if(!match)return null;
  const arg=match[2]||'element';
  return code.replace(match[0],match[0]+`if(${arg}.customData?.pressurePenV2){return __neverMapPressureGeometry(${arg}.points,${arg}.pressures,${arg}.customData.pressurePenV2.settings).path;}`);
}
export function stablePenRenderer(){let count=0;return {name:'never-map-stable-pen-renderer',enforce:'pre',transform(code,id){if(!id.includes('@excalidraw/excalidraw/dist/')||!id.endsWith('.js'))return null;const patched=patchPenRenderer(code);if(!patched)return null;count++;return {code:`import {pressureGeometry as __neverMapPressureGeometry} from ${JSON.stringify(new URL('../src/pen-pressure.mjs',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'))};\n`+patched,map:null};},buildStart(){count=0;},generateBundle(){if(count!==1)throw new Error('Expected exactly one pinned Excalidraw pressure renderer patch; review dependency version before deploying');}};}
