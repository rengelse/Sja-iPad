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
function applyIpadOnlyUi(){document.querySelector('.update-panel')?.classList.add('ipad-hidden');document.querySelector('#openStorage')?.classList.add('ipad-hidden');installIpadNavigation();}
applyIpadOnlyUi();

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).catch(error=>console.warn('Service worker:',error)));}
navigator.storage?.persist?.().catch(()=>{});
await import('../../src/js/app.js');
