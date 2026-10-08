import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
const backend=process.env.ONE_TIME_BACKEND_ROOT;
const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.fail('UI timeout');};

test('admin/client PDF DOM flow runs browser serializer, download, deletion and regeneration with fake records',{skip:!backend},async()=>{
 const {setup}=await import(pathToFileURL(backend+'/test/one-time-harness.mjs'));
 const objects=new Map();const bucket={puts:0,async put(key,bytes,options){this.puts++;objects.set(key,{bytes:new Uint8Array(bytes),customMetadata:options.customMetadata});},async get(key){const v=objects.get(key);return v?{body:v.bytes,size:v.bytes.length,customMetadata:v.customMetadata}:null;},async head(key){return this.get(key);},async delete(key){objects.delete(key);}};
 const s=setup({reports:true,bucket});const p=await s.create(),access=await s.generate(p.id);let cookie='',downloads=0;const intervals=[];
 const resources=readFileSync(new URL('../../portal/reports/resources.json',import.meta.url),'utf8');
 async function page(path,token){
  const dom=new JSDOM(readFileSync(new URL('../../portal/'+path+'/index.html',import.meta.url),'utf8'),{url:'https://petruandines.com/portal/'+path+'/'+(token?'?token='+token:''),runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.TextEncoder=TextEncoder;w.PETRU_INES_API_ORIGIN='https://api.petruandines.com';w.confirm=()=>true;w.URL.createObjectURL=()=>{downloads++;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
  w.sessionStorage.setItem('petru-ines-portal-v2-session',JSON.stringify({token:'admin',expiresAt:Date.now()+60000}));w.setInterval=fn=>{intervals.push(fn);return intervals.length;};w.clearInterval=()=>{};
  w.fetch=async(url,init={})=>{
   const u=new URL(String(url));if(u.pathname==='/api/me')return Response.json({role:'staff',twoFactorRequired:false});
   if(u.pathname.endsWith('/resources.json'))return new Response(resources,{headers:{'content-type':'application/json'}});
   const isPdf=init.headers?.['content-type']==='application/pdf';
   const response=await s.call(u.pathname.replace('/api/one-time/','')+u.search,{method:init.method||'GET',admin:init.credentials!=='include',cookie:init.credentials==='include'?cookie:undefined,...(init.body?(isPdf?{upload:new Uint8Array(init.body)}:{data:JSON.parse(init.body)}):{})});
   const c=response.headers.get('set-cookie');if(c)cookie=c.split(';')[0];return response;
  };
  const code=(await build({entryPoints:[new URL('../../portal/'+path+'/'+(path==='projects'?'admin.mjs':'client.mjs'),import.meta.url).pathname],bundle:true,write:false,format:'iife',define:{'import.meta.url':JSON.stringify('https://petruandines.com/portal/reports/admin.mjs')}})).outputFiles[0].text;w.eval(code);return dom;
 }
 const admin=await page('projects');let client;try{
  const d=admin.window.document,button=text=>[...d.querySelectorAll('button')].find(b=>b.textContent===text);
  await wait(()=>button('Deschide proiect'));button('Deschide proiect').click();await wait(()=>d.querySelector('[name=generate_report]'));
  const check=d.querySelector('[name=generate_report]');check.checked=true;check.dispatchEvent(new admin.window.Event('change'));await wait(()=>d.querySelector('[name=generate_report]')?.checked);
  await new Promise(r=>setTimeout(r,30));button('Confirmă intervenția ca finalizată').click();await wait(()=>d.textContent?.includes('Raport PDF disponibil')||d.body.textContent.includes('Raport PDF disponibil'));assert.equal(bucket.puts,1);
  client=await page('project',access.access.token);const c=client.window.document;
  c.querySelector('#password').value='parola-securizata-123';const submit=c.querySelector('#login-form button');submit.click();await wait(()=>c.body.textContent.includes('Descarcă raport PDF'));
  const cb=()=>[...c.querySelectorAll('button')].find(b=>b.textContent==='Descarcă raport PDF');cb().click();await wait(()=>downloads===1);
  button('Șterge raportul PDF').click();await wait(()=>d.body.textContent.includes('Raport PDF șters'));
  intervals.forEach(fn=>fn());await wait(()=>!cb());assert.equal(s.sqlite.prepare('SELECT status FROM one_time_projects WHERE id=?').get(p.id).status,'completed');
  button('Generează din nou raportul PDF').click();await wait(()=>bucket.puts===2&&d.body.textContent.includes('Raport PDF disponibil'));
  intervals.forEach(fn=>fn());await wait(()=>cb());cb().click();await wait(()=>downloads===2);
 }finally{admin.window.close();client?.window.close();s.sqlite.close();}
});
