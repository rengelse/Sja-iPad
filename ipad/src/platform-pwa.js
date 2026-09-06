import { buildPdf, PDF_TEXT } from '../../src/shared/pdf.mjs';

const DB_NAME='sja-generator-ipad';
const DB_VERSION=2;
const VERSION='0.3.2';
const STORES={documents:'documents',people:'people',templates:'templates',settings:'settings'};

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORES.documents))db.createObjectStore(STORES.documents,{keyPath:'id'});
      if(!db.objectStoreNames.contains(STORES.people))db.createObjectStore(STORES.people,{keyPath:'key'});
      if(!db.objectStoreNames.contains(STORES.templates))db.createObjectStore(STORES.templates,{keyPath:'id'});
      if(!db.objectStoreNames.contains(STORES.settings))db.createObjectStore(STORES.settings,{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Kunne ikke åpne lokal lagring'));
  });
}

async function withStore(name,mode,fn){
  const db=await openDb();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(name,mode);const store=tx.objectStore(name);let result;
      Promise.resolve().then(()=>fn(store)).then(v=>{result=v;}).catch(reject);
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('Lagringsfeil'));tx.onabort=()=>reject(tx.error||new Error('Lagring avbrutt'));
    });
  }finally{db.close();}
}
function reqResult(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function all(name){return withStore(name,'readonly',store=>reqResult(store.getAll()));}
async function get(name,key){return withStore(name,'readonly',store=>reqResult(store.get(key)));}
async function put(name,value){return withStore(name,'readwrite',store=>reqResult(store.put(value)).then(()=>value));}
async function del(name,key){return withStore(name,'readwrite',store=>reqResult(store.delete(key)).then(()=>({ok:true})));}

function nextSjaNumberFrom(docs){
  const year=new Date().getFullYear();const re=new RegExp(`^SJA-${year}-(\\d{4,})$`,'i');let max=0;
  for(const d of docs){const m=String(d.sjaNo||'').match(re);if(m)max=Math.max(max,Number(m[1])||0);}
  return `SJA-${year}-${String(max+1).padStart(4,'0')}`;
}
async function listDocuments(){return (await all(STORES.documents)).filter(d=>d?.id).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));}
async function saveDocument(data){if(!data?.id)throw new Error('Document id is required');const clean={...data,storageVersion:1};await put(STORES.documents,clean);return clean;}
function personKey(name){return String(name||'').trim().toLocaleLowerCase();}
async function readPeople(){return (await all(STORES.people)).map(({key,...p})=>p).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));}
async function writePeople(items){
  const db=await openDb();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORES.people,'readwrite'),store=tx.objectStore(STORES.people);store.clear();
      for(const p of(items||[])){const name=String(p?.name||'').trim();if(!name)continue;store.put({key:personKey(name),name,department:String(p.department||'').trim(),role:String(p.role||'').trim(),updatedAt:p.updatedAt||new Date().toISOString()});}
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }finally{db.close();}
  return readPeople();
}

const DEFAULT_PROFILE={logoDataUrl:'',logoPosition:'bottom-right',slogan:'',sloganPosition:'top-left',accentColor:'#1A527D'};
const PROFILE_POSITIONS=new Set(['none','top-left','top-right','bottom-left','bottom-right']);
function normalizeProfile(input={}){
  const accent=/^#[0-9a-f]{6}$/i.test(String(input.accentColor||''))?String(input.accentColor).toUpperCase():DEFAULT_PROFILE.accentColor;
  return {logoDataUrl:String(input.logoDataUrl||''),logoPosition:PROFILE_POSITIONS.has(input.logoPosition)?input.logoPosition:DEFAULT_PROFILE.logoPosition,slogan:String(input.slogan||'').trim().slice(0,180),sloganPosition:PROFILE_POSITIONS.has(input.sloganPosition)?input.sloganPosition:DEFAULT_PROFILE.sloganPosition,accentColor:accent};
}
async function imageSourceToPngDataUrl(source,size=0){
  if(!source)throw new Error('Ingen logo valgt.');
  if(size>10*1024*1024)throw new Error('Logoen er for stor. Maksimal filstørrelse er 10 MB.');
  const image=await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Logoen kunne ikke leses. Bruk PNG, JPG eller WebP.'));
    img.src=source;
  });
  const maxW=1600,maxH=800;
  const scale=Math.min(maxW/image.naturalWidth,maxH/image.naturalHeight,1);
  const width=Math.max(1,Math.round(image.naturalWidth*scale));
  const height=Math.max(1,Math.round(image.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Kunne ikke behandle logoen.');
  ctx.drawImage(image,0,0,width,height);
  return canvas.toDataURL('image/png');
}
async function getProfile(){
  const row=await get(STORES.settings,'document-profile');
  let value=normalizeProfile(row?.value||DEFAULT_PROFILE);
  if(value.logoDataUrl&&!value.logoDataUrl.startsWith('data:image/png')){
    try{
      value=normalizeProfile({...value,logoDataUrl:await imageSourceToPngDataUrl(value.logoDataUrl)});
      await put(STORES.settings,{key:'document-profile',value});
    }catch(error){console.warn('Kunne ikke migrere eksisterende logo til PNG:',error);}
  }
  return value;
}
async function saveProfile(input){const old=await getProfile();const value=normalizeProfile({...old,...input,logoDataUrl:old.logoDataUrl||input?.logoDataUrl||''});await put(STORES.settings,{key:'document-profile',value});return value;}
async function imageFileToPngDataUrl(file){
  if(!file)throw new Error('Ingen logo valgt.');
  const sourceUrl=URL.createObjectURL(file);
  try{return await imageSourceToPngDataUrl(sourceUrl,file.size);}finally{URL.revokeObjectURL(sourceUrl);}
}
async function chooseProfileLogo(){
  return new Promise(resolve=>{
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file){resolve({ok:false});return;}
      try{
        const logoDataUrl=await imageFileToPngDataUrl(file);
        const old=await getProfile();const value=normalizeProfile({...old,logoDataUrl});
        await put(STORES.settings,{key:'document-profile',value});resolve({ok:true,profile:value});
      }catch(error){resolve({ok:false,error:String(error?.message||error)});}
    };
    input.click();
  });
}
async function removeProfileLogo(){const old=await getProfile();const value=normalizeProfile({...old,logoDataUrl:''});await put(STORES.settings,{key:'document-profile',value});return value;}

function pdfName(data){return `SJA-${String(data.sjaNo||data.workDescription||data.processTask||'document').replace(/[^a-z0-9-_]+/gi,'-')}.pdf`;}
let previewUrl='';
function showPdfPreview(bytes,title){
  if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  document.getElementById('ipadPdfPreview')?.remove();
  const modal=document.createElement('div');modal.id='ipadPdfPreview';modal.className='ipad-pdf-preview';modal.innerHTML=`<div class="ipad-pdf-toolbar"><strong>${title}</strong><button type="button" aria-label="Lukk">✕</button></div><iframe title="${title}" src="${previewUrl}"></iframe>`;
  modal.querySelector('button').onclick=()=>{modal.remove();if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}};
  document.body.appendChild(modal);return {ok:true};
}
async function exportPdf(data){
  const bytes=await buildPdf(data,await getProfile());const name=pdfName(data);const file=new File([bytes],name,{type:'application/pdf'});
  if(navigator.share&&navigator.canShare?.({files:[file]})){
    await navigator.share({title:name,files:[file]});return {ok:true,filePath:''};
  }
  const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return {ok:true,filePath:''};
}

export function createPwaPlatform(){
  return Object.freeze({
    kind:'ipad-pwa',
    documents:Object.freeze({
      list:listDocuments,
      get:id=>get(STORES.documents,id).then(v=>v||null),
      save:saveDocument,
      duplicate:async(id,options={})=>{const docs=await listDocuments();const source=docs.find(d=>d.id===id);if(!source)return null;const copy=structuredClone(source);const now=new Date().toISOString();const copyLabel=String(options?.copyLabel||'Copy').trim()||'Copy';const sourceTitle=String(source.workDescription||source.processTask||'').trim();const baseTitle=sourceTitle.replace(/\s*-\s*(?:Kopi|Copy)(?:\s+\d+)?\s*$/i,'').trim()||sourceTitle;const used=new Set(docs.map(d=>String(d.workDescription||d.processTask||'').trim().toLocaleLowerCase()));let title=`${baseTitle} - ${copyLabel}`.trim(),n=2;while(used.has(title.toLocaleLowerCase()))title=`${baseTitle} - ${copyLabel} ${n++}`;copy.id=crypto.randomUUID();copy.sjaNo=nextSjaNumberFrom(docs);copy.status='draft';copy.workDescription=title;copy.processTask=title;copy.createdAt=now;copy.updatedAt=now;delete copy._filePath;return saveDocument(copy);},
      delete:id=>del(STORES.documents,id),
      storageInfo:async()=>({path:'Lokalt på denne iPaden – fungerer offline'}),
      openFolder:async()=>({ok:true}),
      nextNumber:async()=>nextSjaNumberFrom(await listDocuments())
    }),
    people:Object.freeze({
      list:readPeople,
      remember:async items=>{const existing=await readPeople();const map=new Map(existing.map(p=>[personKey(p.name),p]));for(const p of(items||[])){const name=String(p?.name||'').trim();if(!name)continue;const key=personKey(name),old=map.get(key)||{};map.set(key,{name,department:String(p.department||old.department||'').trim(),role:String(p.role||old.role||'').trim(),updatedAt:new Date().toISOString()});}return writePeople([...map.values()]);},
      update:async(originalName,person)=>{const existing=await readPeople(),oldKey=personKey(originalName),name=String(person?.name||'').trim();if(!name)throw new Error('Name is required');const newKey=personKey(name);const filtered=existing.filter(p=>{const k=personKey(p.name);return k!==oldKey&&k!==newKey;});filtered.push({name,department:String(person?.department||'').trim(),role:String(person?.role||'').trim(),updatedAt:new Date().toISOString()});return writePeople(filtered);},
      delete:async name=>writePeople((await readPeople()).filter(p=>personKey(p.name)!==personKey(name)))
    }),
    templates:Object.freeze({
      list:async()=>(await all(STORES.templates)).filter(t=>t?.id).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))),
      save:async data=>{if(!data?.id)throw new Error('Template id is required');const clean={...data,updatedAt:new Date().toISOString()};await put(STORES.templates,clean);return clean;},
      delete:id=>del(STORES.templates,id)
    }),
    profile:Object.freeze({get:getProfile,save:saveProfile,chooseLogo:chooseProfileLogo,removeLogo:removeProfileLogo}),
    pdf:Object.freeze({preview:async data=>showPdfPreview(await buildPdf(data,await getProfile()),PDF_TEXT[data?.documentLanguage==='en'?'en':'no'].previewTitle),export:exportPdf}),
    updates:Object.freeze({
      info:async()=>({configured:true,checked:true,currentVersion:VERSION,latestVersion:VERSION,available:false}),
      check:async()=>({configured:true,checked:true,currentVersion:VERSION,latestVersion:VERSION,available:false}),
      install:async()=>({ok:true})
    }),
    files:Object.freeze({show:async()=>({ok:true})}),
    external:Object.freeze({open:async url=>{window.open(url,'_blank','noopener,noreferrer');return {ok:true};}})
  });
}
