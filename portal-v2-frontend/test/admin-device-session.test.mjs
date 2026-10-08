import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
const code=(await build({entryPoints:[new URL('../app.js',import.meta.url).pathname],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const tick=()=>new Promise(r=>setTimeout(r,20));
async function setup(remembered=true,blocked=false){
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://petruandines.com/portal/',runScripts:'outside-only'});
 const w=dom.window,calls=[];
 w.PETRU_INES_API_ORIGIN='https://api.petruandines.com';w.HTMLElement.prototype.scrollIntoView=()=>{};
 if(blocked)w.localStorage.setItem('pi-admin-device-blocked','true');
 w.fetch=async(url,init={})=>{
  const path=new URL(url).pathname;calls.push({path,...init});
  if(path.endsWith('/admin-device-session'))return new Response(JSON.stringify(init.method==='DELETE'?{}:remembered?{token:'short-tab-token'}:{error:'unauthorized'}),{status:init.method==='DELETE'||remembered?200:401});
  return new Response(JSON.stringify(path.endsWith('/me')?{id:'owner',role:'staff',name:'Admin'}:path.endsWith('/overview')?{unreadMessages:0}:{rows:[],nextOffset:null}));
 };
 w.eval(code);await tick();await tick();
 return {w,d:w.document,calls,close:()=>w.close()};
}
test('reopened portal restores remembered admin with an HttpOnly cookie and stores only a short tab session',async()=>{
 const a=await setup();try{
  assert.equal(a.calls[0].path,'/api/admin-device-session');assert.equal(a.calls[0].credentials,'include');
  assert.equal(a.d.getElementById('workspace').hidden,false);
  assert.equal(JSON.parse(a.w.sessionStorage.getItem('petru-ines-portal-v2-session')).token,'short-tab-token');
  assert.equal(a.w.localStorage.length,0);
  a.d.getElementById('logout').click();await tick();await tick();
  assert.ok(a.calls.some(c=>c.path.endsWith('/admin-device-session')&&c.method==='DELETE'&&c.credentials==='include'));
  assert.equal(a.d.getElementById('workspace').hidden,true);assert.equal(a.w.sessionStorage.length,0);
 }finally{a.close();}
});
test('missing or locally blocked remembered device retains manual login',async()=>{
 for(const blocked of [false,true]){
  const a=await setup(false,blocked);try{
   assert.equal(a.d.getElementById('workspace').hidden,true);assert.equal(a.d.getElementById('login').disabled,false);
   if(blocked)assert.equal(a.calls.length,0);
  }finally{a.close();}
 }
});
test('login only remembers opted-in admins; failures preserve successful authentication',async()=>{
 for(const [role,opted,failed] of [['staff',true,false],['staff',false,false],['client',true,false],['staff',true,true]]){
  const dom=new JSDOM(readFileSync(new URL('../../portal/login.html',import.meta.url),'utf8'),{url:'https://petruandines.com/portal/login.html?state='+'a'.repeat(32),runScripts:'outside-only'});
  const w=dom.window,calls=[],messages=[];w.opener={postMessage:(data,origin)=>messages.push({data,origin})};w.close=()=>{};
  w.fetch=async(url,init={})=>{
   const path=new URL(url).pathname;calls.push({path,...init});
   if(path.endsWith('/admin-device-session')){if(failed)throw new Error('offline');return new Response('{}');}
   if(path.endsWith('/me'))return new Response(JSON.stringify({id:'u',role}));
   return new Response('{}',{headers:{'set-auth-token':'valid-login-token'}});
  };
  w.eval(readFileSync(new URL('../../portal/login.js',import.meta.url),'utf8'));
  try{
   const f=w.document.getElementById('password-form');f.elements.email.value='admin@example.test';f.elements.password.value='valid-test-password';f.elements.rememberAdmin.checked=opted;
   f.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();await tick();
   const call=calls.find(c=>c.path.endsWith('/admin-device-session'));
   assert.equal(call.method,role==='staff'&&opted?'POST':'DELETE');assert.equal(call.credentials,'include');
   assert.equal(messages.length,1);assert.equal(messages[0].data.token,'valid-login-token');
   assert.equal(messages[0].data.rememberFailed,role==='staff'&&opted&&failed);
   assert.equal(messages[0].origin,'https://petruandines.com');assert.equal(f.elements.password.value,'');
  }finally{dom.window.close();}
 }
});
