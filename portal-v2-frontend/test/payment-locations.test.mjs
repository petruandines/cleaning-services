import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
test('staff selects one, several or all locations and submits a single total',async()=>{
 const code=(await build({entryPoints:[new URL('../app.js',import.meta.url).pathname],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://petruandines.github.io/cleaning-services/portal-v2-frontend/',runScripts:'outside-only'});
 const w=dom.window; const posts=[];
 w.PETRU_INES_API_ORIGIN='https://api.example.test';w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.sessionStorage.setItem('petru-ines-portal-v2-session',JSON.stringify({token:'staff-token',expiresAt:Date.now()+60000}));
 w.fetch=async(url,init={})=>{
  const path=new URL(url).pathname;
  if(init.method==='POST')posts.push(JSON.parse(init.body));
  const data=path.endsWith('/me')?{id:'owner',role:'staff',name:'Admin'}:
   path.endsWith('/clients')?{rows:[{id:'c',display_name:'Client',kind:'PF'}],nextOffset:null}:
   path.endsWith('/locations')?{rows:[{id:'l1',label:'Sediu 1',address:'A',active:1},{id:'l2',label:'Sediu 2',address:'B',active:1}],nextOffset:null}:
   path.endsWith('/overview')?{unreadMessages:0,nextAppointment:null}: {rows:[],nextOffset:null,id:'new-payment'};
  return {ok:true,json:async()=>data};
 };
 try{
  w.eval(code);await tick();await tick();
  const picker=w.document.getElementById('client-picker');picker.value='c';picker.dispatchEvent(new w.Event('change'));await tick();await tick();
  w.document.querySelector('[data-section=payments]').click();await tick();await tick();
  const box=w.document.getElementById('payment-locations');assert.ok(box);
  const inputs=[...box.querySelectorAll('input')];assert.equal(inputs.length,2);
  box.querySelector('button').click();assert.ok(inputs.every(input=>input.checked));
  box.querySelectorAll('button')[1].click();assert.ok(inputs.every(input=>!input.checked));
  const form=w.document.getElementById('staff-form');form.elements.namedItem('amount_bani').value='123,45';
  inputs[1].checked=true;form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();await tick();
  assert.equal(posts.length,1);assert.deepEqual(posts[0].location_ids,['l2']);assert.equal(posts[0].amount_bani,12345);assert.equal(posts[0].appointment_id,undefined);
 }finally{w.close();}
});
