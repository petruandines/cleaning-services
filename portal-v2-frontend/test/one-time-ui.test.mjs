import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {bucharestISO,bucharestLocal,countdown} from '../../portal/project-view.mjs';
const backend=process.env.ONE_TIME_BACKEND_ROOT;
const wait=async(predicate)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Timed out waiting for UI');};
test('Romania timezone and countdown handle device location, DST and elapsed time',()=>{
 assert.equal(bucharestISO('2026-10-15T16:30'),'2026-10-15T13:30:00.000Z');
 assert.equal(bucharestISO('2026-11-15T16:30'),'2026-11-15T14:30:00.000Z');
 assert.equal(bucharestLocal('2026-10-15T13:30:00Z'),'2026-10-15T16:30');
 assert.throws(()=>bucharestISO('2026-03-29T03:30'));assert.throws(()=>bucharestISO('2026-10-25T03:30'));
 assert.doesNotMatch(countdown({status:'scheduled',scheduled_at:'2026-10-01T10:00:00Z'},Date.parse('2026-10-15')),/\-\d/);
 assert.equal(countdown({status:'in_progress'}),'În desfășurare');
});
test('admin and client DOM execute the complete lifecycle against actual isolated backend',{skip:!backend},async()=>{
 const {setup}=await import(pathToFileURL(backend+'/test/one-time-harness.mjs'));
 const s=setup();let cookie='';let tickers=[];
 async function page(path,clientToken){const dom=new JSDOM(readFileSync(new URL('../../portal/'+path+'/index.html',import.meta.url),'utf8'),{url:'https://petruandines.com/portal/'+path+'/?'+(clientToken?'token='+clientToken:''),runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
  w.PETRU_INES_API_ORIGIN='https://api.petruandines.com';w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.sessionStorage.setItem('petru-ines-portal-v2-session',JSON.stringify({token:'admin',expiresAt:Date.now()+60000}));
  w.setInterval=fn=>{tickers.push(fn);return tickers.length;};w.clearInterval=()=>{};
  w.fetch=async(url,init={})=>{const u=new URL(url);if(u.pathname==='/api/me')return{ok:true,json:async()=>({role:'staff',twoFactorRequired:false})};
   const response=await s.call(u.pathname.replace('/api/one-time/','')+u.search,{admin:init.credentials!=='include',method:init.method||'GET',...(init.body?{data:JSON.parse(init.body)}:{}),cookie:init.credentials==='include'?cookie:undefined});
   const c=response.headers.get('set-cookie');if(c)cookie=c.split(';')[0];return response;};
  const code=(await build({entryPoints:[new URL('../../portal/'+path+'/'+(path==='projects'?'admin.mjs':'client.mjs'),import.meta.url).pathname],bundle:true,write:false,format:'iife'})).outputFiles[0].text;w.eval(code);return dom;
 }
 const admin=await page('projects');let client;
 try{const d=admin.window.document;await wait(()=>!d.getElementById('nav').hidden);d.getElementById('create').click();
  for(const [key,value] of Object.entries({name:'Test UI Petru & Inés',client_name:'Client test',phone:'0700000000',location:'Locație',scheduled_at:'2026-10-15T16:30',price_bani:'499',description:'Servicii incluse'}))d.querySelector('[name='+key+']').value=value;
  const b=text=>[...d.querySelectorAll('button')].find(x=>x.textContent===text);
  b('Adaugă sarcină').click();await wait(()=>d.querySelector('.task-editor input[type=text]'));const title=d.querySelector('.task-editor input[type=text]');title.value='Aspirare';title.dispatchEvent(new admin.window.Event('input'));
  d.querySelector('form').dispatchEvent(new admin.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>b('Generează acces'));
  b('Generează acces').click();await wait(()=>d.querySelector('#password-panel input'));d.querySelector('#password-panel input').value='parola-securizata-123';d.querySelector('#password-panel form').dispatchEvent(new admin.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>b('Copiază URL client'));
  const p=s.sqlite.prepare('SELECT id FROM one_time_projects').get(),access=s.sqlite.prepare('SELECT token FROM one_time_project_access').get();
  client=await page('project',access.token);const c=client.window.document;await wait(()=>!c.getElementById('login-panel').hidden);c.getElementById('password').value='parola-securizata-123';c.getElementById('login-form').dispatchEvent(new client.window.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:c.querySelector('button[type=submit]')}));await wait(()=>c.querySelector('.project-card'));
  assert.match(c.body.textContent,/Test UI Petru & Inés/);assert.match(c.body.textContent,/499/);assert.equal(c.querySelector('.project-review'),null);assert.equal(c.getElementById('password').value,'');
  b('Începe intervenția').click();await wait(()=>d.querySelector('article').textContent.includes('În desfășurare'));for(const t of tickers)await t();assert.match(c.body.textContent,/În desfășurare/);
  const check=d.querySelector('.task-editor input[type=checkbox]');check.checked=true;check.dispatchEvent(new admin.window.Event('change'));await wait(()=>d.body.textContent.includes('1 din 1'));for(const t of tickers)await t();assert.equal(c.querySelector('progress').value,1);
  b('Editează proiect').click();d.querySelector('[name=invoice_url]').value='https://example.com/invoice.pdf';d.querySelector('form').dispatchEvent(new admin.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>b('Confirmă intervenția ca finalizată'));for(const t of tickers)await t();assert.equal(c.querySelector('a.primary').textContent,'Vezi factura');
  b('Confirmă intervenția ca finalizată').click();await wait(()=>d.querySelector('article').textContent.includes('Finalizată'));for(const t of tickers)await t();assert.ok(c.querySelector('.project-review a'));
  b('Revocă accesul').click();await wait(()=>d.body.textContent.includes('Acces: Revocat'));for(const t of tickers)await t();assert.equal(c.querySelector('.project-card'),null);assert.match(c.body.textContent,/n[u]? este disponibil/);
  assert.equal((await s.call('admin/'+p.id)).status,200);
  admin.window.confirm=()=>false;b('Șterge proiect').click();await new Promise(r=>setTimeout(r,30));assert.equal((await s.call('admin/'+p.id)).status,200,'cancel keeps project');
  admin.window.confirm=()=>true;b('Șterge proiect').click();await wait(()=>d.body.textContent.includes('Proiectul a fost șters.'));assert.equal((await s.call('admin/'+p.id)).status,404);assert.equal(b('Șterge proiect'),undefined);assert.match(d.body.textContent,/Nu există proiecte/);

 }finally{admin.window.close();client?.window.close();s.sqlite.close();}
});
