import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
const code=(await build({entryPoints:[new URL('../app.js',import.meta.url).pathname],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
async function setup(role='staff'){
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://petruandines.github.io/cleaning-services/portal-v2-frontend/',runScripts:'outside-only'});
 const w=dom.window;const calls=[];let delay=null;
 w.PETRU_INES_API_ORIGIN='https://api.example.test';w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.sessionStorage.setItem('petru-ines-portal-v2-session',JSON.stringify({token:'token',expiresAt:Date.now()+60000}));
 w.fetch=async(url,init={})=>{
  const u=new URL(url);const path=u.pathname;calls.push({path,method:init.method,body:init.body,client:u.searchParams.get('client_id')});
  if(delay&&path.endsWith('/payments')&&!init.method)await delay;
  const data=path.endsWith('/me')?{id:'owner',role,name:'Admin'}:
   path.endsWith('/clients')?{rows:[{id:'c',display_name:'Client',kind:'PF'}],nextOffset:null}:
   path.endsWith('/locations')?{rows:[{id:'l1',label:'Sediu',address:'A',active:1}],nextOffset:null}:
   path.endsWith('/payments')?{rows:[{id:'p',client_id:'c',client_name:'Client',amount_bani:12345,status:'pending',location_ids:['l1'],note:'Test'}],nextOffset:30}:
   path.endsWith('/contracts')?{rows:[{manager_name:'Manager'}],nextOffset:null}:
   path.endsWith('/users')?{rows:[{name:'Client',email:'client@example.test'}]}:
   path.endsWith('/overview')?{unreadMessages:2,nextAppointment:null}:{rows:[],nextOffset:null,id:'new'};
  return {ok:true,json:async()=>data};
 };
 w.eval(code);await tick();await tick();
 const d=w.document;
 const click=async(section,view='list')=>{d.querySelector(`button[data-section=${section}][data-view=${view}]`).click();await tick();await tick();};
 const client=async()=>{d.getElementById('client-picker').value='c';d.getElementById('client-picker').dispatchEvent(new w.Event('change'));await tick();await tick();};
 return {w,d,calls,click,client,setDelay:p=>delay=p,close:()=>w.close()};
}
test('admin list, export, create, contract and access are independent views',async()=>{
 const a=await setup();const {d}=a;const hidden=id=>d.getElementById(id).hidden;
 try{
  assert.equal(d.querySelectorAll('#tabs details').length,3);
  assert.ok(hidden('staff-form'));assert.ok(hidden('calendar-export'));assert.ok(hidden('account-panel'));
  await a.click('payments','create');assert.ok(!hidden('staff-form'));assert.ok(hidden('content'));assert.ok(!hidden('staff-form-hint'));
  await a.client();assert.equal(d.getElementById('client-picker').value,'c');assert.ok(!hidden('staff-form'));assert.ok(hidden('staff-form-hint'));
  await a.click('payments','list');assert.ok(!hidden('content'));assert.ok(hidden('staff-form'));assert.ok(hidden('payments-export'));assert.ok(!hidden('pager'));
  await a.click('payments','export');assert.ok(hidden('content'));assert.ok(hidden('pager'));assert.ok(hidden('staff-form'));assert.ok(!hidden('payments-export'));
  await a.click('appointments','export');assert.ok(!hidden('calendar-export'));assert.ok(hidden('payments-export'));assert.equal(d.getElementById('calendar-download').disabled,false);
  await a.click('clients','contract');assert.ok(!hidden('contract-panel'));assert.ok(hidden('content'));assert.equal(d.getElementById('contract-manager-name').value,'Manager');
  await a.click('clients','access');assert.ok(hidden('contract-panel'));assert.ok(!hidden('account-panel'));assert.match(d.getElementById('account-list').textContent,/client@example/);
  await a.click('clients','create');assert.ok(hidden('account-panel'));assert.ok(!hidden('staff-form'));assert.equal(d.getElementById('client-picker').value,'c');
 }finally{a.close();}
});
test('edit from list opens its form and cancel returns to list',async()=>{
 const a=await setup();try{
  await a.client();await a.click('payments');
  [...a.d.querySelectorAll('#content button')].find(b=>b.textContent==='Editează').click();await tick();await tick();
  assert.equal(a.d.getElementById('staff-form').hidden,false);assert.equal(a.d.getElementById('content').hidden,true);
  assert.equal(a.d.getElementById('staff-form').elements.namedItem('amount_bani').value,'123,45');
  assert.equal(a.d.querySelector('#payment-locations input').checked,true);
  a.d.getElementById('cancel-edit').click();await tick();await tick();assert.equal(a.d.getElementById('content').hidden,false);assert.equal(a.d.getElementById('staff-form').hidden,true);
 }finally{a.close();}
});
test('editing a client synchronizes the selected client context',async()=>{
 const a=await setup();try{
  await a.click('clients');
  [...a.d.querySelectorAll('#content button')].find(b=>b.textContent==='Editează').click();await tick();await tick();
  assert.equal(a.d.getElementById('client-picker').value,'c');
  assert.equal(a.d.getElementById('staff-form').elements.namedItem('display_name').value,'Client');
  assert.equal(a.d.getElementById('staff-form').hidden,false);
 }finally{a.close();}
});
test('late list request cannot expose pager in create view',async()=>{
 const a=await setup();try{
  await a.client();let release;a.setDelay(new Promise(r=>release=r));
  a.d.querySelector('button[data-section=payments][data-view=list]').click();await tick();
  await a.click('payments','create');release();await tick();await tick();
  assert.equal(a.d.getElementById('content').hidden,true);assert.equal(a.d.getElementById('pager').hidden,true);assert.equal(a.d.getElementById('staff-form').hidden,false);
 }finally{a.close();}
});
test('client retains simple tabs and visible exports without admin forms',async()=>{
 const a=await setup('client');try{
  assert.equal(a.d.querySelectorAll('#tabs details').length,0);assert.equal(a.d.getElementById('staff-tools').hidden,true);
  assert.equal(a.d.getElementById('calendar-export').hidden,false);
  await a.click('payments');assert.equal(a.d.getElementById('payments-export').hidden,false);assert.equal(a.d.getElementById('staff-form').hidden,true);
 }finally{a.close();}
});
