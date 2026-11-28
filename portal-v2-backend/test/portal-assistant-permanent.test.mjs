import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,sign,constants} from 'node:crypto';import {readFileSync} from 'node:fs';import {setup} from './one-time-harness.mjs';import {handleAssistantCommand} from '../src/one-time.mjs';import {SIGNING_CONTEXT} from '../src/assistant-auth.mjs';
const now='2026-11-28T10:00:00.000Z',stamp=String(Date.parse(now)/1000);
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:3072});const jwk=publicKey.export({format:'jwk'});
const input={operation:'create',request_id:'11111111-2222-4333-8444-555555555555',calendar_reviewed:false,estimated_end_at:'2026-12-15T13:00:00+02:00',project:{name:'TEST candidate',client_name:'Synthetic client',phone:'0000000000',email:'',location:'Synthetic address',show_location:false,scheduled_at:'2026-12-15T10:00:00+02:00',price_bani:69900,description:'Synthetic',invoice_url:'',expiry_days:30,status:'confirmed',tasks:[{title:'[Baie] Curățare',done:false},{title:'[Hol] Aspirare',done:false}]}};
const signed=(raw,ts)=>sign('sha256',Buffer.from(SIGNING_CONTEXT+ts+'\n'+raw),{key:privateKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('base64url');
function fixture(){const s=setup({reports:true});s.sqlite.exec(readFileSync(new URL('../one-time-migrations/0007_assistant_requests.sql',import.meta.url),'utf8'));s.sqlite.exec(readFileSync(new URL('../one-time-migrations/0008_assistant_mutations.sql',import.meta.url),'utf8'));s.sqlite.exec('CREATE TABLE appointments(id TEXT PRIMARY KEY,starts_at TEXT,ends_at TEXT,status TEXT,deleted_at TEXT)');let blocks=[];const bucket={get:async()=>({text:async()=>JSON.stringify({format:1,rows:blocks})})};const invoke=(data=input,opts={})=>{const raw=JSON.stringify(data),ts=opts.stamp||stamp;return handleAssistantCommand(new Request('https://api.petruandines.com/api/portal-assistant/v1/command',{method:'POST',headers:{'content-type':'application/json','x-pa-timestamp':ts,...(opts.noSig?{}:{'x-pa-signature':signed(opts.tampered?'{}':raw,ts)}),...(opts.origin?{origin:'https://petruandines.com'}:{})},body:raw}),{db:s.db,bucket,passwordSecret:s.passwordSecret,now:opts.now||now,publicJwk:opts.disabled?null:jwk})};return {...s,invoke,setBlocks:v=>blocks=v}}
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

const rid=n=>String(n).padStart(8,'0')+'-2222-4333-8444-555555555555';
const resetRate=s=>s.sqlite.exec("DELETE FROM one_time_project_rate_limits WHERE key='portal-assistant-command'");
test('maintenance: exact lookup, partial edit, preserved access and tasks, stale version, confirmed cascade delete and unrelated project',async()=>{const s=fixture();try{
 const other=await s.create('Unrelated existing project');
 const otherBefore=JSON.stringify(s.sqlite.prepare('SELECT * FROM one_time_projects WHERE id=?').get(other.id));
 const created=await(await s.invoke()).json();assert.ok(created.ok);const id=created.id,token=new URL(created.client_url).searchParams.get('token');
 const lookup=await(await s.invoke({operation:'find_project',client_name:'Synthetic client',date:'2026-12-15'})).json();assert.deepEqual(lookup.matches.map(x=>x.id),[id]);
 const snapshot=await(await s.invoke({operation:'get_project',id})).json();assert.ok(snapshot.project.maintenance_allowed);assert.equal(JSON.stringify(snapshot).includes(token),false);assert.equal(JSON.stringify(snapshot).includes(created.password),false);
 const firstTask=snapshot.project.tasks[0];
 const edit={operation:'edit',id,version:1,request_id:rid(1),calendar_reviewed:false,changes:{price_bani:79900,description:'Edited synthetic',tasks:[{id:firstTask.id,title:firstTask.title,done:false},{title:'[Hol] Operațiune nouă',done:false}]}};
 const bad=await s.invoke({...edit,changes:{...edit.changes,invoice_url:'https://example.com'}});assert.equal(bad.status,400);
 const response=await s.invoke(edit);assert.equal(response.status,200,await response.clone().text());const changed=await response.json();assert.equal(changed.version,2);assert.equal(changed.access_preserved,true);assert.equal(changed.project.price_bani,79900);assert.equal(changed.project.client_name,'Synthetic client');assert.equal(changed.project.tasks[0].id,firstTask.id);
 assert.equal((await s.invoke(edit)).status,409);assert.equal((await s.invoke({...edit,request_id:rid(2)})).status,409);
 const access=await s.call('admin/'+id+'/password',{data:{}});assert.equal((await access.json()).password,created.password);
 const login=await s.call('client/'+token+'/login',{admin:false,data:{password:created.password,remember:false}});assert.equal(login.status,200);
 resetRate(s);
 const prepare=await(await s.invoke({operation:'prepare_delete',id,version:2})).json();assert.ok(prepare.confirmation_token);
 const del={operation:'delete',id,version:2,request_id:rid(3),confirm:true,confirmation_token:prepare.confirmation_token};
 assert.equal((await s.invoke({...del,confirm:false})).status,400);
 assert.equal((await s.invoke({...del,confirmation_token:prepare.confirmation_token.slice(0,-1)+(prepare.confirmation_token.endsWith('0')?'1':'0')})).status,409);
 const removed=await s.invoke(del);assert.equal(removed.status,200,await removed.clone().text());assert.equal((await removed.json()).verified,true);
 assert.equal((await s.invoke(del)).status,409);
 assert.equal((await s.invoke({operation:'get_project',id})).status,404);
 assert.equal((await s.call('client/'+token+'/view',{admin:false})).status,403);
 assert.equal(JSON.stringify(s.sqlite.prepare('SELECT * FROM one_time_projects WHERE id=?').get(other.id)),otherBefore);
 assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM one_time_assistant_mutations').get().n,2);
 }finally{s.sqlite.close()}});
test('maintenance: reschedule excludes self, rejects overlaps, protects document and started records',async()=>{const s=fixture();try{
 const x=await(await s.invoke()).json();assert.ok(x.ok);const id=x.id;
 const base={operation:'edit',id,version:1,request_id:rid(4),calendar_reviewed:false,changes:{scheduled_at:'2026-12-15T11:00:00+02:00'},estimated_end_at:'2026-12-15T12:00:00+02:00'};
 s.sqlite.prepare('INSERT INTO appointments VALUES(?,?,?,?,?)').run('r','2026-12-15T08:30:00.000Z','2026-12-15T10:00:00.000Z','confirmed',null);
 assert.equal((await s.invoke(base)).status,409);s.sqlite.exec('DELETE FROM appointments');
 const edit=await s.invoke(base);assert.equal(edit.status,200,await edit.clone().text());
 s.sqlite.prepare('INSERT INTO one_time_project_reports(project_id,enabled) VALUES(?,1)').run(id);
 assert.equal((await s.invoke({operation:'prepare_delete',id,version:2})).status,409);
 assert.equal((await s.invoke({...base,version:2,request_id:rid(5),changes:{description:'Blocked'}})).status,409);
 s.sqlite.prepare('DELETE FROM one_time_project_reports WHERE project_id=?').run(id);
 const prepare=await(await s.invoke({operation:'prepare_delete',id,version:2})).json();
 s.sqlite.prepare('UPDATE one_time_projects SET version=3 WHERE id=?').run(id);
 assert.equal((await s.invoke({operation:'delete',id,version:2,request_id:rid(6),confirm:true,confirmation_token:prepare.confirmation_token})).status,409);
 s.sqlite.prepare("UPDATE one_time_projects SET started_at='2026-11-28T10:00:00Z' WHERE id=?").run(id);
 assert.equal((await s.invoke({operation:'prepare_delete',id,version:3})).status,409);
 assert.ok(s.sqlite.prepare('SELECT id FROM one_time_projects WHERE id=?').get(id));
 }finally{s.sqlite.close()}});
