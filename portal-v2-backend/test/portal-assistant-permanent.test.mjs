import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,sign,constants} from 'node:crypto';import {readFileSync} from 'node:fs';import {setup} from './one-time-harness.mjs';import {handleAssistantCommand} from '../src/one-time.mjs';import {SIGNING_CONTEXT} from '../src/assistant-auth.mjs';
const now='2026-11-28T10:00:00.000Z',stamp=String(Date.parse(now)/1000);
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:3072});const jwk=publicKey.export({format:'jwk'});
const input={operation:'create',request_id:'11111111-2222-4333-8444-555555555555',calendar_reviewed:false,estimated_end_at:'2026-12-15T13:00:00+02:00',project:{name:'TEST candidate',client_name:'Synthetic client',phone:'0000000000',email:'',location:'Synthetic address',show_location:false,scheduled_at:'2026-12-15T10:00:00+02:00',price_bani:69900,description:'Synthetic',invoice_url:'',expiry_days:30,status:'confirmed',tasks:[{title:'[Baie] Curățare',done:false},{title:'[Hol] Aspirare',done:false}]}};
const signed=(raw,ts)=>sign('sha256',Buffer.from(SIGNING_CONTEXT+ts+'\n'+raw),{key:privateKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('base64url');
function fixture(){const s=setup();s.sqlite.exec(readFileSync(new URL('../one-time-migrations/0007_assistant_requests.sql',import.meta.url),'utf8'));s.sqlite.exec('CREATE TABLE appointments(id TEXT PRIMARY KEY,starts_at TEXT,ends_at TEXT,status TEXT,deleted_at TEXT)');let blocks=[];const bucket={get:async()=>({text:async()=>JSON.stringify({format:1,rows:blocks})})};const invoke=(data=input,opts={})=>{const raw=JSON.stringify(data),ts=opts.stamp||stamp;return handleAssistantCommand(new Request('https://api.petruandines.com/api/portal-assistant/v1/command',{method:'POST',headers:{'content-type':'application/json','x-pa-timestamp':ts,...(opts.noSig?{}:{'x-pa-signature':signed(opts.tampered?'{}':raw,ts)}),...(opts.origin?{origin:'https://petruandines.com'}:{})},body:raw}),{db:s.db,bucket,passwordSecret:s.passwordSecret,now,publicJwk:opts.disabled?null:jwk})};return {...s,invoke,setBlocks:v=>blocks=v}}
test('signed command, validation, durable idempotency, access lifecycle',async()=>{const s=fixture();try{
 assert.equal((await s.invoke(input,{disabled:true})).status,404);
 for(const opts of [{noSig:true},{tampered:true},{stamp:String(Number(stamp)-91)},{origin:true}])assert.equal((await s.invoke(input,opts)).status,401);
 const bad=structuredClone(input);bad.project.tasks[0].done=true;assert.equal((await s.invoke(bad)).status,400);
 assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM one_time_projects').get().n,0);
 const result=await s.invoke();assert.equal(result.status,201,await result.clone().text());const x=await result.json();assert.equal(x.task_count,2);assert.equal(x.verified,true);assert.equal(s.sqlite.prepare('SELECT last_login_at FROM one_time_project_access WHERE project_id=?').get(x.id).last_login_at,null);assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM one_time_project_sessions').get().n,0);assert.match(x.password,/^[a-f0-9]{36}$/);
 const token=new URL(x.client_url).searchParams.get('token');assert.match(token,/^[a-f0-9]{64}$/);
 const login=await s.call('client/'+token+'/login',{admin:false,data:{password:x.password,remember:false}});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];const view=await(await s.call('client/'+token+'/view',{admin:false,cookie})).json();assert.equal(view.price_bani,69900);assert.equal(view.tasks.length,2);assert.equal(view.location,'');
 const copy=await s.call('admin/'+x.id+'/password',{data:{}});assert.equal((await copy.json()).password,x.password);
 assert.equal((await s.invoke()).status,409);
 const changed=structuredClone(input);changed.request_id='21111111-2222-4333-8444-555555555555';assert.equal((await s.invoke(changed)).status,409);
 const del=await s.call('admin/'+x.id+'/delete',{data:{confirm:true,version:1}});assert.equal(del.status,200);assert.equal((await s.invoke()).status,409);assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM one_time_assistant_requests').get().n,1);
 }finally{s.sqlite.close()}});
test('calendar checks D1 and recurring manual blocks; no identifying details',async()=>{const s=fixture();try{
 s.sqlite.prepare('INSERT INTO appointments VALUES(?,?,?,?,?)').run('r','2026-12-15T07:00:00.000Z','2026-12-15T09:00:00.000Z','confirmed',null);
 assert.equal((await s.invoke()).status,409);
 s.sqlite.exec('DELETE FROM appointments');
 s.setBlocks([{title:'Private calendar title',start:'2026-12-08T11:00',end:'2026-12-08T12:00',repeat:'weekly',repeat_until:null,exceptions:{}}]);
 const check=await s.invoke({operation:'check_day',date:'2026-12-15'});assert.equal(check.status,200);const data=await check.json();assert.equal(data.blocks.length,1);assert.equal(JSON.stringify(data).includes('Private calendar title'),false);
 assert.equal((await s.invoke()).status,409);
 s.setBlocks([{title:'Private',start:'2026-12-15T16:00',end:'2026-12-15T17:00',repeat:'none'}]);
 assert.equal((await s.invoke()).status,409);
 const reviewed={...input,calendar_reviewed:true};assert.equal((await s.invoke(reviewed)).status,201);
 }finally{s.sqlite.close()}});

test('only the exact synthetic fixture can be created as a draft',async()=>{const s=fixture();try{
 const synthetic=structuredClone(input);synthetic.project.status='draft';
 assert.equal((await s.invoke(synthetic)).status,400);
 Object.assign(synthetic.project,{name:'TEST – Portal Assistant permanent',client_name:'Client FICTIV – test permanent',phone:'0000000000',email:'',location:'Locație fictivă – test tehnic',show_location:false});
 const result=await s.invoke(synthetic);assert.equal(result.status,201,await result.clone().text());assert.equal((await result.json()).status,'draft');
}finally{s.sqlite.close()}});
