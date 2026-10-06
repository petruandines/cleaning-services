import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './one-time-harness.mjs';
import {REVIEW_URL} from '../src/one-time.mjs';
import {handleApi} from '../src/api.mjs';

test('one-time lifecycle end-to-end, isolation, persistent cookie, invoice and review gating',async()=>{
 const s=setup(),p=await s.create(),access=await s.generate(p.id),token=access.access.token;
 assert.match(token,/^[a-f0-9]{64}$/);assert.equal('password_hash' in access.access,false);
 const {cookie,header}=await s.login(token);assert.match(header,/Secure; HttpOnly; SameSite=Lax; Max-Age=2592000/);
 let response=await s.call('client/'+token+'/view',{admin:false,cookie});assert.equal(response.status,200);
 let view=await response.json();assert.equal(view.review_url,null);assert.equal(view.price_bani,49900);assert.equal(view.tasks.length,2);
 for(const secret of ['phone','email','client_name','access','version','id','password_hash'])assert.equal(secret in view,false);
 assert.equal((await s.call('client/'+token+'/view',{admin:false,cookie})).status,200,'cookie is reusable after browser restart');
 assert.equal((await s.call('admin',{admin:false,cookie})).status,401);
 assert.equal((await s.call('admin/'+p.id+'/preview',{authorization:'Bearer recurrent'})).status,403);
 assert.equal((await s.call('admin/'+p.id+'/preview',{authorization:'Bearer pending'})).status,403);
 assert.equal((await s.call('admin/'+p.id+'/preview')).status,200);
 const second=await s.generate((await s.create('Alt proiect')).id);
 assert.equal((await s.call('client/'+second.access.token+'/view',{admin:false,cookie})).status,401);
 assert.equal((await s.call('client/'+'a'.repeat(64)+'/view',{admin:false,cookie})).status,403);
 assert.equal((await handleApi(new Request('https://api.petruandines.com/api/me',{headers:{cookie}}),{db:s.db,auth:s.auth})).status,401,'temporary session cannot access normal portal');
 const edit=await s.call('admin/'+p.id,{method:'PATCH',data:{version:1,tasks:[{id:p.tasks[0].id,title:'Aspirare',done:true},{id:p.tasks[1].id,title:'Control',done:false}],invoice_url:'https://example.com/invoice.pdf'}});assert.equal(edit.status,200,await edit.clone().text());
 view=await(await s.call('client/'+token+'/view',{admin:false,cookie})).json();assert.equal(view.tasks[0].done,1);assert.ok(view.tasks[0].completed_at);assert.equal(view.invoice_url,'https://example.com/invoice.pdf');
 assert.equal((await s.call('admin/'+p.id,{method:'PATCH',data:{version:1,name:'Stale'}})).status,409);
 assert.equal((await s.call('admin/'+p.id+'/start',{data:{}})).status,200);
 view=await(await s.call('client/'+token+'/view',{admin:false,cookie})).json();assert.equal(view.status,'in_progress');assert.equal(view.review_url,null);
 assert.equal((await s.call('admin/'+p.id+'/complete',{data:{}})).status,400);
 s.setNow('2026-10-15T13:30:00.000Z');assert.equal((await s.call('admin/'+p.id+'/complete',{data:{confirm:true}})).status,200);
 view=await(await s.call('client/'+token+'/view',{admin:false,cookie})).json();assert.equal(view.status,'completed');assert.equal(view.review_url,REVIEW_URL);
 const done=await(await s.call('admin/'+p.id)).json();assert.equal(done.access.expires_at,'2026-10-22T13:30:00.000Z');
 s.setNow('2026-10-22T13:29:59.999Z');assert.equal((await s.call('client/'+token+'/view',{admin:false,cookie})).status,200);
 s.setNow('2026-10-22T13:30:00.000Z');response=await s.call('client/'+token+'/view',{admin:false,cookie});assert.equal(response.status,410);assert.deepEqual(await response.json(),{error:'access_expired'});
 await s.call('client/'+token+'/view',{admin:false,cookie});assert.equal(s.sqlite.prepare("SELECT COUNT(*) n FROM one_time_project_activity WHERE type='access_expired' AND project_id=?").get(p.id).n,1);
 assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM one_time_projects WHERE id=?').get(p.id).n,1,'expiration preserves history');
 s.sqlite.close();
});

test('revocation/reactivation, logout, password reset, regeneration and no password recovery',async()=>{
 const s=setup(),p=await s.create(),a=await s.generate(p.id),token=a.access.token;
 let cookie=(await s.login(token)).cookie;
 assert.equal((await s.call('admin/'+p.id+'/access',{data:{operation:'revoke'}})).status,200);
 assert.equal((await s.call('client/'+token+'/view',{admin:false,cookie})).status,403);
 assert.equal((await s.call('admin/'+p.id+'/access',{data:{operation:'reactivate'}})).status,200);
 assert.equal((await s.call('client/'+token+'/view',{admin:false,cookie})).status,401);
 cookie=(await s.login(token)).cookie;
 assert.equal((await s.call('admin/'+p.id+'/access',{data:{operation:'reset',password:'new-secure-password'}})).status,200);
 assert.equal((await s.call('client/'+token+'/view',{admin:false,cookie})).status,401);
 assert.equal((await s.call('client/'+token+'/login',{admin:false,data:{password:'parola-securizata-123'}})).status,401);
 const login=await s.call('client/'+token+'/login',{admin:false,data:{password:'new-secure-password',remember:false}});assert.equal(login.status,200);assert.doesNotMatch(login.headers.get('set-cookie'),/Max-Age/);cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await s.call('client/'+token+'/logout',{admin:false,cookie,data:{}})).status,200);assert.equal((await s.call('client/'+token+'/view',{admin:false,cookie})).status,401);
 const newAccess=await s.generate(p.id);assert.notEqual(newAccess.access.token,token);assert.equal((await s.call('client/'+token+'/login',{admin:false,data:{password:'new-secure-password'}})).status,403);
 const stored=s.sqlite.prepare('SELECT password_hash FROM one_time_project_access WHERE project_id=?').get(p.id).password_hash;assert.notEqual(stored,'parola-securizata-123');assert.ok(stored.length>60);
 const logs=await(await s.call('admin/'+p.id+'/activity')).json();assert.equal(JSON.stringify(logs).includes('password'),false);assert.equal(JSON.stringify(logs).includes(token),false);
 s.sqlite.close();
});

test('server validation, brute force, no CSRF, custom/never expiry and maximum session age',async()=>{
 const s=setup(),p=await s.create(),a=await s.generate(p.id),token=a.access.token;
 assert.equal((await s.call('client/'+token+'/login',{admin:false,origin:'https://evil.example',data:{password:'parola-securizata-123'}})).status,403);
 assert.equal((await s.call('client/'+token+'/login',{admin:false,origin:null,data:{password:'parola-securizata-123'}})).status,403);
 assert.equal((await s.call('client/'+token+'/login',{method:'OPTIONS',admin:false})).status,204);
 for(let i=0;i<10;i++)assert.equal((await s.call('client/'+token+'/login',{admin:false,data:{password:'wrong'}})).status,401);
 assert.equal((await s.call('client/'+token+'/login',{admin:false,data:{password:'wrong'}})).status,429);
 s.setNow('2026-10-15T10:02:00.000Z');const {cookie}=await s.login(token);
 assert.equal((await s.call('admin/'+p.id,{method:'PATCH',data:{version:1,tasks:[{id:'other',title:'bad',done:true}]}})).status,400);
 assert.equal((await s.call('admin/'+p.id,{method:'PATCH',data:{version:1,invoice_url:'http://localhost/private'}})).status,400);
 assert.equal((await s.call('admin/'+p.id,{method:'PATCH',data:{version:1,invoice_url:'https://127.0.0.1/private'}})).status,400);
 assert.equal((await s.call('admin/'+p.id,{method:'PATCH',data:{version:1,status:'completed'}})).status,400);
 assert.equal((await s.call('admin/'+p.id,{method:'PATCH',data:{version:1,show_location:false,expiry_days:null}})).status,200);
 assert.equal((await(await s.call('client/'+token+'/view',{admin:false,cookie})).json()).location,'');
 assert.equal((await s.call('admin/'+p.id+'/complete',{data:{confirm:true}})).status,200);
 assert.equal((await(await s.call('admin/'+p.id)).json()).access.expires_at,null);
 s.setNow('2026-11-14T10:02:00.000Z');assert.equal((await s.call('client/'+token+'/view',{admin:false,cookie})).status,401);
 const done=await(await s.call('admin/'+p.id)).json();assert.equal((await s.call('admin/'+p.id,{method:'PATCH',data:{version:done.version,expiry_days:3}})).status,200);
 assert.equal((await(await s.call('admin/'+p.id)).json()).access.expires_at,'2026-10-18T10:02:00.000Z');s.sqlite.close();
});

test('checklist add/edit/delete/reorder and timestamp clearing, activity and pagination',async()=>{
 const s=setup(),p=await s.create();let r=await s.call('admin/'+p.id,{method:'PATCH',data:{version:1,tasks:[{id:p.tasks[1].id,title:'Ultimul',done:true},{title:'Nou',done:false}]}});assert.equal(r.status,200);
 let updated=await r.json();assert.equal(updated.tasks.length,2);assert.equal(updated.tasks[0].title,'Ultimul');assert.ok(updated.tasks[0].completed_at);assert.equal(updated.tasks[0].position,0);
 r=await s.call('admin/'+p.id,{method:'PATCH',data:{version:updated.version,tasks:updated.tasks.map(t=>({id:t.id,title:t.title,done:false}))}});assert.equal(r.status,200);updated=await r.json();assert.equal(updated.tasks[0].completed_at,null);
 const events=(await(await s.call('admin/'+p.id+'/activity')).json()).rows.map(x=>x.type);for(const e of ['project_created','task_done','task_undone','task_added','task_deleted'])assert.ok(events.includes(e));s.sqlite.close();
});


test('confirmed admin deletion removes only the selected project and invalidates access',async()=>{
 const s=setup();
 try {
  const p=await s.create(),a=await s.generate(p.id),{cookie}=await s.login(a.access.token);
  const other=await s.create('Proiect păstrat'),oa=await s.generate(other.id),oc=await s.login(oa.access.token);
  const path='admin/'+p.id+'/delete',data={confirm:true,version:p.version};
  assert.equal((await s.call(path,{data,admin:false,cookie})).status,401);
  for(const authorization of ['Bearer recurrent','Bearer pending'])assert.equal((await s.call(path,{data,authorization})).status,403);
  assert.equal((await s.call(path,{data,origin:'https://evil.example'})).status,403);
  assert.equal((await s.call(path,{data:{version:p.version}})).status,400);
  assert.equal((await s.call(path,{data:{...data,version:0}})).status,409);
  assert.equal((await s.call('client/'+a.access.token+'/view',{admin:false,cookie})).status,200);
  assert.equal((await s.call(path,{data})).status,200);
  for(const table of ['one_time_projects','one_time_project_tasks','one_time_project_access','one_time_project_sessions','one_time_project_activity']){
   const column=table==='one_time_projects'?'id':'project_id';
   assert.equal(s.sqlite.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`).get(p.id).n,0);
   assert.ok(s.sqlite.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`).get(other.id).n>0);
  }
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM one_time_project_rate_limits WHERE key=?').get('token:'+a.access.token).n,0);
  assert.equal((await s.call('client/'+a.access.token+'/view',{admin:false,cookie})).status,403);
  assert.equal((await s.call('client/'+a.access.token+'/login',{admin:false,data:{password:'parola-securizata-123'}})).status,403);
  assert.equal((await s.call('client/'+oa.access.token+'/view',{admin:false,cookie:oc.cookie})).status,200);
  assert.equal((await s.call('admin/'+p.id)).status,404);
 } finally {s.sqlite.close();}
});
