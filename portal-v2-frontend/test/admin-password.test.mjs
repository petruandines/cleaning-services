import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
const code=(await build({entryPoints:[new URL('../app.js',import.meta.url).pathname],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const tick=()=>new Promise(r=>setTimeout(r,20));
async function setup(role='staff',failure=false){
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://petruandines.com/portal/',runScripts:'outside-only'});
 const w=dom.window,calls=[];
 w.PETRU_INES_API_ORIGIN='https://api.petruandines.com';w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.sessionStorage.setItem('petru-ines-portal-v2-session',JSON.stringify({token:'existing-session',expiresAt:Date.now()+60000}));
 w.fetch=async(url,init={})=>{
  const path=new URL(url).pathname;calls.push({path,...init});
  if(path.endsWith('/change-password')) return new Response(JSON.stringify(failure?{error:'INVALID_PASSWORD'}:{token:'rotated-session'}),{status:failure?400:200});
  const data=path.endsWith('/me')?{id:'owner',role,name:'Admin'}:path.endsWith('/overview')?{unreadMessages:0}:{rows:[],nextOffset:null};
  return new Response(JSON.stringify(data),{status:200});
 };
 w.eval(code);await tick();await tick();
 return {w,d:w.document,calls,close:()=>w.close()};
}
test('password is optional, cancelling clears secrets without an API write, and clients cannot open it',async()=>{
 for(const role of ['staff','client']){
  const a=await setup(role);try{
   assert.equal(a.d.getElementById('open-admin-password').hidden,role!=='staff');
   assert.equal(a.d.getElementById('admin-password-panel').hidden,true);
   a.d.getElementById('open-admin-password').click();
   assert.equal(a.d.getElementById('admin-password-panel').hidden,role!=='staff');
   const f=a.d.getElementById('admin-password-form');f.elements.currentPassword.value='secret';
   a.d.getElementById('cancel-admin-password').click();
   assert.equal(f.elements.currentPassword.value,'');
   assert.equal(a.calls.some(c=>c.path.endsWith('/change-password')),false);
  }finally{a.close();}
 }
});
test('mismatch is local; success revokes sessions and clears stored access; failure preserves existing access',async()=>{
 for(const failure of [false,true]){
  const a=await setup('staff',failure);try{
   a.d.getElementById('open-admin-password').click();
   const f=a.d.getElementById('admin-password-form');
   f.elements.currentPassword.value='old-password-1234';f.elements.newPassword.value='new-password-5678';f.elements.confirmPassword.value='wrong-confirmation';
   f.dispatchEvent(new a.w.Event('submit',{cancelable:true}));await tick();
   assert.equal(a.calls.some(c=>c.path.endsWith('/change-password')),false);
   f.elements.confirmPassword.value=f.elements.newPassword.value;
   f.dispatchEvent(new a.w.Event('submit',{cancelable:true}));await tick();await tick();
   const call=a.calls.find(c=>c.path.endsWith('/change-password'));
   assert.equal(JSON.parse(call.body).revokeOtherSessions,true);
   assert.equal(call.credentials,'omit');assert.equal(call.headers.authorization,'Bearer existing-session');
   assert.equal(f.elements.currentPassword.value,'');assert.equal(f.elements.newPassword.value,'');
   assert.equal(a.d.getElementById('workspace').hidden,!failure);
   assert.equal(a.w.sessionStorage.getItem('petru-ines-portal-v2-session')===null,!failure);
   if(!failure)assert.equal(a.calls.find(c=>c.path.endsWith('/sign-out')).headers.authorization,'Bearer rotated-session');
  }finally{a.close();}
 }
});
