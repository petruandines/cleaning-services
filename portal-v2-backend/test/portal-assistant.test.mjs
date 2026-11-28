import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './one-time-harness.mjs';
import {handleAssistantTest} from '../src/one-time.mjs';
const requestId='01234567-89ab-4cde-8f01-23456789abcd';
const data={operation:'create_test',request_id:requestId};
test('assistant test: disabled by default, authorization, exact schema, atomic create, idempotency, password copy and client access',async()=>{
 const s=setup();try{
  const other=await s.create('Existing unrelated project');
  const before=JSON.stringify(s.sqlite.prepare('SELECT * FROM one_time_projects WHERE id=?').get(other.id));
  const invoke=(options={})=>handleAssistantTest(new Request('https://api.petruandines.com/api/portal-assistant/v1/test-create',{method:'POST',headers:{'content-type':'application/json',...(options.noAuth?{}:{authorization:'Bearer fixture'}),...(options.origin?{origin:options.origin}:{})},body:JSON.stringify(options.data||data)}),{db:s.db,passwordSecret:s.passwordSecret,now:options.now||'2026-11-28T10:00:00.000Z',enabled:options.enabled!==false,identityVerifier:async()=>{if(options.deny)throw Error('denied');return{runId:'123'};}});
  assert.equal((await invoke({enabled:false})).status,404);
  assert.equal((await invoke({now:'2026-11-29T00:00:00.000Z'})).status,404);
  assert.equal((await invoke({noAuth:true})).status,401);
  assert.equal((await invoke({deny:true})).status,401);
  assert.equal((await invoke({origin:'https://petruandines.com'})).status,403);
  assert.equal((await invoke({data:{...data,client_name:'not accepted'}})).status,400);
  assert.equal((await invoke({data:{...data,request_id:'invalid'}})).status,400);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM one_time_projects').get().n,1);
  const r=await invoke();assert.equal(r.status,201);const out=await r.json();assert.equal(out.status,'draft');assert.equal(out.task_count,18);
  assert.match(out.password,/^[a-f0-9]{36}$/);const token=new URL(out.client_url).searchParams.get('token');assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal((await invoke()).status,409);
  assert.equal((await invoke({data:{...data,request_id:'11234567-89ab-4cde-8f01-23456789abcd'}})).status,409);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM one_time_projects').get().n,2);
  assert.equal(JSON.stringify(s.sqlite.prepare('SELECT * FROM one_time_projects WHERE id=?').get(other.id)),before);
  const copy=await s.call('admin/'+out.id+'/password',{data:{}});assert.equal(copy.status,200);assert.ok((await copy.json()).password===out.password);
  const login=await s.call('client/'+token+'/login',{admin:false,data:{password:out.password,remember:false}});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const view=await s.call('client/'+token+'/view',{admin:false,cookie});assert.equal(view.status,200);const v=await view.json();assert.equal(v.tasks.length,18);assert.equal(v.price_bani,69900);assert.equal(v.location,'');assert.equal(v.status,'draft');assert.equal(v.client_name,undefined);
  assert.ok(!s.sqlite.prepare('SELECT ciphertext FROM one_time_project_passwords WHERE project_id=?').get(out.id).ciphertext.includes(out.password));
  assert.equal((await s.call('admin',{admin:false,cookie})).status,401);
 }finally{s.sqlite.close();}
});
