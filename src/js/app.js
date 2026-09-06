import { t } from './i18n.js';
import { newDocument, blankTask, normalizeDocument } from './model.js';
import { db as legacyDb } from './db.js';
import { activityLibrary, documentTemplates, textFor, taskFromActivity, getActivity, getTemplate } from './knowledge.js';
import { riskScore, riskLabel, riskClass, probabilityScale, consequenceScale, riskMatrixRows, scaleItem } from './risk.js';
import { getRuleProfile, evaluateRules, textForRule } from './rules.js';
import { platform } from './platform.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let lang=localStorage.getItem('sja-lang')||'no';
let theme=localStorage.getItem('sja-theme')||'system';
let current=null, saveTimer=null, saveQueue=Promise.resolve(), docs=[], customTemplates=[], storedPeople=[], documentProfile=null;
let transientMode=null, transientTemplateId='', transientTemplateName='';
let modalResolve=null;
const mainSectionState=new Map();
const smartReviewOpenState=new Map();

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(s){if(!s)return '';try{return new Intl.DateTimeFormat(lang==='no'?'nb-NO':'en-GB',{dateStyle:'medium'}).format(new Date(s));}catch{return s;}}
function fmtDateTime(s){if(!s)return '';try{return new Intl.DateTimeFormat(lang==='no'?'nb-NO':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s));}catch{return s;}}
function toast(msg,type='neutral',duration=2400){const el=$('#toast');el.textContent=msg;el.classList.remove('hidden','toast-error','toast-success');if(type==='error')el.classList.add('toast-error');if(type==='success')el.classList.add('toast-success');clearTimeout(el._timer);el._timer=setTimeout(()=>{el.classList.add('hidden');el.classList.remove('toast-error','toast-success');},duration);}
function showConfirmModal({title,message,confirmText,cancelText,danger=false}){
  return new Promise(resolve=>{
    modalResolve=resolve;
    const modal=$('#confirmModal');
    $('#confirmModalTitle').textContent=title||'';
    const modalText=$('#confirmModalText');
    modalText.textContent=message||'';
    modalText.classList.toggle('hidden',!message);
    const ok=$('#confirmModalOk'),cancel=$('#confirmModalCancel');
    ok.textContent=confirmText||t(lang,'confirm');
    cancel.textContent=cancelText||t(lang,'cancel');
    ok.classList.toggle('danger',!!danger); ok.classList.toggle('primary',!danger);
    modal.classList.remove('hidden');
    requestAnimationFrame(()=>ok.focus());
  });
}
function closeConfirmModal(result=false){const modal=$('#confirmModal');modal.classList.add('hidden');const resolve=modalResolve;modalResolve=null;if(resolve)resolve(result);}
function showTextInputModal({title,saveText,defaultValue=''}){
  return new Promise(resolve=>{
    const modal=$('#templateNameModal'),input=$('#templateNameInput');
    $('#templateNameTitle').textContent=title||'';
    $('#templateNameCancel').textContent=t(lang,'cancel');
    $('#templateNameSave').textContent=saveText||t(lang,'confirm');
    input.value=defaultValue||'';
    modal.classList.remove('hidden');
    requestAnimationFrame(()=>{input.focus();input.select();});
    const finish=value=>{modal.classList.add('hidden');$('#templateNameSave').onclick=null;$('#templateNameCancel').onclick=null;input.onkeydown=null;resolve(value);};
    $('#templateNameSave').onclick=()=>finish(input.value.trim());
    $('#templateNameCancel').onclick=()=>finish('');
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish(input.value.trim());}if(e.key==='Escape')finish('');};
  });
}
function showTemplateDetailsModal({name='',description='',title='',saveText='' }={}){
  return new Promise(resolve=>{
    const modal=$('#templateDetailsModal'),nameInput=$('#templateDetailsName'),descInput=$('#templateDetailsDescription');
    $('#templateDetailsTitle').textContent=title||t(lang,'templateDetailsTitle');
    $('#templateDetailsCancel').textContent=t(lang,'cancel');
    $('#templateDetailsSave').textContent=saveText||t(lang,'saveTemplate');
    descInput.placeholder=t(lang,'templateDescriptionPlaceholder');
    nameInput.value=name||''; descInput.value=description||'';
    modal.classList.remove('hidden');
    requestAnimationFrame(()=>{nameInput.focus();nameInput.select();});
    const finish=value=>{modal.classList.add('hidden');$('#templateDetailsSave').onclick=null;$('#templateDetailsCancel').onclick=null;nameInput.onkeydown=null;descInput.onkeydown=null;resolve(value);};
    $('#templateDetailsSave').onclick=()=>{const cleanName=nameInput.value.trim();if(!cleanName){nameInput.focus();return;}finish({name:cleanName,description:descInput.value.trim()});};
    $('#templateDetailsCancel').onclick=()=>finish(null);
    nameInput.onkeydown=e=>{if(e.key==='Escape')finish(null);};
    descInput.onkeydown=e=>{if(e.key==='Escape')finish(null);};
  });
}
function clone(v){return structuredClone(v);}
function riskOptions(kind,value){const scale=kind==='probability'?probabilityScale:consequenceScale;return `<option value="0" ${+value===0?'selected':''}>— ${t(lang,'notAssessed')}</option>`+(scale[lang]||scale.en).map(x=>`<option value="${x.value}" ${+value===x.value?'selected':''}>${x.value} – ${esc(x.label)}</option>`).join('');}


function relocalizeGeneratedTaskContent(targetLang){
  if(!current)return;
  const translateExact=(value,pairs)=>{
    const raw=String(value??'');
    for(const pair of pairs){
      if(!pair)continue;
      if(raw===String(pair.no??'')||raw===String(pair.en??'')) return textFor(pair,targetLang);
    }
    return raw;
  };
  const resolveLibrary=(task)=>{
    const direct=getActivity(task.libraryActivityId);if(direct)return direct;
    const raw=String(task.activity||'');
    return activityLibrary.find(a=>raw===String(a.name?.no||'')||raw===String(a.name?.en||''))||null;
  };
  for(const task of (current.tasks||[])){
    const lib=resolveLibrary(task); if(!lib)continue;
    if(!task.libraryActivityId)task.libraryActivityId=lib.id;
    task.activity=translateExact(task.activity,[lib.name]);
    const hazardPairs=lib.hazards.map(h=>h.label);
    const consequencePairs=lib.hazards.flatMap(h=>h.consequences||[]);
    const measurePairs=lib.hazards.flatMap(h=>(h.measures||[]).map(m=>m.label));
    const sourcePairs=lib.hazards.flatMap(h=>(h.measures||[]).map(m=>m.source).filter(Boolean));
    const questionPairs=(lib.questions||[]).map(q=>q.text);
    task.hazards=(task.hazards||[]).map(v=>translateExact(v,hazardPairs));
    task.consequences=(task.consequences||[]).map(v=>translateExact(v,consequencePairs));
    task.measures=(task.measures||[]).map(v=>translateExact(v,measurePairs));
    task.references=(task.references||[]).map(r=>({...r,title:translateExact(r.title,sourcePairs)}));
    task.smartChecks=(task.smartChecks||[]).map(q=>{
      const src=(lib.questions||[]).find(x=>x.id===q.id);
      return src?{...q,text:textFor(src.text,targetLang)}:{...q,text:translateExact(q.text,questionPairs)};
    });
  }
  for(const item of (current.checklist||[])){
    if(!item?.generatedFromTask||!item?.sourceTaskId)continue;
    const task=(current.tasks||[]).find(t=>t.id===item.sourceTaskId);
    const lib=task?resolveLibrary(task):null;
    if(!lib)continue;
    if(item.type==='section'){
      item.label={
        no:`Arbeidsspesifikke sjekkpunkter — ${textFor(lib.name,'no')}`,
        en:`Task-specific checklist — ${textFor(lib.name,'en')}`
      };
      continue;
    }
    if(item.type==='question'){
      const sourceQ=(lib.questions||[]).find(q=>q.id===item.sourceSmartCheckId);
      if(sourceQ)item.text={no:textFor(sourceQ.text,'no'),en:textFor(sourceQ.text,'en')};
      else {
        const pairs=(lib.questions||[]).map(q=>q.text);
        const rawNo=translateExact(item.text?.no??item.text,pairs);
        const rawEn=translateExact(item.text?.en??item.text,pairs);
        item.text={no:targetLang==='no'?rawNo:(item.text?.no||rawNo),en:targetLang==='en'?rawEn:(item.text?.en||rawEn)};
      }
    }
  }
}
function applyTheme(){const dark=theme==='dark'||(theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';$('#themeSelect').value=theme;}
function applyLang(){document.documentElement.lang=lang;relocalizeGeneratedTaskContent(lang);$$('[data-i18n]').forEach(el=>el.textContent=t(lang,el.dataset.i18n));$$('[data-i18n-placeholder]').forEach(el=>el.placeholder=t(lang,el.dataset.i18nPlaceholder));$$('[data-i18n-title]').forEach(el=>{const v=t(lang,el.dataset.i18nTitle);el.title=v;el.setAttribute('aria-label',v);});$('#languageSelect').value=lang;renderDocs();renderTemplateCards();renderActivityLibrary();renderParticipantDirectory();renderRiskMatrixPage();if(documentProfile)renderDocumentProfileSettings();if(current){renderRiskFactors();renderParticipants();renderTasks();renderChecklist();updateEditorTitle();renderQuality();updateDocumentStatusUI();}}
function showView(name){$$('.view').forEach(v=>v.classList.toggle('active',v.id===`${name}View`));$$('.top-nav-btn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(name!=='documents')$$('[data-home-tab]').forEach(b=>b.classList.remove('active'));}
function switchDocumentTab(name='documents'){const tab=name==='templates'?'templates':'documents';$('#documentsTab')?.classList.toggle('active',tab==='documents');$('#templatesTab')?.classList.toggle('active',tab==='templates');$('#documentsPageHead')?.classList.toggle('hidden',tab!=='documents');$('#templatesPageHead')?.classList.toggle('hidden',tab!=='templates');$$('[data-home-tab]').forEach(b=>b.classList.toggle('active',b.dataset.homeTab===tab));}
function clearTransientState(){transientMode=null;transientTemplateId='';transientTemplateName='';renderTransientUi();}
function renderTransientUi(){const banner=$('#templateDraftBanner');if(!banner)return;const isTransient=!!transientMode;banner.classList.toggle('hidden',!isTransient);$('#createTemplateDocumentBtn').classList.toggle('hidden',transientMode!=='template-preview');$('#closeTemplateBtn')?.classList.toggle('hidden',transientMode!=='template-preview');const helper=$('#templateDraftText');if(helper){helper.textContent='';helper.classList.add('hidden');}if(!isTransient)return;$('#templateDraftTitle').textContent=transientMode==='new-template'?t(lang,'newTemplate'):transientTemplateName||t(lang,'templates');}
async function refreshVersionInfo(check=false){try{const info=check?await platform.updates.check():await platform.updates.info();$('#installedVersion').textContent=info.currentVersion||'—';$('#latestVersion').textContent=info.latestVersion||'—';const badge=$('#updateStatusBadge'),msg=$('#updateMessage'),install=$('#installUpdate');badge.className='status-pill';install.classList.add('hidden');if(!info.configured){badge.textContent=t(lang,'updateNotConfigured');msg.textContent=t(lang,'updateAddressPending');return;}if(!info.checked){badge.textContent=t(lang,'updateNotChecked');msg.textContent=t(lang,'updateSourceGithub');return;}if(info.available){badge.textContent=t(lang,'updateAvailable');badge.classList.add('complete');msg.textContent=info.releaseName||`${t(lang,'updateAvailable')}: ${info.latestVersion}`;install.classList.remove('hidden');install.dataset.version=info.latestVersion||'';}else{badge.textContent=t(lang,'updateCurrent');badge.classList.add('complete');msg.textContent=t(lang,'updateCurrent');}}catch(error){$('#updateStatusBadge').textContent=t(lang,'updateCheckFailed');$('#updateMessage').textContent=error?.message||t(lang,'updateCheckFailed');}}

async function loadDocs(){docs=await platform.documents.list();customTemplates=await platform.templates.list();storedPeople=await platform.people.list();renderDocs();renderParticipantDirectory();renderTemplateCards();}
async function migrateLegacyDocuments(){const fileDocs=await platform.documents.list();if(fileDocs.length)return;try{const oldDocs=await legacyDb.list();for(const doc of oldDocs){if(doc?.id)await platform.documents.save(normalizeDocument(doc));}}catch(error){console.warn('Legacy IndexedDB migration skipped:',error);}}
function renderDocs(){const search=$('#search');if(!search)return;const q=(search.value||'').trim().toLowerCase();const filtered=docs.filter(d=>`${d.workDescription||d.processTask||''} ${d.siteArea||''} ${d.sjaNo||''} ${d.responsible||''}`.toLowerCase().includes(q));$('#stats').innerHTML=`<div class="stat"><b>${docs.length}</b><span>${t(lang,'documents')}</span></div><div class="stat"><b>${docs.filter(d=>d.status==='draft').length}</b><span>${t(lang,'drafts')}</span></div><div class="stat"><b>${docs.filter(d=>d.status==='complete').length}</b><span>${t(lang,'completed')}</span></div>`;const body=$('#docTableBody');body.innerHTML=filtered.map(d=>`<tr><td>${esc(d.sjaNo||'—')}</td><td><button class="link-button" data-open="${d.id}">${esc(d.workDescription||d.processTask||t(lang,'createTitle'))}</button></td><td>${esc(d.siteArea||'—')}</td><td>${esc(d.responsible||'—')}</td><td>${esc(fmtDate(d.date)||'—')}</td><td>${esc(fmtDateTime(d.updatedAt)||'—')}</td><td><span class="status-pill ${d.status==='complete'?'complete':''}">${t(lang,d.status==='complete'?'complete':'draft')}</span></td><td><div class="table-actions"><button class="ghost small" data-open="${d.id}">${t(lang,'edit')}</button><button class="ghost small" data-dup="${d.id}">${t(lang,'duplicate')}</button><button class="danger small" data-del="${d.id}">${t(lang,'delete')}</button></div></td></tr>`).join('');$('#emptyDocs').classList.toggle('hidden',filtered.length>0);$$('[data-open]').forEach(b=>b.onclick=()=>openExisting(b.dataset.open));$$('[data-dup]').forEach(b=>b.onclick=()=>duplicateDoc(b.dataset.dup));$$('[data-del]').forEach(b=>b.onclick=()=>deleteDoc(b.dataset.del));}

async function createNew(){const ok=await showConfirmModal({title:t(lang,'newSjaConfirmTitle'),confirmText:t(lang,'newSja'),cancelText:t(lang,'cancel')});if(!ok)return;clearTransientState();const doc=newDocument();doc.sjaNo=await platform.documents.nextNumber();doc.updatedAt=new Date().toISOString();await platform.documents.save(doc);await loadDocs();openEditor(doc);}
function templateWorkingCopy(id){
  const builtin=getTemplate(id);
  const custom=customTemplates.find(x=>x.id===id);
  let doc,name='';
  if(custom){doc=normalizeDocument(clone(custom.document));name=custom.name||t(lang,'customTemplate');}
  else if(builtin){doc=newDocument();doc.tasks=[];for(const activityId of builtin.activities){const task=taskFromActivity(activityId,lang);if(task)doc.tasks.push(task);}if(!doc.tasks.length)doc.tasks=[blankTask()];doc.workDescription=builtin.id==='blank'?'':textFor(builtin.name,lang);doc.processTask=doc.workDescription;name=textFor(builtin.name,lang);}
  if(!doc)return null;doc.id=crypto.randomUUID();doc.sjaNo='';doc.status='draft';doc.participants=[];doc.createdAt=new Date().toISOString();doc.updatedAt=doc.createdAt;moveTaskSmartChecksToChecklist(doc);return {doc,name};
}
async function previewTemplate(id){const built=templateWorkingCopy(id);if(!built)return;current=built.doc;transientMode='template-preview';transientTemplateId=id;transientTemplateName=built.name;openEditor(current,{transient:true});setEditorLocked(true);renderTransientUi();}
async function commitTemplateDraft(){if(!current||transientMode!=='template-preview')return;current.id=crypto.randomUUID();current.sjaNo=await platform.documents.nextNumber();current.status='draft';current.createdAt=new Date().toISOString();current.updatedAt=current.createdAt;await platform.documents.save(current);const created=normalizeDocument(clone(current));clearTransientState();await loadDocs();openEditor(created);$('#saveState').textContent=t(lang,'saved');toast(t(lang,'sjaCreatedFromTemplate'));}
function createNewTemplateDraft(){const doc=newDocument();doc.id=crypto.randomUUID();doc.sjaNo='';doc.status='draft';doc.participants=[];current=doc;transientMode='new-template';transientTemplateId='';transientTemplateName='';openEditor(doc,{transient:true});renderTransientUi();}
async function openExisting(id){const d=await platform.documents.get(id);if(d)openEditor(normalizeDocument(d));}
async function duplicateDoc(id){const copy=await platform.documents.duplicate(id,{copyLabel:t(lang,'copySuffix')});await loadDocs();if(copy)openEditor(normalizeDocument(copy));}
async function deleteDoc(id){const doc=docs.find(d=>d.id===id);const title=doc?.workDescription||doc?.processTask||doc?.sjaNo||t(lang,'createTitle');const ok=await showConfirmModal({title:t(lang,'deleteSjaTitle'),message:t(lang,'confirmDeleteNamed').replace('{name}',title),confirmText:t(lang,'delete'),cancelText:t(lang,'cancel'),danger:true});if(!ok)return;await platform.documents.delete(id);await loadDocs();}


function moveTaskSmartChecksToChecklist(doc){
  if(!doc) return;
  doc.checklist=Array.isArray(doc.checklist)?doc.checklist:[];
  (doc.tasks||[]).forEach((task,taskIndex)=>{
    const checks=Array.isArray(task.smartChecks)?task.smartChecks:[];
    if(!checks.length) return;
    const sourceTaskId=task.id||`task-${taskIndex}`;
    const already=doc.checklist.some(x=>x?.sourceTaskId===sourceTaskId);
    if(!already){
      const library=getActivity(task.libraryActivityId);
      const titleNo=library?textFor(library.name,'no'):(task.activity||`Arbeidsoppgave ${taskIndex+1}`);
      const titleEn=library?textFor(library.name,'en'):(task.activity||`Work activity ${taskIndex+1}`);
      doc.checklist.push({type:'section',id:crypto.randomUUID(),label:{no:`Arbeidsspesifikke sjekkpunkter — ${titleNo}`,en:`Task-specific checklist — ${titleEn}`},sourceTaskId,generatedFromTask:true});
      checks.forEach(q=>{const sourceQ=library?.questions?.find(x=>x.id===q.id);doc.checklist.push({type:'question',id:crypto.randomUUID(),text:{no:sourceQ?.text?.no||q.text||'',en:sourceQ?.text?.en||q.text||''},answer:q.answer==='na'?'':(q.answer||''),comment:q.comment||'',critical:!!q.critical,sourceTaskId,sourceSmartCheckId:q.id||'',generatedFromTask:true});});
    }
    task.smartChecks=[];
  });
}
function removeTaskChecklistItems(taskId){
  if(!current||!taskId) return;
  current.checklist=(current.checklist||[]).filter(x=>x?.sourceTaskId!==taskId);
}

function editorStateKey(){return current?.id||current?.sjaNo||transientTemplateId||'transient';}
function defaultSectionState(){return {'section-basic':true,'section-participants':false,'section-risks':false,'section-checklist':false,'section-finish':false};}
function sectionState(){const key=editorStateKey();if(!mainSectionState.has(key))mainSectionState.set(key,defaultSectionState());return mainSectionState.get(key);}
function setSectionOpen(id,open,{scroll=false}={}){const section=document.getElementById(id);if(!section)return;sectionState()[id]=!!open;section.classList.toggle('collapsed',!open);const toggle=section.querySelector('[data-section-toggle]');if(toggle){toggle.setAttribute('aria-expanded',String(!!open));const chevron=toggle.querySelector('.section-chevron');if(chevron)chevron.textContent=open?'⌃':'⌄';}if(scroll){requestAnimationFrame(()=>section.scrollIntoView({behavior:'smooth',block:'start'}));}requestAnimationFrame(updateActiveSectionNav);}
function applySectionState(){const state=sectionState();$$('[data-main-section]').forEach(section=>setSectionOpen(section.id,state[section.id]!==false));updateSectionSummaries();}
function updateSectionSummaries(){if(!current)return;syncBasic();const basicOk=!!String(current.workDescription||'').trim()&&!!String(current.responsible||'').trim()&&!!String(current.date||'').trim();const participants=(current.participants||[]).filter(p=>String(p.name||'').trim()).length;const tasks=(current.tasks||[]).filter(task=>String(task.activity||'').trim()||(task.hazards||[]).some(v=>String(v||'').trim())).length;const checklist=(current.checklist||[]).filter(x=>x.type==='question').length;const finishOk=qualityIssues().length===0;const values={'section-basic':basicOk?'✓':'','section-participants':participants?String(participants):'','section-risks':tasks?String(tasks):'','section-checklist':checklist?String(checklist):'','section-finish':finishOk?'✓':''};Object.entries(values).forEach(([id,value])=>{const el=document.querySelector(`[data-section-summary="${id}"]`);if(el)el.textContent=value;});}
function isSmartReviewOpen(task){if(!task?.id)return true;if(!smartReviewOpenState.has(task.id))smartReviewOpenState.set(task.id,true);return smartReviewOpenState.get(task.id)!==false;}
function openEditor(doc,{transient=false}={}){current=normalizeDocument(doc);moveTaskSmartChecksToChecklist(current);relocalizeGeneratedTaskContent(lang);fillBasic();renderParticipants();renderTasks();renderChecklist();renderQuality();updateEditorTitle();updateDocumentStatusUI();showView('editor');renderTransientUi();if(transientMode==='template-preview')setEditorLocked(true);applySectionState();window.scrollTo({top:0,behavior:'instant'});requestAnimationFrame(updateActiveSectionNav);}
function updateEditorTitle(){if(!current)return;$('#editorTitle').textContent=current.workDescription||current.processTask||current.sjaNo||t(lang,'createTitle');}
function fillBasic(){const f=$('#sjaForm');['workDescription','siteArea','sjaNo','responsible','date','additionalComments'].forEach(k=>{if(f.elements[k])f.elements[k].value=current[k]??'';});renderRiskFactors();}
function syncBasic(){if(!current)return;const f=$('#sjaForm');['workDescription','siteArea','sjaNo','responsible','date','additionalComments'].forEach(k=>{if(f.elements[k])current[k]=f.elements[k].value;});current.processTask=current.workDescription;updateEditorTitle();}
async function saveNow(){if(!current)return;clearTimeout(saveTimer);syncBasic();if(transientMode){current.updatedAt=new Date().toISOString();$('#saveState').textContent=t(lang,'notCreatedYet');renderQuality();return;}$('#saveState').textContent=t(lang,'saving');current.updatedAt=new Date().toISOString();const snapshot=clone(current);const documentId=snapshot.id;saveQueue=saveQueue.catch(()=>{}).then(async()=>{await platform.documents.save(snapshot);const people=await platform.people.remember(snapshot.participants||[]);if(current?.id===documentId){storedPeople=people;renderParticipantDirectory();$('#saveState').textContent=`${t(lang,'saved')} ${new Date().toLocaleTimeString(lang==='no'?'nb-NO':'en-GB',{hour:'2-digit',minute:'2-digit'})}`;renderQuality();}});return saveQueue;}
function scheduleSave(){if(!current||current.status==='complete')return;syncBasic();updateDocumentStatusUI();renderQuality();updateSectionSummaries();clearTimeout(saveTimer);if(transientMode){$('#saveState').textContent=t(lang,'notCreatedYet');return;}$('#saveState').textContent=t(lang,'saving');saveTimer=setTimeout(()=>saveNow().catch(e=>toast(e.message)),450);}

function renderParticipants(){const el=$('#participantList');if(!current)return;el.innerHTML=current.participants?.length?current.participants.map((p,i)=>`<div class="participant-row"><label class="participant-name-wrap"><span>${t(lang,'name')}</span><input data-p="${i}" data-k="name" autocomplete="off" value="${esc(p.name)}"><div class="participant-suggestions hidden" data-ps="${i}"></div></label><label><span>${t(lang,'department')}</span><input data-p="${i}" data-k="department" value="${esc(p.department)}"></label><label><span>${t(lang,'role')}</span><input data-p="${i}" data-k="role" value="${esc(p.role)}"></label><button type="button" class="danger" data-prm="${i}">${t(lang,'remove')}</button></div>`).join(''):`<div class="empty compact">${t(lang,'participants')}</div>`;bindDynamic();updateSectionSummaries();}
function participantSuggestionsFor(value=''){const q=String(value||'').trim().toLowerCase();return participantDirectory().filter(p=>!q||p.name.toLowerCase().includes(q)||String(p.department||'').toLowerCase().includes(q)||String(p.role||'').toLowerCase().includes(q)).slice(0,10);}
function closeParticipantSuggestions(except=null){$$('.participant-suggestions').forEach(el=>{if(el!==except)el.classList.add('hidden');});}
function showParticipantSuggestions(input,index){const box=document.querySelector(`[data-ps="${index}"]`);if(!box)return;const items=participantSuggestionsFor(input.value);if(!items.length){box.classList.add('hidden');box.innerHTML='';return;}box.innerHTML=items.map((p,si)=>`<button type="button" class="participant-suggestion" data-psel="${index}" data-psi="${si}"><strong>${esc(p.name)}</strong><small>${esc([p.department,p.role].filter(Boolean).join(' — '))}</small></button>`).join('');box.classList.remove('hidden');box.querySelectorAll('[data-psel]').forEach((btn,si)=>btn.onmousedown=e=>{e.preventDefault();const person=items[si];const target=current.participants[index];target.name=person.name;target.department=person.department||'';target.role=person.role||'';renderParticipants();scheduleSave();});}
function addParticipant(){current.participants.push({id:crypto.randomUUID(),name:'',department:'',role:'',date:current.date||''});renderParticipants();scheduleSave();}
function lines(a){return(a||[]).join('\n');}
function riskBlock(task,i,key,labelKey,locked=false){const r=task[key]||{};const score=riskScore(r);const pItem=scaleItem('probability',lang,r.probability),cItem=scaleItem('consequence',lang,r.consequence);return `<div class="risk-box ${locked?'risk-locked':''}"><strong>${t(lang,labelKey)}</strong><div class="risk-controls"><label><span>${t(lang,'probability')}</span><select data-risk="${i}" data-risk-key="${key}" data-risk-field="probability" ${locked?'disabled':''}>${riskOptions('probability',r.probability)}</select>${pItem?`<small class="risk-choice-help">${esc(pItem.description)}</small>`:''}</label><span class="risk-times">×</span><label><span>${t(lang,'severity')}</span><select data-risk="${i}" data-risk-key="${key}" data-risk-field="consequence" ${locked?'disabled':''}>${riskOptions('consequence',r.consequence)}</select>${cItem?`<small class="risk-choice-help">${esc(cItem.description)}</small>`:''}</label><div class="risk-score ${riskClass(r,current?.riskModelVersion)}"><span>${t(lang,'score')}</span><b>${locked?'—':(score||'—')}</b><small>${locked?t(lang,'residualLocked'):riskLabel(lang,r,current?.riskModelVersion)}</small></div></div></div>`;}
function riskAssessmentEditor(task,i){const ms=measureStats(task),locked=!ms.allDone;return `<section class="risk-workflow"><div class="risk-workflow-head"><div><strong>${t(lang,'riskAssessment')}</strong><span>${t(lang,'riskAssessmentHint')}</span></div><span class="risk-method-note">${t(lang,'riskScaleNote')}</span></div><div class="risk-grid">${riskBlock(task,i,'riskBefore','beforeMeasures')}${riskBlock(task,i,'riskAfter','afterMeasures',locked)}</div></section>`;}

function ruleFieldControl(field,taskIndex,context){
  const value=context?.[field.id];
  if(field.type==='boolean') return `<label class="rule-field check-field"><span>${esc(textForRule(field.label,lang))}</span><select data-rule="${taskIndex}" data-rule-field="${field.id}" data-rule-type="boolean"><option value="" ${value===undefined||value===null?'selected':''}>—</option><option value="true" ${value===true?'selected':''}>${t(lang,'yes')}</option><option value="false" ${value===false?'selected':''}>${t(lang,'no')}</option></select></label>`;
  if(field.type==='select') return `<label class="rule-field"><span>${esc(textForRule(field.label,lang))}</span><select data-rule="${taskIndex}" data-rule-field="${field.id}" data-rule-type="select">${(field.options||[]).map(([v,l])=>`<option value="${esc(v)}" ${String(value??'')===v?'selected':''}>${esc(textForRule(l,lang))}</option>`).join('')}</select></label>`;
  return `<label class="rule-field"><span>${esc(textForRule(field.label,lang))}</span><input type="number" min="${field.min??''}" step="${field.step??'any'}" data-rule="${taskIndex}" data-rule-field="${field.id}" data-rule-type="number" value="${esc(value??'')}"></label>`;
}
function renderRuleEngine(task,i){
  const profile=getRuleProfile(task.libraryActivityId); if(!profile)return '';
  const context=task.ruleContext||{}; const findings=evaluateRules(task.libraryActivityId,context);
  task.ruleFindings=findings.map(r=>({id:r.id,severity:r.severity,type:r.type,text:textForRule(r.text,lang),source:r.source||'',title:textForRule(r.title,lang)}));
  const incomplete=profile.fields.some(f=>f.required!==false&&(context[f.id]===undefined||context[f.id]===null||context[f.id]===''));
  return `<details class="task-subsection rule-engine" data-smart-review="${esc(task.id||String(i))}" ${isSmartReviewOpen(task)?'open':''}><summary><span>${t(lang,'smartReview')}</span><span class="summary-meta">${incomplete?t(lang,'needsReview'):t(lang,'reviewed')}</span></summary><p class="muted small-note">${t(lang,'ruleAssessmentHint')}</p><div class="rule-fields">${profile.fields.map(f=>ruleFieldControl(f,i,context)).join('')}</div><div class="rule-findings">${findings.length?findings.map(r=>`<div class="rule-finding ${r.severity}"><div><span class="rule-kind">${t(lang,'rule_'+r.type)}</span><strong>${esc(textForRule(r.text,lang))}</strong><small>${esc(textForRule(r.title,lang))}</small></div></div>`).join(''):`<div class="rule-clear">✓ ${t(lang,'noTriggeredRules')}</div>`}</div></details>`;
}


function hazardRowCount(task){return Math.max(task.hazards?.length||0,task.consequences?.length||0,task.measures?.length||0,1);}
function verificationFor(task,idx){task.measureVerification=Array.isArray(task.measureVerification)?task.measureVerification:[];while(task.measureVerification.length<=idx)task.measureVerification.push({implemented:false,note:''});return task.measureVerification[idx];}
function measureStats(task){const indexes=(task.measures||[]).map((v,i)=>String(v||'').trim()?i:-1).filter(i=>i>=0);const done=indexes.filter(i=>verificationFor(task,i).implemented).length;return {total:indexes.length,done,pending:indexes.length-done,allDone:indexes.length>0&&done===indexes.length};}
function hazardRows(task,taskIndex){
  const count=hazardRowCount(task);
  return `<div class="hazard-table"><div class="hazard-table-head"><span>${t(lang,'hazards')}</span><span>${t(lang,'consequences')}</span><span>${t(lang,'measures')}</span><span>${t(lang,'status')}</span><span></span></div>${Array.from({length:count},(_,idx)=>{const v=verificationFor(task,idx);return `<div class="hazard-line"><textarea rows="2" class="hazard-textarea" data-hrow="${taskIndex}" data-hkey="hazards" data-hi="${idx}" placeholder="${t(lang,'hazards')}">${esc(task.hazards?.[idx]||'')}</textarea><textarea rows="2" class="hazard-textarea" data-hrow="${taskIndex}" data-hkey="consequences" data-hi="${idx}" placeholder="${t(lang,'consequences')}">${esc(task.consequences?.[idx]||'')}</textarea><textarea rows="2" class="hazard-textarea" data-hrow="${taskIndex}" data-hkey="measures" data-hi="${idx}" placeholder="${t(lang,'measures')}">${esc(task.measures?.[idx]||'')}</textarea><select class="measure-status ${v.implemented?'done':'pending'}" data-measure-status="${taskIndex}" data-hi="${idx}"><option value="false" ${!v.implemented?'selected':''}>${t(lang,'controlNotImplemented')}</option><option value="true" ${v.implemented?'selected':''}>${t(lang,'controlImplemented')}</option></select><button type="button" class="icon-remove" data-hrow-rm="${taskIndex}" data-hi="${idx}" title="${t(lang,'remove')}">×</button></div>`;}).join('')}<button type="button" class="secondary small hazard-add-row" data-hrow-add="${taskIndex}">+ ${t(lang,'addHazardRow')}</button></div>`;
}

function renderRiskSidebar(){
  const el=$('#riskSidebar'); if(!el||!current)return;
  el.innerHTML=`<div class="risk-sidebar-head"><strong>${t(lang,'riskAssessment')}</strong><span>${t(lang,'riskSidebarHint')}</span></div>`+(current.tasks||[]).map((task,i)=>{const before=riskScore(task.riskBefore),after=riskScore(task.riskAfter),ms=measureStats(task),locked=!ms.allDone;const beforeText=before?`${task.riskBefore?.probability||'—'} × ${task.riskBefore?.consequence||'—'} = ${before}`:'—';const afterText=!locked&&after?`${task.riskAfter?.probability||'—'} × ${task.riskAfter?.consequence||'—'} = ${after}`:'—';return `<div class="risk-side-task"><a href="#section-risks" class="risk-side-title">3.${i+1} ${esc(task.activity||t(lang,'newActivity'))}</a><div class="measure-progress ${ms.allDone?'complete':''}"><span>${t(lang,'measureProgress')}</span><strong>${ms.done}/${ms.total||0}</strong></div><div class="risk-side-pair"><div><span>${t(lang,'beforeMeasures')}</span><div class="risk-side-readout"><strong class="risk-mini ${riskClass(task.riskBefore,current?.riskModelVersion)}">${beforeText}</strong><small>${riskLabel(lang,task.riskBefore,current?.riskModelVersion)}</small></div></div><div class="${locked?'risk-locked':''}"><span>${t(lang,'afterMeasures')}</span><div class="risk-side-readout"><strong class="risk-mini ${riskClass(task.riskAfter,current?.riskModelVersion)}">${afterText}</strong><small>${locked?t(lang,'residualLocked'):riskLabel(lang,task.riskAfter,current?.riskModelVersion)}</small></div></div></div></div>`;}).join('');
}

function renderTasks(){
  const el=$('#taskList');if(!current)return;
  el.innerHTML=(current.tasks||[]).map((r,i)=>`<article class="task-card"><div class="task-top"><div class="task-heading"><span class="task-number">3.${i+1}</span><div><strong>${r.activity?esc(r.activity):t(lang,'newActivity')}</strong>${r.libraryActivityId?`<span class="library-tag">${t(lang,'autoSuggested')}</span>`:''}</div></div><button type="button" class="danger small" data-trm="${i}">${t(lang,'removeActivity')}</button></div><label class="activity-name"><span>${t(lang,'activity')}</span><input data-t="${i}" data-k="activity" value="${esc(r.activity)}" placeholder="${t(lang,'describeActivity')}"></label>${hazardRows(r,i)}${riskAssessmentEditor(r,i)}${renderRuleEngine(r,i)}</article>`).join('');renderRiskSidebar();bindDynamic();updateSectionSummaries();
}

function renderChecklist(){const pl=lang;$('#checklistList').innerHTML=(current.checklist||[]).map((it,i)=>it.type==='section'?`<div class="section-row editable-check-section"><input data-qtext="${i}" value="${esc((typeof it.label==='string'?it.label:(it.label?.[pl]||it.label?.en||it.label?.no||'')))}" aria-label="${t(lang,'checklistSection')}"><button type="button" class="icon-remove" data-qrm="${i}" title="${t(lang,'remove')}">×</button></div>`:`<div class="check-row checklist-design-row"><input class="check-question-input" data-qtext="${i}" value="${esc((typeof it.text==='string'?it.text:(it.text?.[pl]||it.text?.en||it.text?.no||'')))}" aria-label="${t(lang,'checklistQuestion')}"><span class="checklist-pdf-note">${t(lang,'checkInPdf')}</span><button type="button" class="icon-remove" data-qrm="${i}" title="${t(lang,'remove')}">×</button></div>`).join('');bindDynamic();updateDocumentStatusUI();updateSectionSummaries();}
function addChecklistItem(){current.checklist.push({type:'question',id:crypto.randomUUID(),text:{no:t('no','newChecklistItem'),en:t('en','newChecklistItem')},answer:'',comment:''});renderChecklist();scheduleSave();}
function addChecklistSection(){current.checklist.push({type:'section',id:crypto.randomUUID(),label:{no:t('no','newChecklistSection'),en:t('en','newChecklistSection')}});renderChecklist();scheduleSave();}

function bindDynamic(){
  $$('[data-p]').forEach(el=>{el.oninput=()=>{const idx=+el.dataset.p,p=current.participants[idx];p[el.dataset.k]=el.value;if(el.dataset.k==='name')showParticipantSuggestions(el,idx);scheduleSave();};if(el.dataset.k==='name'){el.onfocus=()=>{closeParticipantSuggestions(document.querySelector(`[data-ps=\"${el.dataset.p}\"]`));showParticipantSuggestions(el,+el.dataset.p);};el.onblur=()=>setTimeout(()=>document.querySelector(`[data-ps=\"${el.dataset.p}\"]`)?.classList.add('hidden'),120);}});
  $$('[data-prm]').forEach(el=>el.onclick=()=>{current.participants.splice(+el.dataset.prm,1);renderParticipants();scheduleSave();});
  $$('[data-t]').forEach(el=>el.oninput=()=>{const row=current.tasks[+el.dataset.t],k=el.dataset.k;row[k]=el.value;if(k==='activity'&&row.customActivity)renderRiskFactors();scheduleSave();});
  $$('[data-hrow]').forEach(el=>el.oninput=()=>{const task=current.tasks[+el.dataset.hrow],key=el.dataset.hkey,idx=+el.dataset.hi;while(task[key].length<=idx)task[key].push('');task[key][idx]=el.value;if(key==='measures')verificationFor(task,idx);scheduleSave();});
  $$('[data-measure-status]').forEach(el=>el.onchange=()=>{const task=current.tasks[+el.dataset.measureStatus],v=verificationFor(task,+el.dataset.hi);v.implemented=el.value==='true';if(!v.implemented){task.riskAfter={probability:0,consequence:0};}renderTasks();scheduleSave();});
  $$('[data-hrow-rm]').forEach(el=>el.onclick=()=>{const task=current.tasks[+el.dataset.hrowRm],idx=+el.dataset.hi;['hazards','consequences','measures'].forEach(key=>{if(idx<task[key].length)task[key].splice(idx,1);});if(idx<(task.measureVerification||[]).length)task.measureVerification.splice(idx,1);renderTasks();scheduleSave();});
  $$('[data-hrow-add]').forEach(el=>el.onclick=()=>{const task=current.tasks[+el.dataset.hrowAdd],count=hazardRowCount(task);['hazards','consequences','measures'].forEach(key=>{while(task[key].length<count)task[key].push('');task[key].push('');});while((task.measureVerification||[]).length<count)task.measureVerification.push({implemented:false,note:''});task.measureVerification.push({implemented:false,note:''});renderTasks();scheduleSave();});
  $$('[data-trm]').forEach(el=>el.onclick=()=>{const idx=+el.dataset.trm;const task=current.tasks[idx];if(task?.id)removeTaskChecklistItems(task.id);if(task?.libraryActivityId&&task.autoGenerated)current.riskFactors=(current.riskFactors||[]).filter(id=>id!==task.libraryActivityId);if(current.tasks.length>1)current.tasks.splice(idx,1);else current.tasks[0]=blankTask();renderTasks();renderRiskFactors();renderChecklist();scheduleSave();});
  $$('[data-risk]').forEach(el=>el.onchange=()=>{const task=current.tasks[+el.dataset.risk];task[el.dataset.riskKey][el.dataset.riskField]=+el.value;renderTasks();scheduleSave();});
  $$('[data-rule]').forEach(el=>el.onchange=()=>{const task=current.tasks[+el.dataset.rule];task.ruleContext=task.ruleContext||{};let v=el.value;if(el.dataset.ruleType==='boolean')v=v===''?null:v==='true';if(el.dataset.ruleType==='number')v=v===''?null:+v;task.ruleContext[el.dataset.ruleField]=v;renderTasks();scheduleSave();});
  $$('[data-open-rule-source]').forEach(el=>el.onclick=()=>platform.external.open?.(el.dataset.openRuleSource));
  $$('[data-qtext]').forEach(el=>el.oninput=()=>{const item=current.checklist[+el.dataset.qtext];const value=el.value;if(item.type==='section'){const previous=typeof item.label==='object'&&item.label?item.label:{};item.label={...previous,[lang]:value};if(!item.label.no)item.label.no=value;if(!item.label.en)item.label.en=value;}else{const previous=typeof item.text==='object'&&item.text?item.text:{};item.text={...previous,[lang]:value};if(!item.text.no)item.text.no=value;if(!item.text.en)item.text.en=value;}scheduleSave();});
  $$('[data-qrm]').forEach(el=>el.onclick=()=>{current.checklist.splice(+el.dataset.qrm,1);renderChecklist();scheduleSave();});
  $$('[data-smart-review]').forEach(el=>el.ontoggle=()=>{smartReviewOpenState.set(el.dataset.smartReview,el.open);});
  $$('.hazard-textarea').forEach(el=>{const resize=()=>{el.style.height='auto';el.style.height=Math.max(46,el.scrollHeight)+'px';};resize();el.addEventListener('input',resize);});
}

const riskFactorLabels={boom_lift:{no:'Lift / personløfter',en:'Lift / MEWP'},roof:{no:'Arbeid i høyden / tak',en:'Work at height / roof'},ladder:{no:'Stige',en:'Ladder'},scaffold:{no:'Stillas',en:'Scaffold'},lifting:{no:'Løfteoperasjon',en:'Lifting operation'},hot_work:{no:'Varme arbeider',en:'Hot work'},chemicals:{no:'Kjemikalier',en:'Chemicals'},electrical:{no:'Elektrisk risiko',en:'Electrical risk'},traffic:{no:'Trafikk / kjøretøy',en:'Traffic / vehicles'},confined:{no:'Lukket rom',en:'Confined space'},excavation:{no:'Graving / grøft',en:'Excavation / trench'},manual:{no:'Manuell håndtering',en:'Manual handling'},pressure_wash:{no:'Høytrykksspyling',en:'Pressure washing'},alone:{no:'Alenearbeid',en:'Working alone'}};
function riskFactorLabel(id){return riskFactorLabels[id]?.[lang]||textFor(getActivity(id)?.name,lang)||id;}
function renderActivityLibrary(){const select=$('#riskFactorSelect');if(!select)return;select.innerHTML=`<option value="">${t(lang,'chooseRiskFactor')}</option>`+activityLibrary.map(a=>`<option value="${a.id}">${esc(riskFactorLabel(a.id))}</option>`).join('');renderRiskFactors();}
function renderRiskFactors(){const el=$('#riskFactorChips');if(!el||!current)return;current.riskFactors=current.riskFactors||[];const standard=current.riskFactors.map(id=>`<span class="risk-chip">${esc(riskFactorLabel(id))}<button type="button" data-rf-rm="${esc(id)}" aria-label="${t(lang,'remove')}">×</button></span>`).join('');const custom=(current.tasks||[]).filter(task=>task.customActivity).map(task=>`<span class="risk-chip custom-risk-chip">${esc(task.activity||t(lang,'newActivity'))}<button type="button" data-custom-rf-rm="${esc(task.id)}" aria-label="${t(lang,'remove')}">×</button></span>`).join('');el.innerHTML=standard+custom;$$('[data-rf-rm]').forEach(b=>b.onclick=()=>removeRiskFactor(b.dataset.rfRm));$$('[data-custom-rf-rm]').forEach(b=>b.onclick=()=>removeCustomActivity(b.dataset.customRfRm));}
function addSelectedRiskFactor(){const id=$('#riskFactorSelect').value;if(!id||current.riskFactors.includes(id))return;current.riskFactors.push(id);const task=taskFromActivity(id,lang);if(task){task.autoGenerated=true;if(current.tasks.length===1&&!current.tasks[0].activity&&!current.tasks[0].hazards.length)current.tasks[0]=task;else current.tasks.push(task);}moveTaskSmartChecksToChecklist(current);$('#riskFactorSelect').value='';renderRiskFactors();renderTasks();renderChecklist();scheduleSave();}
async function addCustomRiskFactor(){
  if(!current)return;
  const name=await showTextInputModal({title:t(lang,'customActivityTitle'),saveText:t(lang,'add'),defaultValue:''});
  if(!name)return;
  const task=blankTask();task.activity=name;task.customActivity=true;task.autoGenerated=false;
  if(current.tasks.length===1&&!current.tasks[0].activity&&!current.tasks[0].hazards.length)current.tasks[0]=task;else current.tasks.push(task);
  renderRiskFactors();renderTasks();scheduleSave();
}
function removeCustomActivity(id){const idx=(current.tasks||[]).findIndex(task=>task.id===id&&task.customActivity);if(idx<0)return;const task=current.tasks[idx];removeTaskChecklistItems(task.id);current.tasks.splice(idx,1);if(!current.tasks.length)current.tasks.push(blankTask());renderRiskFactors();renderTasks();renderChecklist();scheduleSave();}
function removeRiskFactor(id){current.riskFactors=current.riskFactors.filter(x=>x!==id);const idx=current.tasks.findIndex(t=>t.libraryActivityId===id&&t.autoGenerated);if(idx>=0){const task=current.tasks[idx];removeTaskChecklistItems(task.id);current.tasks.splice(idx,1);}if(!current.tasks.length)current.tasks.push(blankTask());renderRiskFactors();renderTasks();renderChecklist();scheduleSave();}

async function editCustomTemplate(id){
  const tm=customTemplates.find(x=>x.id===id);if(!tm)return;
  const details=await showTemplateDetailsModal({name:tm.name||'',description:tm.description||'',title:t(lang,'editTemplateTitle'),saveText:t(lang,'confirm')});
  if(!details)return;
  const saved=await platform.templates.save({...tm,name:details.name,description:details.description});
  if(!saved?.id)throw new Error(t(lang,'templateSaveFailed'));
  customTemplates=await platform.templates.list();renderTemplateCards();toast(t(lang,'templateUpdated'));
}
async function deleteCustomTemplate(id){
  const ok=await showConfirmModal({title:t(lang,'deleteTemplate'),message:t(lang,'confirmDeleteTemplate'),confirmText:t(lang,'deleteTemplate'),cancelText:t(lang,'cancel'),danger:true});
  if(!ok)return;await platform.templates.delete(id);customTemplates=await platform.templates.list();renderTemplateCards();
}
function renderTemplateCards(){
  const el=$('#templateCards');if(!el)return;
  const built=documentTemplates.map(tm=>`<div class="template-card builtin-template-card" data-template-open="${tm.id}"><div class="template-open"><div class="template-card-top"><strong>${esc(textFor(tm.name,lang))}</strong><span class="template-kind">${t(lang,'builtInTemplate')}</span></div><span>${esc(textFor(tm.description,lang))}</span>${tm.reviewed?`<small class="template-reviewed">${t(lang,'builtInReviewed')}: ${esc(fmtDate(tm.reviewed))}</small>`:''}${tm.reviewBy?`<small class="template-review-due">${t(lang,'builtInReviewBy')}: ${esc(fmtDate(tm.reviewBy))}</small>`:''}</div></div>`).join('');
  const own=customTemplates.map(tm=>`<div class="template-card custom-template-card" data-template-open="${tm.id}"><div class="template-open"><div class="template-card-top"><strong>${esc(tm.name)}</strong><span class="template-kind">${t(lang,'customTemplate')}</span></div><span>${esc(tm.description||t(lang,'customTemplate'))}</span></div><div class="template-card-actions"><button class="ghost small" data-template-edit="${tm.id}">${t(lang,'editTemplate')}</button><button class="danger small" data-template-rm="${tm.id}">${t(lang,'delete')}</button></div></div>`).join('');
  el.innerHTML=built+own;
  $$('[data-template-open]').forEach(card=>card.onclick=()=>previewTemplate(card.dataset.templateOpen));
  $$('[data-template-edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();editCustomTemplate(b.dataset.templateEdit);});
  $$('[data-template-rm]').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteCustomTemplate(b.dataset.templateRm);});
}

async function saveCurrentAsTemplate(){
  if(!current)return;
  if(!transientMode)await saveNow(); else syncBasic();
  const details=await showTemplateDetailsModal({name:current.workDescription||current.processTask||'',description:'',title:t(lang,'templateDetailsTitle'),saveText:t(lang,'saveTemplate')});
  if(!details)return;
  const snapshot=clone(current);delete snapshot._filePath;snapshot.sjaNo='';snapshot.status='draft';snapshot.participants=[];
  const now=new Date().toISOString();
  const tm={id:crypto.randomUUID(),name:details.name,description:details.description,document:snapshot,createdAt:now,updatedAt:now};
  const saved=await platform.templates.save(tm);if(!saved?.id)throw new Error(t(lang,'templateSaveFailed'));
  customTemplates=await platform.templates.list();renderTemplateCards();toast(t(lang,'templateSaved'));
  if(transientMode==='new-template'){current=null;clearTransientState();showView('documents');switchDocumentTab('templates');}
}

function participantDirectory(){const map=new Map();for(const p of storedPeople){const name=String(p.name||'').trim();if(name)map.set(name.toLowerCase(),{name,department:p.department||'',role:p.role||''});}return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,lang==='no'?'nb':'en'));}
function renderParticipantDirectory(){const dl=$('#participantNames');if(dl)dl.innerHTML=participantDirectory().map(p=>`<option value="${esc(p.name)}" data-dept="${esc(p.department)}" data-role="${esc(p.role)}">${esc([p.department,p.role].filter(Boolean).join(' — '))}</option>`).join('');renderPersonnelSettings();}
function renderPersonnelSettings(){
  const select=$('#personnelSelect'),editor=$('#personnelEditor'),empty=$('#emptyPersonnel');
  if(!select||!editor||!empty)return;
  const people=participantDirectory();
  const previous=select.value;
  empty.classList.toggle('hidden',people.length>0);
  select.classList.toggle('hidden',people.length===0);
  const placeholder=`<option value="">${esc(t(lang,'choosePerson'))}</option>`;
  select.innerHTML=placeholder+people.map((p,i)=>`<option value="${i}">${esc(p.name)}${p.department||p.role?` — ${esc([p.department,p.role].filter(Boolean).join(' / '))}`:''}</option>`).join('');
  let selectedIndex=-1;
  if(previous!==''&&people[+previous])selectedIndex=+previous;
  else if(select.dataset.selectedName)selectedIndex=people.findIndex(p=>p.name===select.dataset.selectedName);
  select.value=selectedIndex>=0?String(selectedIndex):'';
  const fill=(index)=>{
    const person=people[index];
    editor.classList.toggle('hidden',!person);
    if(!person){select.dataset.selectedName='';return;}
    select.dataset.selectedName=person.name;
    $('#personnelName').value=person.name||'';
    $('#personnelDepartment').value=person.department||'';
    $('#personnelRole').value=person.role||'';
  };
  fill(selectedIndex);
  select.onchange=()=>fill(select.value===''?-1:+select.value);
  $('#savePersonnel').onclick=async()=>{
    const index=select.value===''?-1:+select.value,original=people[index];
    if(!original)return;
    const person={name:$('#personnelName').value.trim(),department:$('#personnelDepartment').value.trim(),role:$('#personnelRole').value.trim()};
    if(!person.name)return;
    storedPeople=await platform.people.update(original.name,person);
    select.dataset.selectedName=person.name;
    renderParticipantDirectory();
    toast(t(lang,'personUpdated'),'success');
  };
  $('#deletePersonnel').onclick=async()=>{
    const index=select.value===''?-1:+select.value,person=people[index];
    if(!person)return;
    const ok=await showConfirmModal({title:t(lang,'deletePersonTitle'),message:t(lang,'deletePersonConfirm').replace('{name}',person.name),confirmText:t(lang,'deletePerson'),cancelText:t(lang,'cancel'),danger:true});
    if(!ok)return;
    storedPeople=await platform.people.delete(person.name);
    select.dataset.selectedName='';
    renderParticipantDirectory();
    toast(t(lang,'personDeleted'),'success');
  };
}


const DEFAULT_PROFILE={logoFile:'',logoPosition:'bottom-right',slogan:'',sloganPosition:'top-left',accentColor:'#1A527D'};
function profileInputValue(){return {logoPosition:$('#logoPositionSelect')?.value||'bottom-right',slogan:$('#profileSlogan')?.value.trim()||'',sloganPosition:$('#sloganPositionSelect')?.value||'top-left',accentColor:/^#[0-9a-f]{6}$/i.test($('#pdfAccentHex')?.value||'')?$('#pdfAccentHex').value.toUpperCase():($('#pdfAccentColor')?.value||'#1A527D').toUpperCase()};}
async function loadDocumentProfile(){try{documentProfile=await platform.profile.get();renderDocumentProfileSettings();}catch(e){console.error(e);toast(t(lang,'profileSaveFailed'),'error');}}
function renderDocumentProfileSettings(){
  const panel=$('.document-profile-panel');if(!panel)return;const p={...DEFAULT_PROFILE,...(documentProfile||{})};
  $('#logoPositionSelect').value=p.logoPosition;$('#profileSlogan').value=p.slogan||'';$('#sloganPositionSelect').value=p.sloganPosition;$('#pdfAccentColor').value=p.accentColor||DEFAULT_PROFILE.accentColor;$('#pdfAccentHex').value=(p.accentColor||DEFAULT_PROFILE.accentColor).toUpperCase();
  const logo=$('#profileLogoPreview');logo.innerHTML=p.logoDataUrl?`<img src="${p.logoDataUrl}" alt="">`:`<span>${esc(t(lang,'noLogo'))}</span>`;$('#removeProfileLogo').disabled=!p.logoDataUrl;renderDocumentProfilePreview();
}
function renderDocumentProfilePreview(){
  const sheet=$('#profileSheetPreview');if(!sheet)return;const pending={...(documentProfile||DEFAULT_PROFILE),...profileInputValue()};sheet.style.setProperty('--pdf-profile-color',pending.accentColor||DEFAULT_PROFILE.accentColor);
  $$('[data-profile-slot]').forEach(slot=>slot.innerHTML='');
  const add=(position,html,kind)=>{if(!position||position==='none')return;const slot=$(`[data-profile-slot="${position}"]`);if(!slot)return;const el=document.createElement('div');el.className=`profile-preview-${kind}`;el.innerHTML=html;slot.appendChild(el);};
  if(pending.logoDataUrl)add(pending.logoPosition,`<img src="${pending.logoDataUrl}" alt="">`,'logo');
  if(pending.slogan)add(pending.sloganPosition,esc(pending.slogan),'slogan');
}
async function saveDocumentProfileSettings(){try{documentProfile=await platform.profile.save(profileInputValue());renderDocumentProfileSettings();toast(t(lang,'documentProfileSaved'),'success');}catch(e){console.error(e);toast(t(lang,'profileSaveFailed'),'error');}}
async function chooseDocumentProfileLogo(){try{const r=await platform.profile.chooseLogo();if(!r?.ok){if(r?.error)toast(r.error,'error');return;}documentProfile=r.profile;renderDocumentProfileSettings();toast(t(lang,'logoUpdated'),'success');}catch(e){console.error(e);toast(e.message||t(lang,'profileSaveFailed'),'error');}}
async function removeDocumentProfileLogo(){try{documentProfile=await platform.profile.removeLogo();renderDocumentProfileSettings();toast(t(lang,'logoRemoved'),'success');}catch(e){console.error(e);toast(t(lang,'profileSaveFailed'),'error');}}
async function resetDocumentProfileSettings(){try{documentProfile=await platform.profile.save({...DEFAULT_PROFILE});if(documentProfile?.logoDataUrl){documentProfile=await platform.profile.removeLogo();}renderDocumentProfileSettings();toast(t(lang,'documentProfileReset'),'success');}catch(e){console.error(e);toast(t(lang,'profileSaveFailed'),'error');}}

function qualityIssues(){if(!current)return[];const issues=[];if(!(current.workDescription||current.processTask||'').trim())issues.push({key:'missingTitle',critical:false});if(!current.responsible.trim())issues.push({key:'missingResponsible',critical:false});if(!current.participants.length)issues.push({key:'missingParticipant',critical:false});current.tasks.forEach((task,i)=>{if(!task.activity.trim())issues.push({key:'emptyActivity',index:i+1});if(!(task.hazards||[]).some(v=>String(v).trim()))issues.push({key:'missingHazard',index:i+1});if(!(task.measures||[]).some(v=>String(v).trim()))issues.push({key:'missingMeasure',index:i+1});if(!riskScore(task.riskBefore))issues.push({key:'missingRiskBefore',index:i+1});const ms=measureStats(task);if(ms.pending)issues.push({key:'pendingMeasures',index:i+1,count:ms.pending});if(ms.allDone&&!riskScore(task.riskAfter))issues.push({key:'missingRiskAfter',index:i+1});if(ms.allDone&&riskScore(task.riskAfter)&&['risk-high','risk-veryHigh'].includes(riskClass(task.riskAfter,current?.riskModelVersion)))issues.push({key:'residualTooHigh',index:i+1,critical:true});const profile=getRuleProfile(task.libraryActivityId);if(profile){const ctx=task.ruleContext||{};const missing=profile.fields.filter(f=>f.required!==false&&(ctx[f.id]===undefined||ctx[f.id]===null||ctx[f.id]===''));if(missing.length)issues.push({key:'ruleFieldsIncomplete',index:i+1,critical:true,count:missing.length});}evaluateRules(task.libraryActivityId,task.ruleContext||{}).filter(r=>r.severity==='critical').forEach(()=>issues.push({key:'criticalRuleFinding',index:i+1,critical:true}));});return issues;}
function renderQuality(){const el=$('#qualityPanel');if(!el||!current)return;const issues=qualityIssues();if(!issues.length){el.innerHTML='';el.classList.add('hidden');return;}const important=issues.filter(i=>i.critical).concat(issues.filter(i=>!i.critical)).slice(0,5);el.classList.remove('hidden');el.innerHTML=`<div class="context-alerts">${important.map(i=>`<div class="context-alert ${i.critical?'critical':''}">${i.index?`${i.index}. `:''}${t(lang,i.key)}${i.count?` (${i.count})`:''}</div>`).join('')}</div>`;}


function contextualBasis(){
  if(!current)return {basis:[],links:[]};
  const basis=[],links=[],seenBasis=new Set(),seenLinks=new Set();
  (current.tasks||[]).forEach((task,i)=>{
    const activity=task.activity||`${t(lang,'activity')} ${i+1}`;
    (task.references||[]).forEach(ref=>{
      const key=`${ref.type||''}|${ref.title||''}|${ref.note||''}`;
      if(!ref.title||seenBasis.has(key))return;seenBasis.add(key);
      basis.push({activity,type:ref.type||'recommended',title:ref.title,note:ref.note||''});
    });
    const profile=getRuleProfile(task.libraryActivityId);
    (profile?.rules||[]).forEach(rule=>{
      if(!rule.source)return;
      const title=textForRule(rule.title,lang)||rule.source;
      const key=`${rule.source}|${title}`;if(seenLinks.has(key))return;seenLinks.add(key);
      links.push({activity,type:rule.type||'requirement',title,url:rule.source});
    });
  });
  return {basis,links};
}
function basisTypeLabel(type){return t(lang,type==='requirement'?'typeRequirement':type==='manufacturer'?'typeManufacturer':type==='internal'?'typeInternal':'typeRecommended');}
function renderRiskMatrixPage(){
  const el=$('#riskMatrixContent');if(!el)return;
  const ps=probabilityScale[lang]||probabilityScale.en,cs=consequenceScale[lang]||consequenceScale.en,rows=riskMatrixRows(lang,current?.riskModelVersion||'4x4-v2-5level');
  const scaleTable=(title,items)=>`<section class="matrix-panel"><h2>${title}</h2><div class="scale-table">${items.map(x=>`<div class="scale-row"><strong>${x.value} – ${esc(x.label)}</strong><span>${esc(x.description)}</span></div>`).join('')}</div></section>`;
  const ctx=contextualBasis();
  const contextSection=current?`<section class="matrix-panel source-panel"><div class="source-panel-head"><div><h2>${t(lang,'sourcesAndBasis')}</h2><p>${t(lang,'sourcesAndBasisHint')}</p></div><span class="context-sja-badge">${esc(current.sjaNo||'')}</span></div>${ctx.basis.length?`<h3>${t(lang,'basisForSuggestions')}</h3><div class="basis-grid">${ctx.basis.map(x=>`<div class="basis-card"><span class="reference-type">${esc(basisTypeLabel(x.type))}</span><strong>${esc(x.title)}</strong><small>${esc(x.activity)}</small>${x.note?`<p>${esc(x.note)}</p>`:''}</div>`).join('')}</div>`:''}<h3>${t(lang,'relevantLinks')}</h3>${ctx.links.length?`<div class="source-link-list">${ctx.links.map(x=>`<button type="button" class="source-link-card" data-info-source="${esc(x.url)}"><span class="reference-type">${esc(basisTypeLabel(x.type))}</span><strong>${esc(x.title)}</strong><small>${esc(x.activity)}</small><span class="source-link-action">${t(lang,'openSource')} ↗</span></button>`).join('')}</div>`:`<div class="empty compact">${t(lang,'noContextLinks')}</div>`}</section>`:`<section class="matrix-panel source-panel"><h2>${t(lang,'sourcesAndBasis')}</h2><p>${t(lang,'openSjaForSources')}</p></section>`;
  el.innerHTML=`<section class="matrix-panel matrix-method"><h2>${t(lang,'riskMatrixMethod')}</h2><p>${t(lang,'riskMatrixMethodText')}</p></section><div class="matrix-overview-grid"><div class="matrix-scales">${scaleTable(t(lang,'probabilityScale'),ps)}${scaleTable(t(lang,'consequenceScale'),cs)}</div><section class="matrix-panel matrix-table-panel"><h2>${t(lang,'matrixClassification')}</h2><div class="matrix-scroll"><table class="risk-matrix-table"><thead><tr><th>${t(lang,'severity')} \ ${t(lang,'probability')}</th>${ps.map(p=>`<th><b>${p.value}</b><span>${esc(p.label)}</span></th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th><b>${row.consequence.value}</b><span>${esc(row.consequence.label)}</span></th>${row.cells.map(cell=>`<td class="risk-${cell.level}"><b>${cell.score}</b><span>${t(lang,cell.level)}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="matrix-legend"><span class="risk-veryLow">${t(lang,'veryLow')}</span><span class="risk-low">${t(lang,'low')}</span><span class="risk-medium">${t(lang,'medium')}</span><span class="risk-high">${t(lang,'high')}</span><span class="risk-veryHigh">${t(lang,'veryHigh')}</span></div></section></div>${contextSection}`;
  $$('[data-info-source]').forEach(b=>b.onclick=()=>platform.external.open?.(b.dataset.infoSource));
}
function setEditorLocked(locked){
  const form=$('#sjaForm'); if(!form)return;
  form.classList.toggle('document-locked',locked);
  form.querySelectorAll('input,select,textarea,button').forEach(el=>{
    if(el.name==='sjaNo'||el.matches('[data-section-toggle]'))return;
    el.disabled=!!locked;
  });
  $('#saveAsTemplate').disabled=false;
}
function updateDocumentStatusUI(){if(!current)return;const complete=current.status==='complete';const badge=$('#editorStatusBadge'),btn=$('#completeSjaBtn');if(transientMode){if(badge){badge.textContent=t(lang,transientMode==='template-preview'?'templatePreviewStatus':transientMode==='new-template'?'templateStatus':'notCreatedYet');badge.classList.remove('complete');}if(btn)btn.classList.add('hidden');const hideDocActions=transientMode==='template-preview'||transientMode==='new-template';$('#previewPdf')?.classList.toggle('hidden',hideDocActions);$('#generatePdf')?.classList.toggle('hidden',hideDocActions);$('#saveAsTemplate')?.classList.toggle('hidden',transientMode==='template-preview');$('#saveState').textContent=t(lang,'notCreatedYet');renderTransientUi();return;}if(btn)btn.classList.remove('hidden');$('#previewPdf')?.classList.remove('hidden');$('#generatePdf')?.classList.remove('hidden');$('#saveAsTemplate')?.classList.remove('hidden');if(badge){badge.textContent=t(lang,complete?'complete':'draft');badge.classList.toggle('complete',complete);}if(btn){btn.textContent=t(lang,complete?'editCompletedSja':'completeSja');btn.classList.toggle('primary',!complete);btn.classList.toggle('secondary',complete);}setEditorLocked(complete);const state=$('#saveState');if(complete)state.textContent=t(lang,'completedLocked');}
async function toggleComplete(){
  if(!current)return;
  if(current.status==='complete'){
    const ok=await showConfirmModal({title:t(lang,'editCompletedTitle'),message:t(lang,'editCompletedConfirm'),confirmText:t(lang,'editSja'),cancelText:t(lang,'cancel')});
    if(!ok)return;
    current.status='draft'; current.updatedAt=new Date().toISOString(); await platform.documents.save(current); updateDocumentStatusUI(); renderQuality(); toast(t(lang,'editingEnabled')); return;
  }
  const issues=qualityIssues();if(issues.length){renderQuality();toast(t(lang,'cannotComplete'),'error',5200);return;}
  const ok=await showConfirmModal({title:t(lang,'completeConfirmTitle'),message:t(lang,'completeConfirmText'),confirmText:t(lang,'completeSja'),cancelText:t(lang,'cancel')});
  if(!ok)return;
  current.status='complete';await saveNow();updateDocumentStatusUI();toast(t(lang,'completedNow'),'success',3800);
}

async function previewPdf(){if(!current)return;if(!transientMode)await saveNow();else syncBasic();const b=$('#previewPdf');b.disabled=true;try{const r=await platform.pdf.preview({...current,documentLanguage:lang});if(r?.ok)toast(t(lang,'previewReady'));}catch(e){toast(`PDF: ${e.message}`);}finally{b.disabled=false;}}
async function generatePdf(){if(!current)return;if(!transientMode)await saveNow();else syncBasic();const critical=qualityIssues().some(i=>i.critical);if(current.status==='complete'&&critical&&!confirm(t(lang,'completeBlocked')))return;const b=$('#generatePdf');b.disabled=true;try{const r=await platform.pdf.export({...current,documentLanguage:lang});if(r?.ok){toast(t(lang,'pdfDone'));platform.files.show(r.filePath);}}catch(e){toast(`PDF: ${e.message}`);}finally{b.disabled=false;}}


let sectionNavTick=false;
function updateActiveSectionNav(){
  const editor=$('#editorView');
  if(!editor||editor.classList.contains('hidden'))return;
  const sections=['section-basic','section-participants','section-risks','section-checklist','section-finish'].map(id=>document.getElementById(id)).filter(Boolean);
  if(!sections.length)return;
  const marker=Math.min(window.innerHeight*.34,260);
  let active=sections[0];
  for(const section of sections){
    if(section.getBoundingClientRect().top<=marker)active=section;
    else break;
  }
  if(window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-24)active=sections[sections.length-1];
  $$('.section-nav-panel .section-links a').forEach(link=>{
    const on=link.getAttribute('href')===`#${active.id}`;
    link.classList.toggle('active',on);
    if(on)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
  });
}
function setupSectionNavigation(){
  window.addEventListener('scroll',()=>{if(sectionNavTick)return;sectionNavTick=true;requestAnimationFrame(()=>{sectionNavTick=false;updateActiveSectionNav();});},{passive:true});
  window.addEventListener('resize',updateActiveSectionNav,{passive:true});
  $$('[data-section-toggle]').forEach(toggle=>toggle.addEventListener('click',()=>{const id=toggle.dataset.sectionToggle;const section=document.getElementById(id);setSectionOpen(id,section?.classList.contains('collapsed'));}));
  $$('.section-nav-panel .section-links a').forEach(link=>link.addEventListener('click',e=>{
    e.preventDefault();
    const id=link.getAttribute('href')?.slice(1);if(id)setSectionOpen(id,true,{scroll:true});
    $$('.section-nav-panel .section-links a').forEach(x=>x.classList.remove('active'));
    link.classList.add('active');
  }));
  updateActiveSectionNav();
}

async function init(){applyTheme();await migrateLegacyDocuments();await loadDocs();applyLang();setupSectionNavigation();renderActivityLibrary();renderTemplateCards();try{const info=await platform.documents.storageInfo();$('#storagePath').textContent=info.path;}catch{$('#storagePath').textContent='—';}
  renderRiskMatrixPage();switchDocumentTab('documents');$('#confirmModalOk').onclick=()=>closeConfirmModal(true);$('#confirmModalCancel').onclick=()=>closeConfirmModal(false);$('#confirmModal').onclick=e=>{if(e.target.id==='confirmModal')closeConfirmModal(false);};$('#newBtn').onclick=createNew;$('#fromTemplateBtn').onclick=()=>{current=null;clearTransientState();showView('documents');switchDocumentTab('templates');};$('#newTemplateBtn').onclick=createNewTemplateDraft;$('#createTemplateDocumentBtn').onclick=commitTemplateDraft;$('#closeTemplateBtn').onclick=()=>{current=null;clearTransientState();showView('documents');switchDocumentTab('templates');};$$('[data-home-tab]').forEach(b=>b.onclick=async()=>{if(current&&!transientMode)await saveNow();current=null;clearTransientState();await loadDocs();showView('documents');switchDocumentTab(b.dataset.homeTab);});$('#addParticipant').onclick=addParticipant;$('#addChecklistItem').onclick=addChecklistItem;$('#addChecklistSection').onclick=addChecklistSection;$('#saveAsTemplate').onclick=saveCurrentAsTemplate;$('#completeSjaBtn').onclick=toggleComplete;$('#addRiskFactor').onclick=addSelectedRiskFactor;$('#addCustomRiskFactor').onclick=addCustomRiskFactor;$('#previewPdf').onclick=previewPdf;$('#generatePdf').onclick=generatePdf;$('#search').oninput=renderDocs;
  $('#riskMatrixTopBtn').onclick=async()=>{if(current&&!transientMode)await saveNow();renderRiskMatrixPage();$('#backToEditorFromMatrix').classList.toggle('hidden',!current);showView('riskMatrix');};$('#backToEditorFromMatrix').onclick=()=>{if(current){showView('editor');updateDocumentStatusUI();}};$$('[data-close-panel]').forEach(b=>b.onclick=()=>$('#'+b.dataset.closePanel).classList.add('hidden'));$$('.top-nav-btn[data-view]').forEach(b=>b.onclick=async()=>{if(current&&!transientMode)await saveNow();current=null;clearTransientState();showView(b.dataset.view);if(b.dataset.view==='settings'){renderPersonnelSettings();await loadDocumentProfile();await refreshVersionInfo(true);}});
  $('#sjaForm').addEventListener('input',scheduleSave);$('#sjaForm').addEventListener('change',scheduleSave);$('#themeSelect').onchange=e=>{theme=e.target.value;localStorage.setItem('sja-theme',theme);applyTheme();};$('#languageSelect').onchange=e=>{lang=e.target.value;localStorage.setItem('sja-lang',lang);applyLang();};$('#chooseProfileLogo').onclick=chooseDocumentProfileLogo;$('#removeProfileLogo').onclick=removeDocumentProfileLogo;$('#saveDocumentProfile').onclick=saveDocumentProfileSettings;$('#resetDocumentProfile').onclick=resetDocumentProfileSettings;$('#logoPositionSelect').onchange=renderDocumentProfilePreview;$('#sloganPositionSelect').onchange=renderDocumentProfilePreview;$('#profileSlogan').oninput=renderDocumentProfilePreview;$('#pdfAccentColor').oninput=e=>{$('#pdfAccentHex').value=e.target.value.toUpperCase();renderDocumentProfilePreview();};$('#pdfAccentHex').oninput=e=>{const v=e.target.value.trim();if(/^#[0-9a-f]{6}$/i.test(v)){$('#pdfAccentColor').value=v;renderDocumentProfilePreview();}};$('#openStorage').onclick=async()=>{const r=await platform.documents.openFolder();if(!r?.ok)toast(t(lang,'storageError'));};$('#checkForUpdates').onclick=async()=>{const b=$('#checkForUpdates');b.disabled=true;$('#updateStatusBadge').textContent=t(lang,'updateChecking');await refreshVersionInfo(true);b.disabled=false;};$('#installUpdate').onclick=async()=>{const b=$('#installUpdate');b.disabled=true;$('#checkForUpdates').disabled=true;$('#updateStatusBadge').textContent=t(lang,'updateInstalling');$('#updateMessage').textContent=t(lang,'updateDownloadStarted');const r=await platform.updates.install();if(r&&!r.ok){toast(r.error||t(lang,'updateCheckFailed'));$('#updateStatusBadge').textContent=t(lang,'updateCheckFailed');$('#updateMessage').textContent=r.error||t(lang,'updateCheckFailed');b.disabled=false;$('#checkForUpdates').disabled=false;}};matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(theme==='system')applyTheme();});refreshVersionInfo(false);setTimeout(()=>refreshVersionInfo(true),0);}
init().catch(e=>{console.error(e);toast(e.message);});
