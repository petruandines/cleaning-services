// Authorized isolated integration test. Never binds the production D1 database.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
const root=resolve(process.env.PDF_BACKEND_ROOT),account='47b9f8498a9865c0fbbaca8f0f5cf59d';
const worker='petru-ines-pdf-staging',bucket='petru-ines-pdf-staging',productionBucket='petru-ines-project-reports';
const gate=randomBytes(32).toString('hex');
console.log('::add-mask::'+gate);
async function cf(path,method='GET',body,eu=false){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json',...(eu?{'cf-r2-jurisdiction':'eu'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const d=await r.json();assert.ok(r.ok&&d.success,'Cloudflare '+method+' '+path+' failed: '+(d.errors||[]).map(e=>e.code+' '+e.message).join('; '));return d.result;
}
for(const name of [productionBucket,bucket]){
 const list=await cf('/r2/buckets','GET',null,true);
 if(!(list.buckets||[]).some(b=>b.name===name))await cf('/r2/buckets','POST',{name,storageClass:'Standard'},true);
 const managed=await cf('/r2/buckets/'+name+'/domains/managed','GET',null,true);
 const custom=await cf('/r2/buckets/'+name+'/domains/custom','GET',null,true);
 assert.equal(managed.enabled,false,'Public r2.dev must remain disabled');assert.equal((custom.domains||[]).length,0,'No public bucket domain');
 console.log('Verified private EU Standard bucket: '+name);
}
const dbName='petru-ines-pdf-staging';
const existing=(await cf('/d1/database')).find(d=>d.name===dbName);
const database=existing||await cf('/d1/database','POST',{name:dbName});
const db=database.uuid;assert.notEqual(db,'6816004b-dc95-48c9-be52-9bd4131d157e');
async function sql(query,params=[]){return cf('/d1/database/'+db+'/query','POST',{sql:query,params});}
for(const name of ['0001_one_time.sql','0002_password_copy.sql','0003_display_options.sql','0004_review_visibility.sql','0005_service_options.sql','0006_reports.sql']){
 await sql(readFileSync(join(root,'one-time-migrations',name),'utf8'));
}
// Gate is an ephemeral secret. The fake admin exists only inside this isolated test Worker.
writeFileSync(join(root,'.pdf-staging-entry.mjs'),`import {handleOneTime} from './src/one-time.mjs';
export default {fetch(request,env){
 if(request.headers.get('x-test-gate')!==env.TEST_GATE)return new Response(null,{status:404});
 const auth={api:{getSession:async({headers})=>headers.get('authorization')==='Bearer admin'?{user:{id:'staging-owner',role:'admin',twoFactorEnabled:true}}:null}};
 return handleOneTime(request,{db:env.DB,auth,passwordSecret:env.TEST_GATE,reportBucket:env.PROJECT_REPORTS,reportsEnabled:true,now:request.headers.get('x-test-now')||new Date().toISOString()});
}};`);
const config=join(root,'.pdf-staging.json');
writeFileSync(config,JSON.stringify({name:worker,main:'.pdf-staging-entry.mjs',compatibility_date:'2026-09-24',compatibility_flags:['nodejs_compat'],workers_dev:true,preview_urls:false,d1_databases:[{binding:'DB',database_name:dbName,database_id:db}],r2_buckets:[{binding:'PROJECT_REPORTS',bucket_name:bucket,jurisdiction:'eu'}]}));
const secrets=join(root,'.pdf-staging-secrets.json');writeFileSync(secrets,JSON.stringify({TEST_GATE:gate}),{mode:0o600});
const cli=join(root,'node_modules/wrangler/bin/wrangler.js');
execFileSync(process.execPath,[cli,'deploy','--config',config,'--secrets-file',secrets],{cwd:root,stdio:'inherit'});
const subdomain=(await cf('/workers/subdomain')).subdomain;
const api='https://'+worker+'.'+subdomain+'.workers.dev',origin='https://petruandines.com';
const {assemblePDF}=await import(join(root,'src/reports/pdf.mjs'));
const resources=JSON.parse(readFileSync(join(root,'src/reports/resources.json'),'utf8'));
// Wait only on read-only readiness; never retry creation POSTs after an unknown response.
let available=false;for(let attempt=0;attempt<30;attempt++){
 const check=await fetch(api+'/api/one-time/admin',{headers:{origin,'x-test-gate':gate,authorization:'Bearer admin'}});
 if(check.status===200){available=true;break;}
 await new Promise(r=>setTimeout(r,2000));
}
assert.ok(available,'Isolated Worker route did not become ready');
const ids=[];
let tail;
const tailFile=join(root,'.pdf-staging-tail.jsonl');
try{
 const stream=(await import('node:fs')).createWriteStream(tailFile);
 tail=spawn(process.execPath,[cli,'tail',worker,'--config',config,'--format','json'],{cwd:root,stdio:['ignore','pipe','pipe']});tail.stdout.pipe(stream);tail.stderr.on('data',()=>{});
 await new Promise(r=>setTimeout(r,5000));
 async function call(path,{data,pdf,ticket,cookie,admin=true,now}={}){
  return fetch(api+'/api/one-time/'+path+(ticket?'?ticket='+ticket:''),{method:data||pdf?'POST':'GET',headers:{origin,'x-test-gate':gate,...(admin?{authorization:'Bearer admin'}:{}),...(cookie?{cookie}:{}),...(now?{'x-test-now':now}:{}),...(data?{'content-type':'application/json'}:pdf?{'content-type':'application/pdf'}:{})},...(data?{body:JSON.stringify(data)}:pdf?{body:pdf}:{}),signal:AbortSignal.timeout(60000)});
 }
 async function json(path,options,status=200){const r=await call(path,options);assert.equal(r.status,status,await r.clone().text());return r.json();}
 async function create(count=2,hourly=false){
  const p=await json('admin',{data:{name:'Test PDF fictiv',client_name:'Client fictiv',phone:'000',email:'',location:'Adresă fictivă',show_location:true,scheduled_at:new Date().toISOString(),price_bani:hourly?10000:49900,description:'Verificare Ș ț ă î â',invoice_url:'',expiry_days:7,status:'scheduled',service_options:{billing_mode:hourly?'hourly':'fixed'},tasks:Array.from({length:count},(_,i)=>({title:'Activitate '+i+': Ștergere și igienizare. '+(count>100?'Verificare '.repeat(12):''),done:i%2===0}))}},201);
  ids.push(p.id);return p;
 }
 async function generate(p){const prepared=await json('admin/'+p.id+'/report',{data:{operation:'prepare'}});const pdf=assemblePDF(prepared.recipe,resources);const result=await json('admin/'+p.id+'/report',{pdf,ticket:prepared.ticket});assert.equal(result.status,'ready');assert.equal(result.size_bytes,pdf.length);return {prepared,pdf};}
 const plain=await create();assert.equal((await json('admin/'+plain.id+'/complete',{data:{confirm:true}})).report.status,'none');
 const p=await create();await json('admin/'+p.id+'/report',{data:{operation:'preference',enabled:true}});const completed=await json('admin/'+p.id+'/complete',{data:{confirm:true}});assert.equal(completed.report.status,'pending');
 const {prepared,pdf}=await generate(p);await json('admin/'+p.id+'/report',{pdf,ticket:prepared.ticket});
 const forged=pdf.slice();forged[20]^=1;assert.equal((await call('admin/'+p.id+'/report',{pdf:forged,ticket:prepared.ticket})).status,200,'Idempotent ready ticket does not replace document');
 const access=await json('admin/'+p.id+'/access',{data:{operation:'generate',password:'fictitious-password-123'}});
 const login=await call('client/'+access.access.token+'/login',{admin:false,data:{password:'fictitious-password-123',remember:true}});assert.equal(login.status,200,await login.clone().text());const cookie=login.headers.get('set-cookie').split(';')[0];
 const download=()=>call('client/'+access.access.token+'/report',{admin:false,cookie});
 let r=await download();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),pdf);
 await json('admin/'+p.id+'/report',{data:{operation:'delete',confirm:true}});assert.equal((await download()).status,404);
 const regenerated=await generate(p);assert.equal(regenerated.prepared.snapshot.report_version,2);
 assert.equal((await json('admin/'+p.id)).completed_at,completed.completed_at);
 await json('admin/'+p.id+'/access',{data:{operation:'revoke'}});assert.equal((await download()).status,403);
 assert.equal((await call('admin/'+p.id+'/report-download',{admin:false})).status,401);
 const other=await create();const otherAccess=await json('admin/'+other.id+'/access',{data:{operation:'generate',password:'fictitious-password-123'}});assert.equal((await call('client/'+otherAccess.access.token+'/report',{admin:false,cookie})).status,401);
 for(const count of [45,500]){
  const long=await create(count,true);await json('admin/'+long.id+'/start',{data:{}});await json('admin/'+long.id+'/report',{data:{operation:'preference',enabled:true}});await json('admin/'+long.id+'/complete',{data:{confirm:true}});const a=await generate(long);assert.ok(a.prepared.recipe.pages.length>1);assert.equal(a.prepared.snapshot.billing.mode,'hourly');console.log('Passed real Cloudflare '+count+'-task hourly report, '+a.pdf.length+' bytes, '+a.prepared.recipe.pages.length+' pages');
 }
 console.log('REAL_CLOUDFLARE_REPORT_FLOW_PASSED: opt-out, opt-in, save/retry, client download, delete, regenerate, history, revoke, IDOR, long hourly reports');
 await new Promise(r=>setTimeout(r,3000));
}finally{
 if(tail)tail.kill('SIGINT');
 // The named database and Worker belong exclusively to this isolated staging workflow.
 for(const id of ids){
  try{await fetch(api+'/api/one-time/admin/'+id+'/report',{method:'POST',headers:{origin,'x-test-gate':gate,authorization:'Bearer admin','content-type':'application/json'},body:JSON.stringify({operation:'delete',confirm:true})});}catch{}
 }
 await cf('/workers/scripts/'+worker,'DELETE');
 await cf('/d1/database/'+db,'DELETE');
 const trace=readFileSync(tailFile,'utf8');const cpu=[...trace.matchAll(/\"cpuTime\"\\s*:\\s*([0-9.]+)/g)].map(m=>Number(m[1]));console.log(JSON.stringify({cpuMeasurements:cpu.length,maxCPUms:cpu.length?Math.max(...cpu):null}));
 console.log('Removed isolated staging Worker and test D1; production data untouched.');
}
