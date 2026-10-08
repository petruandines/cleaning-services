import {billingView,readService} from './one-time-service.mjs';
import {readDisplay,SUPPLIER} from './one-time-display.mjs';
import {createRecipe,assemblePDF,pdfDigest,prepareResources} from './reports/pdf.mjs';
import resources from './reports/resources.json' with {type:'json'};
prepareResources(resources); // Immutable assets decoded during Worker startup.
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=async(db,sql,...args)=>(await q(db,sql,...args).all()).results[0];
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export class ReportFault extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new ReportFault(status,message);};
export const reportsConfigured=c=>c.reportsEnabled===true&&!!c.reportBucket;
async function saved(db,id){return first(db,'SELECT * FROM one_time_project_reports WHERE project_id=?',id);}
const event=(db,id,type,actor,now)=>q(db,'INSERT INTO one_time_project_activity(id,project_id,type,actor,detail,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),id,type,actor,'',now);
function meta(r,c){return {configured:reportsConfigured(c),enabled:!!r?.enabled,status:r?.status||'none',version:r?.document_version||0,generated_at:r?.generated_at||null,size_bytes:r?.status==='ready'?r.size_bytes:null,deleted_at:r?.deleted_at||null,error:r?.last_error||null};}
export async function reportMeta(db,id,c){if(!reportsConfigured(c))return meta(null,c);try{return meta(await saved(db,id),c);}catch{return {...meta(null,c),configured:false};}}
export async function reportAvailable(db,p,c){if(!reportsConfigured(c)||!p.completed_at||!['completed','closed'].includes(p.status))return false;try{return (await saved(db,p.id))?.status==='ready';}catch{return false;}}
export async function completionReportSnapshot(db,p,c){
 if(!reportsConfigured(c))return null;
 try{const r=await saved(db,p.id);return r?.enabled?await snapshot(db,p):null;}catch{return null;}
}
async function snapshot(db,p){
 const service=await readService(db,p.id),display=await readDisplay(db,p.id);
 const tasks=(await q(db,'SELECT title,position,done FROM one_time_project_tasks WHERE project_id=? ORDER BY position,id',p.id).all()).results;
 return {id:p.id,name:p.name,client_name:p.client_name,location:p.show_location?p.location:'',scheduled_at:p.scheduled_at,completed_at:p.completed_at,started_at:p.started_at,
 duration_ms:p.started_at?Math.max(0,Date.parse(p.completed_at)-Date.parse(p.started_at)):null,price_bani:p.price_bani,description:p.description,
 billing:billingView(p,service,p.completed_at),tasks,invoice_url:display.invoice_enabled?p.invoice_url:'',supplier:{name:SUPPLIER.name,cui:SUPPLIER.cui,registration:SUPPLIER.registration},source_version:p.version};
}
// Capture only whitelisted client-facing data. A reporting failure never rolls
// back completion; the admin can retry from the preserved project history.
export async function captureCompletion(db,p,actor,now,c,completedSnapshot){
 if(!reportsConfigured(c))return;
 try {const r=await saved(db,p.id);if(!r?.enabled)return;const data=completedSnapshot||await snapshot(db,p);
  await q(db,"UPDATE one_time_project_reports SET completed_snapshot_json=COALESCE(completed_snapshot_json,?),status=CASE WHEN status='none' THEN 'pending' ELSE status END WHERE project_id=?",JSON.stringify(data),p.id).run();
 }catch{console.error('one_time_report_capture_failed');}
}
const cas=(db,r,sets,args=[])=>q(db,`UPDATE one_time_project_reports SET ${sets},revision=CASE WHEN revision=? THEN revision+1 ELSE -1 END WHERE project_id=?`,...args,r.revision,r.project_id);
async function atomic(db,statements){try{return await db.batch(statements);}catch(e){if(/CHECK constraint/.test(e.message))fail(409,'report_changed_reload');throw e;}}
async function remove(db,p,r,actor,now,c){
 if(r.status==='saving')fail(409,'report_save_in_progress');
 if(r.status==='deleted'&&!r.storage_key){
  const old=(await q(db,'SELECT storage_key FROM one_time_project_report_files WHERE project_id=? AND delete_requested=1 ORDER BY created_at DESC LIMIT 20',p.id).all()).results;
  try{for(const file of old)await c.reportBucket.delete(file.storage_key);}catch{fail(503,'report_storage_unavailable');}
  return meta(r,c);
 }
 if(r.status!=='deleting')await atomic(db,[cas(db,r,"status='deleting',last_error=NULL"),q(db,'UPDATE one_time_project_report_files SET delete_requested=1 WHERE project_id=?',p.id)]);
 try{if(r.storage_key)await c.reportBucket.delete(r.storage_key);}catch{await q(db,"UPDATE one_time_project_reports SET last_error='storage_unavailable' WHERE project_id=? AND status='deleting'",p.id).run();fail(503,'report_storage_unavailable');}
 const latest=await saved(db,p.id);
 if(latest?.status==='deleted')return meta(latest,c);
 if(latest?.status!=='deleting'||latest.ticket!==r.ticket)fail(409,'report_changed_reload');
 await atomic(db,[cas(db,latest,"status='deleted',storage_key=NULL,ticket=NULL,snapshot_json=NULL,recipe_json=NULL,completed_snapshot_json=NULL,sha256=NULL,size_bytes=NULL,deleted_at=?,last_error=NULL",[now]),event(db,p.id,'report_deleted',actor,now)]);
 return meta(await saved(db,p.id),c);
}
export async function reportDownload(db,p,c){
 if(!reportsConfigured(c)||!p.completed_at||!['completed','closed'].includes(p.status))fail(404,'report_unavailable');
 const r=await saved(db,p.id);if(r?.status!=='ready'||!r.storage_key)fail(404,'report_unavailable');
 let object;try{object=await c.reportBucket.get(r.storage_key);}catch{fail(503,'report_storage_unavailable');}
 if(!object)fail(404,'report_unavailable');
 if(object.size!==r.size_bytes||object.customMetadata?.sha256!==r.sha256)fail(409,'report_storage_mismatch');
 // Close the storage await window against concurrent document deletion.
 const latest=await saved(db,p.id);if(latest?.status!=='ready'||latest.ticket!==r.ticket)fail(404,'report_unavailable');
 return new Response(object.body,{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="raport-interventie-v${r.document_version}.pdf"`,'content-length':String(object.size),'cache-control':'private, no-store, max-age=0','pragma':'no-cache','expires':'0','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer'}});
}
async function readUpload(request){
 if(request.headers.get('content-type')?.split(';')[0]!=='application/pdf')fail(415,'report_pdf_required');
 const max=4*1024*1024;if(Number(request.headers.get('content-length'))>max)fail(413,'report_too_large');
 const reader=request.body?.getReader();if(!reader)fail(400,'report_pdf_required');const parts=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();fail(413,'report_too_large');}parts.push(value);}
 const result=new Uint8Array(length);let at=0;for(const value of parts){result.set(value,at);at+=value.length;}return result;
}
export async function reportAdmin(request,db,p,actor,now,c,body){
 if(request.method==='GET')return json(await reportMeta(db,p.id,c));
 if(request.method!=='POST')fail(405,'method_not_allowed');
 if(!reportsConfigured(c))fail(503,'report_not_configured');
 let r=await saved(db,p.id);
 if(request.headers.get('content-type')?.split(';')[0]==='application/pdf'){
  const ticket=new URL(request.url).searchParams.get('ticket');
  if(!r||!ticket||ticket!==r.ticket||!p.completed_at||!['completed','closed'].includes(p.status))fail(409,'report_changed_reload');
  if(r.status==='ready')return json(meta(r,c)); // Lost success response; no second R2 write.
  if(r.status==='saving')fail(409,'report_save_in_progress');
  if(!['pending','failed'].includes(r.status))fail(409,'report_changed_reload');
  if(!r.recipe_json)fail(409,'report_changed_reload');
  const upload=await readUpload(request);
  // Compute the exact expected document from the server-owned snapshot/template.
  // No parser accepts user-chosen PDF objects, links, scripts or hidden text.
  const expected=assemblePDF(JSON.parse(r.recipe_json),resources);
  if(upload.length!==expected.length||await pdfDigest(upload)!==await pdfDigest(expected))fail(400,'report_content_mismatch');
  const hash=await pdfDigest(expected);
  await atomic(db,[cas(db,r,"status='saving',last_error=NULL")]);
  const claimedRevision=r.revision+1;
  try{
   const stored=await c.reportBucket.put(r.storage_key,upload,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/pdf',cacheControl:'private, no-store'},customMetadata:{sha256:hash}});
   if(stored===null){const existing=await c.reportBucket.head(r.storage_key);if(existing?.size!==upload.length||existing.customMetadata?.sha256!==hash)throw new Error('storage_mismatch');}
  }catch{
   await q(db,"UPDATE one_time_project_reports SET status='failed',last_error='storage_unavailable',revision=revision+1 WHERE project_id=? AND ticket=? AND status='saving' AND revision=?",p.id,ticket,claimedRevision).run();
   fail(503,'report_storage_unavailable');
  }
  // If D1 confirmation fails, the stable key and saving state survive. Recovery
  // verifies the R2 metadata and finishes publication without another upload.
  const latest=await saved(db,p.id);
  if(latest?.ticket===ticket&&latest.status==='ready')return json(meta(latest,c));
  if(latest?.ticket!==ticket||latest.status!=='saving'||latest.revision!==claimedRevision){
   if(latest?.ticket!==ticket){await q(db,'UPDATE one_time_project_report_files SET delete_requested=1 WHERE storage_key=?',r.storage_key).run();try{await c.reportBucket.delete(r.storage_key);}catch{}}
   fail(409,'report_changed_reload');
  }
  await atomic(db,[cas(db,latest,"status='ready',size_bytes=?,sha256=?,snapshot_json=NULL,recipe_json=NULL,completed_snapshot_json=NULL,last_error=NULL",[upload.length,hash]),event(db,p.id,'report_generated',actor,now)]);
  return json(meta(await saved(db,p.id),c));
 }
 const data=await body(request);
 if(data.operation==='preference'){
  if(typeof data.enabled!=='boolean')fail(400,'report_invalid_preference');
  if(!r)await q(db,'INSERT INTO one_time_project_reports(project_id,enabled) VALUES(?,?)',p.id,data.enabled?1:0).run();
  else await atomic(db,[cas(db,r,'enabled=?',[data.enabled?1:0])]);
  await event(db,p.id,'report_preference_changed',actor,now).run();return json(await reportMeta(db,p.id,c));
 }
 if(data.operation==='delete'){
  if(data.confirm!==true)fail(400,'confirmation_required');
  if(r&&data.version!==undefined&&data.version!==r.document_version)fail(409,'report_changed_reload');
  if(!r)return json(meta(null,c));return json(await remove(db,p,r,actor,now,c));
 }
 if(data.operation!=='prepare')fail(400,'report_invalid_operation');
 if(!p.completed_at||!['completed','closed'].includes(p.status))fail(409,'report_completion_required');
 if(r?.status==='deleting')fail(409,'report_delete_pending');
 if(r?.status==='saving'){
  const object=await c.reportBucket.head(r.storage_key);
  if(!object){
   await atomic(db,[cas(db,r,"status='failed',last_error='storage_unavailable'")]);
   r=await saved(db,p.id);
  }else{
  const expected=assemblePDF(JSON.parse(r.recipe_json),resources),hash=await pdfDigest(expected);
  if(object.customMetadata?.sha256!==hash||object.size!==expected.length)fail(409,'report_storage_mismatch');
  await atomic(db,[cas(db,r,"status='ready',size_bytes=?,sha256=?,snapshot_json=NULL,recipe_json=NULL,completed_snapshot_json=NULL,last_error=NULL",[object.size,hash]),event(db,p.id,'report_generated',actor,now)]);
  return json({report:meta(await saved(db,p.id),c),already_ready:true});
  }
 }
 if(r?.status==='ready'){
  if(data.replace!==true||data.confirm!==true)return json({report:meta(r,c),already_ready:true});
  await remove(db,p,r,actor,now,c);r=await saved(db,p.id);
 }
 if(r?.status==='deleted')await remove(db,p,r,actor,now,c);
 if(r?.ticket&&r.snapshot_json&&['pending','failed'].includes(r.status))return json({report:meta(r,c),ticket:r.ticket,snapshot:JSON.parse(r.snapshot_json),recipe:JSON.parse(r.recipe_json)});
 const base=r?.document_version===0&&r.completed_snapshot_json?JSON.parse(r.completed_snapshot_json):await snapshot(db,p);
 const version=(r?.document_version||0)+1,s={...base,report_version:version,generated_at:now},ticket=crypto.randomUUID(),key='one-time-reports/'+crypto.randomUUID()+'.pdf';
 // Validate characters/layout before reserving storage. Strings are never
 // interpolated into PDF syntax; resource and external-link policy are fixed.
 let recipe;try{recipe=createRecipe(s,resources);}catch{fail(422,'report_unsupported_character');}
 const current=await first(db,'SELECT version FROM one_time_projects WHERE id=?',p.id);
 if(current?.version!==p.version)fail(409,'report_changed_reload');
 const track=q(db,'INSERT INTO one_time_project_report_files(storage_key,project_id,ticket,created_at) VALUES(?,?,?,?)',key,p.id,ticket,now);
 if(!r){await atomic(db,[q(db,"INSERT INTO one_time_project_reports(project_id,status,document_version,ticket,storage_key,snapshot_json,recipe_json,generated_at) VALUES(?,'pending',?,?,?,?,?,?)",p.id,version,ticket,key,JSON.stringify(s),JSON.stringify(recipe),now),track]);}
 else await atomic(db,[cas(db,r,"status='pending',document_version=?,ticket=?,storage_key=?,snapshot_json=?,recipe_json=?,generated_at=?,last_error=NULL",[version,ticket,key,JSON.stringify(s),JSON.stringify(recipe),now]),track]);
 await event(db,p.id,'report_prepared',actor,now).run();return json({report:meta(await saved(db,p.id),c),ticket,snapshot:s,recipe});
}
export async function purgeProjectReportMetadata(db,id,c){
 if(!reportsConfigured(c))return;
 const files=(await q(db,'SELECT storage_key FROM one_time_project_report_files WHERE project_id=?',id).all()).results;
 for(const file of files){try{await c.reportBucket.delete(file.storage_key);}catch{fail(503,'report_storage_unavailable');}}
 await db.batch([q(db,'DELETE FROM one_time_project_report_files WHERE project_id=?',id),q(db,'DELETE FROM one_time_project_reports WHERE project_id=?',id)]);
}
