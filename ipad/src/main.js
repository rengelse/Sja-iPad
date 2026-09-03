import '../../src/css/app.css';
import './ipad.css';
import { createPwaPlatform } from './platform-pwa.js';

document.documentElement.classList.add('platform-ipad');
globalThis.sjaPlatform=createPwaPlatform();

function installIpadNavigation(){
  const toolbar=document.querySelector('.editor-toolbar-left');const aside=document.querySelector('.section-nav');if(!toolbar||!aside)return;
  const button=document.createElement('button');button.type='button';button.id='ipadSectionsBtn';button.className='secondary ipad-sections-btn';button.textContent='☰ Seksjoner';toolbar.prepend(button);
  const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='ipad-drawer-backdrop';backdrop.setAttribute('aria-label','Lukk seksjonsmeny');document.body.appendChild(backdrop);
  const close=()=>document.documentElement.classList.remove('ipad-drawer-open');button.onclick=()=>document.documentElement.classList.toggle('ipad-drawer-open');backdrop.onclick=close;aside.addEventListener('click',e=>{if(e.target.closest('.section-links a'))close();});
}

function enhanceIpadTables(){
  const table=document.querySelector('.documents-table');
  if(!table)return;
  const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
  table.querySelectorAll('tbody tr').forEach(row=>{[...row.children].forEach((cell,index)=>{cell.dataset.ipadLabel=labels[index]||'';});});
}
function watchIpadTables(){
  const body=document.querySelector('#docTableBody');
  if(!body)return;
  const observer=new MutationObserver(enhanceIpadTables);observer.observe(body,{childList:true,subtree:true});enhanceIpadTables();
}
function updateIpadViewportClass(){
  document.documentElement.classList.toggle('ipad-portrait',matchMedia('(orientation: portrait)').matches);
  document.documentElement.classList.toggle('ipad-landscape',matchMedia('(orientation: landscape)').matches);
}

function applyIpadOnlyUi(){document.querySelector('.update-panel')?.classList.add('ipad-hidden');document.querySelector('#openStorage')?.classList.add('ipad-hidden');installIpadNavigation();}
applyIpadOnlyUi();watchIpadTables();updateIpadViewportClass();addEventListener('orientationchange',updateIpadViewportClass);addEventListener('resize',updateIpadViewportClass);

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).catch(error=>console.warn('Service worker:',error)));}
navigator.storage?.persist?.().catch(()=>{});
await import('../../src/js/app.js');
