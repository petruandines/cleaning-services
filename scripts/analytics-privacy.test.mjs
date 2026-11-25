import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../assets/js/pi-analytics.js',import.meta.url),'utf8');
function simulate(url='https://petruandines.com/',stored={},referrer='',canonical='https://petruandines.com/'){
  const nodes=[],handlers={},requests=[],data={...stored};
  const make=(tag)=>({tag,hidden:false,children:[],listeners:{},classList:{contains:()=>false},setAttribute(){},append(...n){this.children.push(...n)},appendChild(n){this.children.push(n);if(n.src)requests.push(n.src);return n},addEventListener(k,f){this.listeners[k]=f},focus(){}});
  const head=make('head'),body=make('body'),preference=make('button');
  const loc=new URL(url);loc.reload=()=>{loc.reloaded=true};
  const doc={head,body,referrer,cookie:'',documentElement:{lang:'ro'},createElement(t){const n=make(t);nodes.push(n);return n;},querySelector(q){return q.includes('canonical')?{href:canonical}:null;},getElementById(id){return id==='pi-consent-preferences'?preference:null;},addEventListener(k,f){handlers[k]=f}};
  const window={addEventListener(k,f){handlers[k]=f}};
  const localStorage={getItem:k=>data[k]??null,setItem(k,v){data[k]=v}};
  vm.runInNewContext(code,{window,document:doc,location:loc,localStorage,URL,Date,Set,Object,Number,JSON});
  return {window,requests,data,loc,buttons:nodes.filter(n=>n.tag==='button'),handlers};
}
const consent={pi_analytics_consent_v1:JSON.stringify({value:'granted',at:Date.now()})};
test('no request before consent or after reject',()=>{let s=simulate();assert.equal(s.requests.length,0);s.buttons[1].listeners.click();assert.equal(s.requests.length,0);assert.equal(simulate(undefined,s.data).requests.length,0)});
test('one container, analytics granted only, no PII payload',()=>{let s=simulate();s.buttons[0].listeners.click();assert.equal(s.requests.length,1);s.buttons[0].listeners.click();assert.equal(s.requests.length,1);const d=s.window.dataLayer.map(x=>Array.from(x));const update=d.find(x=>x[0]==='consent'&&x[1]==='update');assert.equal(update[2].analytics_storage,'granted');assert.equal(update[2].ad_storage,'denied');assert.equal(update[2].ad_user_data,'denied');assert.equal(update[2].ad_personalization,'denied');s.window.PIAnalytics.quote('quote_form');assert.ok(s.window.dataLayer.some(x=>x[1]==='quote_request_start'));assert.ok(s.window.dataLayer.some(x=>x[1]==='whatsapp_click'));});
test('private, arbitrary query, staff and preview do not load',()=>{for(const s of [simulate('https://petruandines.com/portal/project/?token=fake',consent,'','https://petruandines.com/portal/project/'),simulate('https://petruandines.com/?name=fake',consent),simulate(undefined,{...consent,pi_analytics_internal_v1:'1'}),simulate('https://preview.pages.dev/',consent),simulate(undefined,consent,'https://petruandines.com/portal/project/?token=fake')])assert.equal(s.requests.length,0)});
test('known AI attribution and sanitized external referrer',()=>{let s=simulate('https://petruandines.com/?utm_source=chatgpt.com',consent,'https://chatgpt.com/c/fake');assert.equal(s.requests.length,1);let set=s.window.dataLayer.find(x=>x[0]==='set');assert.equal(set[1].page_referrer,'https://chatgpt.com/');assert.ok(set[1].page_location.endsWith('utm_source=chatgpt.com'))});
test('withdraw consent disables and reloads; subsequent visit blocked',()=>{let s=simulate(undefined,consent);s.buttons[1].listeners.click();assert.equal(s.window['ga-disable-G-9FBR322D7B'],true);assert.equal(s.loc.reloaded,true);assert.equal(simulate(undefined,s.data).requests.length,0)});
