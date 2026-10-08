import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './one-time-harness.mjs';
import {createRecipe,assemblePDF} from '../src/reports/pdf.mjs';
import resources from '../src/reports/resources.json' with {type:'json'};

function storage(){
 const objects=new Map();return {objects,puts:0,failPut:false,failDelete:false,
 async put(key,bytes,options){if(this.failPut)throw new Error('offline');this.puts++;objects.set(key,{bytes:new Uint8Array(bytes),customMetadata:options.customMetadata});},
 async get(key){const value=objects.get(key);return value?{body:value.bytes,size:value.bytes.length,customMetadata:value.customMetadata}:null;},
 async head(key){return this.get(key);},async delete(key){if(this.failDelete)throw new Error('offline');objects.delete(key);}};
}
const parse=async r=>{assert.equal(r.status,200,await r.clone().text());return r.json();};
async function complete(s,p,opt=true){if(opt)await parse(await s.call('admin/'+p.id+'/report',{data:{operation:'preference',enabled:true}}));return parse(await s.call('admin/'+p.id+'/complete',{data:{confirm:true}}));}
const prepare=async(s,p,data={})=>parse(await s.call('admin/'+p.id+'/report',{data:{operation:'prepare',...data}}));
async function save(s,p,prepared){return s.call('admin/'+p.id+'/report?ticket='+prepared.ticket,{method:'POST',upload:assemblePDF(createRecipe(prepared.snapshot,resources),resources)});}

test('opt-in completion snapshot, exact PDF upload, idempotent save, delete and versioned regeneration preserve history',async()=>{
 const bucket=storage(),s=setup({reports:true,bucket});try{
  let p=await s.create();const access=await s.generate(p.id),{cookie}=await s.login(access.access.token),client='client/'+access.access.token;
  assert.equal(p.report.enabled,false);assert.equal((await s.call(client+'/report',{admin:false,cookie})).status,404);
  assert.equal((await s.call('admin/'+p.id+'/report',{data:{operation:'prepare'}})).status,409);
  p=await complete(s,p);const final=p.completed_at,version=p.version;
  assert.equal(p.report.status,'pending');assert.equal(bucket.puts,0);
  const a=await prepare(s,p);assert.equal((await prepare(s,p)).ticket,a.ticket,'reload resumes same document');
  assert.equal(a.snapshot.tasks[0].done,0);assert.equal(a.snapshot.billing.total_bani,49900);
  await parse(await s.call('admin/'+p.id,{method:'PATCH',data:{version,name:'Nume modificat după finalizare'}}));
  assert.equal((await prepare(s,p)).snapshot.name,a.snapshot.name,'first report retains completed snapshot');
  const pdf=assemblePDF(createRecipe(a.snapshot,resources),resources),forged=pdf.slice();forged[20]^=1;
  assert.equal((await s.call('admin/'+p.id+'/report?ticket='+a.ticket,{method:'POST',upload:forged})).status,400);assert.equal(bucket.puts,0);
  let state=await parse(await save(s,p,a));assert.equal(state.status,'ready');assert.ok(state.size_bytes>0);
  await parse(await save(s,p,a));assert.equal(bucket.puts,1,'lost response does not duplicate writes');
  const dl=await s.call(client+'/report',{admin:false,cookie});assert.equal(dl.status,200);assert.equal(dl.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal(dl.headers.get('content-type'),'application/pdf');assert.match(dl.headers.get('content-disposition'),/attachment/);
  assert.deepEqual(new Uint8Array(await dl.arrayBuffer()),pdf);
  assert.equal((await parse(await s.call(client+'/view',{admin:false,cookie}))).report_available,true);
  assert.equal((await prepare(s,p)).already_ready,true);
  assert.equal((await s.call('admin/'+p.id+'/report',{data:{operation:'delete'}})).status,400);
  state=await parse(await s.call('admin/'+p.id+'/report',{data:{operation:'delete',confirm:true}}));assert.equal(state.status,'deleted');assert.equal(bucket.objects.size,0);
  assert.equal((await s.call(client+'/report',{admin:false,cookie})).status,404);
  assert.equal((await parse(await s.call(client+'/view',{admin:false,cookie}))).report_available,false);
  const b=await prepare(s,p);assert.notEqual(b.ticket,a.ticket);assert.equal(b.snapshot.report_version,2);assert.equal(b.snapshot.name,'Nume modificat după finalizare');await parse(await save(s,p,b));
  const history=await parse(await s.call('admin/'+p.id));assert.equal(history.completed_at,final);assert.equal(history.tasks.length,2);assert.equal(history.billing.total_bani,49900);
  const events=(await parse(await s.call('admin/'+p.id+'/activity'))).rows.map(x=>x.type);assert.equal(events.filter(x=>x==='report_generated').length,2);assert.ok(events.includes('report_deleted'));
 }finally{s.sqlite.close();}
});
test('all report operations enforce admin TOTP, Origin and per-project client sessions; revoked/expired URLs fail',async()=>{
 const bucket=storage(),s=setup({reports:true,bucket});try{
  let p=await s.create(),a=await s.generate(p.id),{cookie}=await s.login(a.access.token);p=await complete(s,p);const pending=await prepare(s,p);await parse(await save(s,p,pending));
  const other=await s.generate((await s.create('Alt client')).id);
  assert.equal((await s.call('client/'+other.access.token+'/report',{admin:false,cookie})).status,401);
  for(const operation of ['preference','prepare','delete'])for(const authorization of ['Bearer recurrent','Bearer pending'])assert.equal((await s.call('admin/'+p.id+'/report',{authorization,data:{operation,confirm:true,enabled:true}})).status,403);
  for(const origin of [null,'https://evil.example'])assert.equal((await s.call('admin/'+p.id+'/report',{origin,data:{operation:'prepare'}})).status,403);
  assert.equal((await s.call('admin/'+p.id+'/report-download',{admin:false,cookie})).status,401);
  assert.equal((await s.call('client/'+a.access.token+'/report',{admin:false,cookie,data:{operation:'delete'}})).status,405);
  await parse(await s.call('admin/'+p.id+'/access',{data:{operation:'revoke'}}));assert.equal((await s.call('client/'+a.access.token+'/report',{admin:false,cookie})).status,403);
  await parse(await s.call('admin/'+p.id+'/access',{data:{operation:'reactivate'}}));assert.equal((await s.call('client/'+a.access.token+'/report',{admin:false,cookie})).status,401);
  cookie=(await s.login(a.access.token)).cookie;s.setNow('2026-10-22T10:00:00.000Z');assert.equal((await s.call('client/'+a.access.token+'/report',{admin:false,cookie})).status,410);
  assert.equal((await s.call('admin/'+p.id+'/report-download')).status,200,'admin history unaffected by expiry');
 }finally{s.sqlite.close();}
});
test('no opt-in and unavailable storage do not prevent completion; failed upload and deletion can be retried',async()=>{
 const bucket=storage(),s=setup({reports:true,bucket});try{
  const plain=await complete(s,await s.create('Fără raport'),false);assert.equal(plain.report.status,'none');assert.equal(bucket.puts,0);
  let p=await complete(s,await s.create()),a=await prepare(s,p);bucket.failPut=true;assert.equal((await save(s,p,a)).status,503);
  assert.equal((await parse(await s.call('admin/'+p.id))).status,'completed');assert.equal((await prepare(s,p)).ticket,a.ticket);
  bucket.failPut=false;await parse(await save(s,p,a));bucket.failDelete=true;
  assert.equal((await s.call('admin/'+p.id+'/report',{data:{operation:'delete',confirm:true}})).status,503);
  assert.equal((await s.call('admin/'+p.id+'/report-download')).status,404,'deleting denies downloads immediately');
  bucket.failDelete=false;await parse(await s.call('admin/'+p.id+'/report',{data:{operation:'delete',confirm:true}}));assert.equal(bucket.objects.size,0);
  s.sqlite.exec('DROP TABLE one_time_project_reports');assert.equal((await s.call('admin/'+plain.id)).status,200,'missing additive table does not break existing views');
 }finally{s.sqlite.close();}
 const off=setup();try{assert.equal((await complete(off,await off.create(),false)).status,'completed');assert.equal((await off.call('admin/'+(await off.create()).id+'/report',{data:{operation:'prepare'}})).status,503);}finally{off.sqlite.close();}
});
test('successful R2 write followed by D1 confirmation failure recovers without another upload',async()=>{
 const bucket=storage(),s=setup({reports:true,bucket});try{
  const p=await complete(s,await s.create()),a=await prepare(s,p);
  s.sqlite.exec("CREATE TRIGGER reject_report_event BEFORE INSERT ON one_time_project_activity WHEN NEW.type='report_generated' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.equal((await save(s,p,a)).status,500);assert.equal(bucket.puts,1);assert.equal((await parse(await s.call('admin/'+p.id))).report.status,'saving');
  s.sqlite.exec('DROP TRIGGER reject_report_event');assert.equal((await prepare(s,p)).already_ready,true);assert.equal(bucket.puts,1);
  assert.equal((await s.call('admin/'+p.id+'/report-download')).status,200);
 }finally{s.sqlite.close();}
});
test('hourly report uses existing billing result and a 500-task recipe has safe A4 text coordinates',async()=>{
 const bucket=storage(),s=setup({reports:true,bucket});try{
  let p=await s.create();p=await parse(await s.call('admin/'+p.id,{method:'PATCH',data:{version:p.version,price_bani:10000,show_location:false,service_options:{billing_mode:'hourly'},tasks:Array.from({length:500},(_,i)=>({title:`Activitate ${i+1}: Ștergere și igienizare suprafețe. `+'Verificare '.repeat(12),done:i%2===0}))}}));
  await parse(await s.call('admin/'+p.id+'/start',{data:{}}));s.setNow('2026-10-15T11:20:00.000Z');p=await complete(s,p);
  const a=await prepare(s,p);assert.deepEqual(a.snapshot.billing,p.billing);assert.equal(a.snapshot.location,'');assert.equal(a.snapshot.duration_ms,4800000);
  const recipe=createRecipe(a.snapshot,resources);assert.ok(recipe.pages.length>10);
  for(const page of recipe.pages)for(const op of page)if(op.kind==='text'){assert.ok(op.y>=43&&op.y<=795);assert.ok(op.x>=42&&op.x<=510);}
  await parse(await save(s,p,a));
 }finally{s.sqlite.close();}
});
test('an interrupted saving request can resume, and a late storage write cannot revive a deleted document',async()=>{
 const bucket=storage(),s=setup({reports:true,bucket});try{
  const p=await complete(s,await s.create()),a=await prepare(s,p);
  s.sqlite.prepare("UPDATE one_time_project_reports SET status='saving' WHERE project_id=?").run(p.id);
  const resumed=await prepare(s,p);assert.equal(resumed.ticket,a.ticket);assert.equal(resumed.report.status,'failed');
  let release;const gate=new Promise(r=>release=r),original=bucket.put.bind(bucket);bucket.put=async(...args)=>{await gate;return original(...args);};
  const inFlight=save(s,p,resumed);
  for(let i=0;i<100&&s.sqlite.prepare('SELECT status FROM one_time_project_reports WHERE project_id=?').get(p.id).status!=='saving';i++)await new Promise(r=>setTimeout(r,1));
  assert.equal(s.sqlite.prepare('SELECT status FROM one_time_project_reports WHERE project_id=?').get(p.id).status,'saving');
  await prepare(s,p); // Recovery sees no R2 object and invalidates the old CAS.
  await parse(await s.call('admin/'+p.id+'/report',{data:{operation:'delete',confirm:true}}));
  release();assert.equal((await inFlight).status,409);assert.equal(bucket.objects.size,0);
  assert.equal((await parse(await s.call('admin/'+p.id))).report.status,'deleted');
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM one_time_project_report_files WHERE project_id=? AND delete_requested=1').get(p.id).n,1);
 }finally{s.sqlite.close();}
});
