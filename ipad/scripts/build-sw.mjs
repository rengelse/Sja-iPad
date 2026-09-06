import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const dist=path.resolve(here,'..','dist');
async function walk(dir,base=''){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const rel=path.posix.join(base,entry.name);
    if(entry.isDirectory())out.push(...await walk(path.join(dir,entry.name),rel));
    else if(entry.name!=='sw.js')out.push(`./${rel}`);
  }
  return out;
}
const files=await walk(dist);
const source=`const CACHE='sja-ipad-v0.3.2';\nconst APP_FILES=${JSON.stringify(files,null,2)};\nself.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_FILES)).then(()=>self.skipWaiting()));});\nself.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});\nself.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(caches.match('./index.html').then(cached=>cached||fetch(event.request)));return;}event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone));}return response;})));});\n`;
await writeFile(path.join(dist,'sw.js'),source);
console.log(`Service worker generated with ${files.length} cached files.`);
