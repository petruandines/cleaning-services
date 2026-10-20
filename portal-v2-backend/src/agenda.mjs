import {isPortalOrigin} from './origins.mjs';

const PREFIX='agenda-blocks/v1/';
const ID=/^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const LOCAL=/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
const REPEATS=new Set(['none','daily','weekly','monthly']);
const makeJSON=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
class AgendaError extends Error{constructor(status,code){super(code);this.status=status;}}
const fail=(s,c)=>{throw new AgendaError(s,c);};
const validDate=value=>DATE.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value&&value>='2020-01-01'&&value<='2100-12-31';
const validLocal=value=>LOCAL.test(value)&&validDate(value.slice(0,10));
const allowedKeys=new Set(['title','start','end','all_day','repeat','repeat_until','exceptions','version']);
function validate(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!allowedKeys.has(k)))fail(400,'invalid_fields');
 const {title,start,end,all_day,repeat,repeat_until,exceptions}=data;
 if(typeof title!=='string'||!title.trim()||title.length>100||/[<>\x00-\x08]/.test(title))fail(400,'invalid_title');
 if(!validLocal(start)||!validLocal(end)||start>=end)fail(400,'invalid_interval');
 const days=(Date.parse(end.slice(0,10)+'T12:00Z')-Date.parse(start.slice(0,10)+'T12:00Z'))/86400000;
 if(days>31)fail(400,'interval_too_long');
 if(typeof all_day!=='boolean'||!REPEATS.has(repeat))fail(400,'invalid_options');
 if(all_day&&(!start.endsWith('T00:00')||!end.endsWith('T23:59')))fail(400,'invalid_all_day');
 if(repeat!=='none'&&start.slice(0,10)!==end.slice(0,10))fail(400,'recurrence_requires_one_day');
 if(repeat_until!==null&&repeat_until!==undefined&&(!validDate(repeat_until)||repeat_until<start.slice(0,10)||repeat_until>'2100-12-31'))fail(400,'invalid_repeat_until');
 if(repeat==='none'&&repeat_until)fail(400,'non_recurring_until');
 if(exceptions!==undefined&&(!exceptions||typeof exceptions!=='object'||Array.isArray(exceptions)||Object.keys(exceptions).length>200))fail(400,'invalid_exceptions');
 const cleaned={};
 for(const [date,override] of Object.entries(exceptions||{})){
  if(!validDate(date)||date<start.slice(0,10)||repeat_until&&date>repeat_until)fail(400,'invalid_exception_date');
  if(override===null){cleaned[date]=null;continue;}
  if(!override||typeof override!=='object'||Array.isArray(override)||Object.keys(override).some(k=>!['title','start','end','all_day'].includes(k)))fail(400,'invalid_override');
  if(typeof override.title!=='string'||!override.title.trim()||override.title.length>100||!validLocal(override.start)||!validLocal(override.end)||override.start>=override.end||
     override.start.slice(0,10)!==date||override.end.slice(0,10)!==date||typeof override.all_day!=='boolean')fail(400,'invalid_override');
  if(override.all_day&&(!override.start.endsWith('T00:00')||!override.end.endsWith('T23:59')))fail(400,'invalid_override');
  cleaned[date]={title:override.title.trim(),start:override.start,end:override.end,all_day:override.all_day};
 }
 return {title:title.trim(),start,end,all_day,repeat,repeat_until:repeat==='none'?null:repeat_until||null,exceptions:cleaned};
}
async function input(request){
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')fail(415,'json_required');
 if(Number(request.headers.get('content-length'))>32768)fail(413,'too_large');
 const txt=await request.text();if(txt.length>32768)fail(413,'too_large');
 let value;try{value=JSON.parse(txt);}catch{fail(400,'invalid_json');}
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'invalid_json');
 return value;
}
async function read(store,id){
 const object=await store.get(PREFIX+id);
 if(!object)return null;
 let data;try{data=JSON.parse(await object.text());}catch{fail(503,'corrupt_block');}
 return {object,data};
}
async function list(store){
 const objects=await store.list({prefix:PREFIX,limit:501});
 if(objects.truncated||objects.objects.length>500)fail(503,'agenda_too_large');
 const result=[];
 for(let i=0;i<objects.objects.length;i+=25){
  const chunk=await Promise.all(objects.objects.slice(i,i+25).map(item=>store.get(item.key)));
  for(const obj of chunk){
   if(!obj)continue;
   let data;try{data=JSON.parse(await obj.text());}catch{fail(503,'corrupt_block');}
   if(data&&!data.deleted&&ID.test(data.id))result.push(data);
  }
 }
 result.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
 return result;
}
async function dispatch(request,{auth,bucket}){
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(origin&&!isPortalOrigin(origin)&&origin!==url.origin)fail(403,'origin_forbidden');
 if(request.method==='OPTIONS')return new Response(null,{status:204});
 const match=/^\/api\/agenda\/blocks(?:\/([0-9a-f-]{36}))?$/.exec(url.pathname);
 if(!match)fail(404,'not_found');
 if(!['GET','POST','PATCH','DELETE'].includes(request.method))fail(405,'method_not_allowed');
 const session=await auth.api.getSession({headers:request.headers});
 if(!session?.user?.id)fail(401,'unauthorized');
 if(session.user.role!=='admin'||session.user.twoFactorEnabled!==true)fail(403,'admin_required');
 // The existing R2 bucket is private. Only this prefix is accessed; no report data is modified.
 if(!bucket)fail(503,'agenda_storage_unavailable');
 const id=match[1];
 if(request.method==='GET'){
  if(id)fail(405,'method_not_allowed');
  return makeJSON({rows:await list(bucket)});
 }
 if(!origin||(!isPortalOrigin(origin)&&origin!==url.origin))fail(403,'origin_required');
 const value=await input(request);
 if(request.method==='POST'){
  if(id)fail(405,'method_not_allowed');
  const block=validate(value),now=new Date().toISOString();
  const record={...block,id:crypto.randomUUID(),version:crypto.randomUUID(),created_at:now,updated_at:now};
  const saved=await bucket.put(PREFIX+record.id,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});
  if(!saved)fail(503,'write_failed');
  return makeJSON(record,201);
 }
 if(!id||!ID.test(id))fail(404,'not_found');
 const prior=await read(bucket,id);
 if(!prior||prior.data.deleted)fail(404,'not_found');
 if(typeof value.version!=='string'||value.version!==prior.data.version)fail(409,'block_changed_reload');
 if(request.method==='DELETE'){
  if(Object.keys(value).length!==1)fail(400,'invalid_fields');
  // Conditional tombstone keeps optimistic concurrency and avoids a race with another edit.
  const deleted={...prior.data,deleted:true,updated_at:new Date().toISOString(),version:crypto.randomUUID()};
  const result=await bucket.put(PREFIX+id,JSON.stringify(deleted),{onlyIf:{etagMatches:prior.object.etag},httpMetadata:{contentType:'application/json'}});
  if(!result)fail(409,'block_changed_reload');
  return makeJSON({deleted:true});
 }
 if(request.method!=='PATCH')fail(405,'method_not_allowed');
 const block=validate(value),record={...block,id,created_at:prior.data.created_at,updated_at:new Date().toISOString(),version:crypto.randomUUID()};
 const result=await bucket.put(PREFIX+id,JSON.stringify(record),{onlyIf:{etagMatches:prior.object.etag},httpMetadata:{contentType:'application/json'}});
 if(!result)fail(409,'block_changed_reload');
 return makeJSON(record);
}
export async function handleAgenda(request,context){
 let response;
 try{response=await dispatch(request,context);}
 catch(e){response=makeJSON({error:e instanceof AgendaError?e.message:'server_error'},e instanceof AgendaError?e.status:500);if(!(e instanceof AgendaError))console.error('agenda_error');}
 const origin=request.headers.get('origin'),headers=new Headers(response.headers);
 if(origin&&(isPortalOrigin(origin)||origin===new URL(request.url).origin)){
  headers.set('access-control-allow-origin',origin);
  headers.set('access-control-allow-methods','GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('access-control-allow-headers','Authorization, Content-Type');
  headers.set('vary','Origin');
 }
 return new Response(response.body,{status:response.status,headers});
}
