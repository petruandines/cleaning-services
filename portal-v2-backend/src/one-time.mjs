import {SERVICE_DEFAULTS,readService,validateService,writeService,billingView} from './one-time-service.mjs';
import {DISPLAY_DEFAULTS,ACCESS_POLICY,SERVICE_TERMS,SUPPLIER,validateDisplay,readDisplay,writeDisplay} from './one-time-display.mjs';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { sealPassword, openPassword } from './one-time-password.mjs';
import { isPortalOrigin } from './origins.mjs';

export const REVIEW_URL = 'https://g.page/r/CYhmtVqu_TcCEBE/review';
export const SESSION_DAYS = 30;
const STATUSES = ['draft','scheduled','confirmed','in_progress','completed','cancelled','closed'];
const TOKEN = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const COOKIE = '__Secure-pi-project';
const day = 86400000;
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2,'0')).join('');
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2,'0')).join('');
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers: {
 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'referrer-policy':'no-referrer',
 'x-content-type-options':'nosniff', ...headers,
}});
class Fault extends Error { constructor(status, code) { super(code); this.status = status; } }
const fail = (status, code) => { throw new Fault(status, code); };
const q = (db, sql, ...args) => db.prepare(sql).bind(...args);
const rows = async (db, sql, ...args) => (await q(db, sql, ...args).all()).results;
const first = async (db, sql, ...args) => (await rows(db, sql, ...args))[0];
const log = (db, id, type, actor, now, detail = '') => q(db,
 'INSERT INTO one_time_project_activity(id,project_id,type,actor,detail,created_at) VALUES(?,?,?,?,?,?)',
 crypto.randomUUID(), id, type, actor, detail, now);
function expiry(p) { return p.completed_at && p.expiry_days !== null ? new Date(Date.parse(p.completed_at) + p.expiry_days * day).toISOString() : null; }
function accessState(a, now) { return !a ? 'not_created' : !a.active ? 'revoked' : a.expires_at && a.expires_at <= now ? 'expired' : 'active'; }
function password(value) { if (typeof value !== 'string' || value.length < 12 || value.length > 128) fail(400, 'password_length_12_128'); return value; }
function safeInvoice(value) {
 if (!value) return '';
 let u; try { u = new URL(value); } catch { fail(400, 'invalid_invoice'); }
 if (u.protocol !== 'https:' || u.username || u.password || u.port ||
     !u.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname) ||
     /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || u.hostname.endsWith('.')) fail(400, 'invalid_invoice');
 return u.href;
}
async function body(request) {
 if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') fail(415, 'json_required');
 if (Number(request.headers.get('content-length')) > 131072) fail(413, 'too_large');
 const reader = request.body?.getReader(); let length = 0, parts = [];
 if (!reader) fail(400, 'invalid_json');
 while (true) { const {done,value} = await reader.read(); if (done) break; length += value.length;
   if (length > 131072) { await reader.cancel(); fail(413,'too_large'); } parts.push(value); }
 const raw = new Uint8Array(length); let offset = 0; for (const p of parts) {raw.set(p,offset); offset += p.length;}
 let data; try {data = JSON.parse(new TextDecoder().decode(raw));} catch {fail(400,'invalid_json');}
 if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400,'invalid_json'); return data;
}
const fields = ['name','client_name','phone','email','location','show_location','scheduled_at','price_bani','description','invoice_url','expiry_days'];
function validate(data) {
 for (const [key, max, required] of [['name',160,true],['client_name',160,true],['phone',40,true],['email',254,false],['location',500,true],['description',4000,false],['invoice_url',2048,false]]) {
   if (typeof data[key] !== 'string' || data[key].length > max || (required && !data[key].trim())) fail(400,'invalid_'+key);
   data[key] = data[key].trim();
 }
 if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) fail(400,'invalid_email');
 if (typeof data.scheduled_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(data.scheduled_at) || !Number.isFinite(Date.parse(data.scheduled_at))) fail(400,'invalid_date');
 data.scheduled_at = new Date(data.scheduled_at).toISOString();
 if (!Number.isSafeInteger(data.price_bani) || data.price_bani < 0 || data.price_bani > 1000000000) fail(400,'invalid_price');
 if (![true,false,0,1].includes(data.show_location)) fail(400,'invalid_location_visibility'); data.show_location = data.show_location ? 1 : 0;
 if (data.expiry_days !== null && (!Number.isInteger(data.expiry_days) || data.expiry_days < 1 || data.expiry_days > 3650)) fail(400,'invalid_expiry');
 data.invoice_url = safeInvoice(data.invoice_url);
}
function checkedDisplay(input,previous){try{return validateDisplay(input,previous);}catch{fail(400,'invalid_display_options');}}
async function project(db,id) { const p = await first(db,'SELECT * FROM one_time_projects WHERE id=?',id); if (!p) fail(404,'not_found'); return p; }
async function tasks(db,id) { return rows(db,'SELECT id,title,position,done,completed_at FROM one_time_project_tasks WHERE project_id=? ORDER BY position,id',id); }
async function publicView(db,p,now) {
 const options=await readDisplay(db,p.id),service=await readService(db,p.id);
 return { name:p.name, status:p.status, scheduled_at:p.scheduled_at, location:p.show_location ? p.location : '',
 price_bani:p.price_bani, billing:billingView(p,service,now),en_route:!!service.en_route,departed_at:service.departed_at,started_at:p.started_at, description:p.description, invoice_url:options.invoice_enabled?p.invoice_url:'', invoice_label:options.invoice_label,
 access_policy:options.show_access_policy?ACCESS_POLICY:null,service_terms:options.show_terms?SERVICE_TERMS:null,supplier:options.show_supplier?SUPPLIER:null,completed_at:p.completed_at,
 updated_at:p.updated_at, tasks:await tasks(db,p.id), review_url:options.show_review && p.completed_at && ['completed','closed'].includes(p.status) ? REVIEW_URL : null };
}
async function expire(db, now) {
 // The conditional insert and marking run atomically, preventing duplicate events.
 await db.batch([
 q(db, `INSERT INTO one_time_project_activity(id,project_id,type,actor,detail,created_at)
 SELECT lower(hex(randomblob(16))),project_id,'access_expired','system','',expires_at FROM one_time_project_access
 WHERE active=1 AND expires_at<=? AND expired_logged_at IS NULL`, now),
 q(db,'UPDATE one_time_project_access SET expired_logged_at=? WHERE active=1 AND expires_at<=? AND expired_logged_at IS NULL',now,now),
 q(db,'DELETE FROM one_time_project_sessions WHERE expires_at<=? OR project_id IN (SELECT project_id FROM one_time_project_access WHERE expires_at<=?)',now,now),
 ]);
}
async function adminView(db,p,now) {
 const a = await first(db,'SELECT token,active,expires_at,last_login_at FROM one_time_project_access WHERE project_id=?',p.id);
 return {...p,service_options:await readService(db,p.id),billing:billingView(p,await readService(db,p.id),now), display_options:await readDisplay(db,p.id),tasks:await tasks(db,p.id), access:a ? {...a,status:accessState(a,now)} : {status:'not_created'}};
}
function cookie(token,value,maxAge) {
 return `${COOKIE}=${value}; Path=/api/one-time/client/${token}/; Secure; HttpOnly; SameSite=Lax${maxAge === null ? '' : '; Max-Age='+maxAge}`;
}
async function rate(db,key,limit,now) {
 const ms = Date.parse(now);
 const r = await rows(db,`INSERT INTO one_time_project_rate_limits(key,hits,resets_at) VALUES(?,1,?)
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN resets_at<=? THEN 1 ELSE hits+1 END,
 resets_at=CASE WHEN resets_at<=? THEN ? ELSE resets_at END RETURNING hits`,key,ms+60000,ms,ms,ms+60000);
 await q(db,'DELETE FROM one_time_project_rate_limits WHERE resets_at<?',ms-60000).run();
 if (r[0].hits > limit) fail(429,'try_again_in_one_minute');
}
async function dispatch(request, {db,auth,passwordSecret,now = new Date().toISOString()}) {
 const u = new URL(request.url), path = u.pathname;
 const origin = request.headers.get('origin');
 if (origin && !isPortalOrigin(origin) && origin !== u.origin) fail(403,'origin_forbidden');
 if (request.method === 'OPTIONS') return new Response(null,{status:204});
 if (!['GET','POST','PATCH'].includes(request.method)) fail(405,'method_not_allowed');
 if (request.method !== 'GET' && (!origin || (!isPortalOrigin(origin) && origin !== u.origin))) fail(403,'origin_required');
 const client = /^\/api\/one-time\/client\/([a-f0-9]{64})\/(view|login|logout)$/.exec(path);
 if (client) {
   const [,token,action] = client;
   if ((action==='view' && request.method!=='GET') || (action!=='view' && request.method!=='POST')) fail(405,'method_not_allowed');
   if (action==='logout') { const raw = request.headers.get('cookie')?.match(/(?:^|;\s*)__Secure-pi-project=([a-f0-9]{64})(?:;|$)/)?.[1];
     if (raw) await q(db,'DELETE FROM one_time_project_sessions WHERE hash=? AND project_id IN (SELECT project_id FROM one_time_project_access WHERE token=?)',await digest(raw),token).run();
     return json({ok:true},200,{'set-cookie':cookie(token,'',0)}); }
   if (action==='login') {
     const ip = request.headers.get('cf-connecting-ip') || 'unknown';
     await rate(db,'ip:'+await digest(ip),10,now); await rate(db,'token:'+token,30,now);
   }
   const a = await first(db,'SELECT * FROM one_time_project_access WHERE token=?',token);
   if (!a || !a.active) fail(403,'access_unavailable');
   if (accessState(a,now)==='expired') { await expire(db,now); fail(410,'access_expired'); }
   if (action==='login') {
     const data = await body(request);
     if (typeof data.password !== 'string' || data.password.length > 128 || !await verifyPassword({password:data.password,hash:a.password_hash})) fail(401,'invalid_password');
     const raw = random(), sessionHash = await digest(raw), until = new Date(Math.min(Date.parse(now)+SESSION_DAYS*day, a.expires_at ? Date.parse(a.expires_at) : Infinity)).toISOString();
     // Recheck generation/activity after the expensive hash so a concurrent revoke cannot issue valid access.
     await db.batch([
       q(db,`INSERT INTO one_time_project_sessions(hash,project_id,generation,created_at,expires_at)
         SELECT ?,project_id,generation,?,? FROM one_time_project_access WHERE project_id=? AND generation=? AND active=1 AND (expires_at IS NULL OR expires_at>?)`,sessionHash,now,until,a.project_id,a.generation,now),
       q(db,'UPDATE one_time_project_access SET last_login_at=? WHERE project_id=? AND EXISTS (SELECT 1 FROM one_time_project_sessions WHERE hash=?)',now,a.project_id,sessionHash),
       q(db,`INSERT INTO one_time_project_activity(id,project_id,type,actor,detail,created_at) SELECT ?,project_id,'client_login','client','',? FROM one_time_project_sessions WHERE hash=?`,crypto.randomUUID(),now,sessionHash),
     ]);
     if (!await first(db,'SELECT hash FROM one_time_project_sessions WHERE hash=?',sessionHash)) fail(403,'access_unavailable');
     return json({ok:true},200,{'set-cookie':cookie(token,raw,data.remember===true ? Math.floor((Date.parse(until)-Date.parse(now))/1000) : null)});
   }
   const raw = request.headers.get('cookie')?.match(/(?:^|;\s*)__Secure-pi-project=([a-f0-9]{64})(?:;|$)/)?.[1];
   if (!raw || !TOKEN.test(raw)) fail(401,'login_required');
   const s = await first(db,`SELECT s.project_id FROM one_time_project_sessions s JOIN one_time_project_access a ON a.project_id=s.project_id
      WHERE s.hash=? AND s.project_id=? AND s.generation=a.generation AND a.active=1 AND a.token=? AND s.expires_at>? AND (a.expires_at IS NULL OR a.expires_at>?)`,await digest(raw),a.project_id,token,now,now);
   if (!s) fail(401,'login_required');
   return json(await publicView(db,await project(db,a.project_id),now));
 }
 const admin = /^\/api\/one-time\/admin(?:\/([\w-]{1,100}))?(?:\/(preview|activity|access|start|complete|delete|password))?$/.exec(path);
 if (!admin) fail(404,'not_found');
 const session = await auth.api.getSession({headers:request.headers});
 if (!session?.user?.id) fail(401,'unauthorized');
 if (session.user.role!=='admin' || session.user.twoFactorEnabled!==true) fail(403,'admin_required');
 const actor=session.user.id, [,id,action] = admin;
 await expire(db,now);
 if (!id) {
   if (request.method==='GET') {
     const offset = Number(u.searchParams.get('offset') || 0);
     if (!Number.isSafeInteger(offset) || offset<0) fail(400,'invalid_offset');
     const list=await rows(db,'SELECT * FROM one_time_projects ORDER BY created_at DESC,id DESC LIMIT 31 OFFSET ?',offset);
     return json({rows:await Promise.all(list.slice(0,30).map(p=>adminView(db,p,now))),nextOffset:list.length>30 ? offset+30 : null});
   }
   if (request.method!=='POST') fail(405,'method_not_allowed');
   const data=await body(request); validate(data);
   if (Object.keys(data).some(k=>!fields.includes(k) && k!=='tasks' && k!=='status' && k!=='display_options' && k!=='service_options')) fail(400,'invalid_field');
   if (!['draft','scheduled','confirmed'].includes(data.status)) fail(400,'invalid_status');
   const display=data.display_options===undefined?{...DISPLAY_DEFAULTS}:checkedDisplay(data.display_options);
   let service;try{service=data.service_options===undefined?{...SERVICE_DEFAULTS}:validateService(data.service_options,SERVICE_DEFAULTS,now);}catch(e){fail(400,e.message);}
   if(service.en_route&&!['scheduled','confirmed'].includes(data.status))fail(400,'travel_requires_scheduled');
   const projectId=crypto.randomUUID();
   const taskList=taskChanges(db,projectId,data.tasks,[],now);
   await db.batch([q(db,`INSERT INTO one_time_projects(id,${fields.join(',')},status,created_at,updated_at) VALUES(${Array(15).fill('?').join(',')})`,projectId,...fields.map(k=>data[k]),data.status,now,now),...taskList,writeService(db,projectId,service),writeDisplay(db,projectId,display),log(db,projectId,'project_created',actor,now)]);
   return json(await adminView(db,await project(db,projectId),now),201);
 }
 const p=await project(db,id);
 if (request.method==='GET') {
   if (action==='preview') return json(await publicView(db,p,now));
   if (action==='activity') {
     const offset=Number(u.searchParams.get('offset')||0); if (!Number.isSafeInteger(offset)||offset<0) fail(400,'invalid_offset');
     const list=await rows(db,'SELECT type,actor,detail,created_at FROM one_time_project_activity WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 101 OFFSET ?',id,offset);
     return json({rows:list.slice(0,100),nextOffset:list.length>100 ? offset+100 : null});
   }
   if (action) fail(405,'method_not_allowed'); return json(await adminView(db,p,now));
 }
 const data=await body(request);
 if (action==='password' && request.method==='POST') {
   const saved=await first(db,`SELECT v.ciphertext,a.password_hash FROM one_time_project_passwords v
     JOIN one_time_project_access a ON a.project_id=v.project_id WHERE v.project_id=?`,id);
   if (!saved) fail(409,'password_copy_requires_reset');
   let value;try {value=await openPassword(saved.ciphertext,passwordSecret,id,saved.password_hash);} catch {fail(503,'password_copy_unavailable');}
   await log(db,id,'password_copied',actor,now).run();
   return json({password:value});
 }
 if (action==='delete' && request.method==='POST') {
   if (data.confirm!==true) fail(400,'confirmation_required');
   if (data.version!==p.version) fail(409,'project_changed_reload');
   // D1 batch is atomic: remove only this project's records and invalidate access.
   await db.batch([
     q(db,'UPDATE one_time_projects SET version=CASE WHEN version=? THEN version+1 ELSE -1 END WHERE id=?',p.version,id),
     q(db,"DELETE FROM one_time_project_rate_limits WHERE key IN (SELECT 'token:'||token FROM one_time_project_access WHERE project_id=?)",id),
     ...['one_time_project_service_options','one_time_project_display_options','one_time_project_passwords','one_time_project_sessions','one_time_project_activity','one_time_project_tasks','one_time_project_access'].map(table=>q(db,`DELETE FROM ${table} WHERE project_id=?`,id)),
     q(db,'DELETE FROM one_time_projects WHERE id=?',id),
   ]);
   return json({ok:true});
 }
 if (action==='access' && request.method==='POST') {
   if (!['generate','reset','revoke','reactivate'].includes(data.operation)) fail(400,'invalid_operation');
   const a=await first(db,'SELECT * FROM one_time_project_access WHERE project_id=?',id);
   if (!a && data.operation!=='generate') fail(409,'access_not_created');
   const statements=[]; let encrypted;
   if (data.operation==='generate') {
     const hashed=await hashPassword(password(data.password)), token=random();
     encrypted=await sealPassword(data.password,passwordSecret,id,hashed);
     statements.push(q(db,`INSERT INTO one_time_project_access(project_id,token,password_hash,created_at,expires_at)
      SELECT id,?,?,?,CASE WHEN completed_at IS NOT NULL AND expiry_days IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ',completed_at,'+'||expiry_days||' days') ELSE NULL END FROM one_time_projects WHERE id=?
      ON CONFLICT(project_id) DO UPDATE SET token=excluded.token,password_hash=excluded.password_hash,active=1,generation=generation+1,expires_at=excluded.expires_at,expired_logged_at=NULL`,token,hashed,now,id));
   } else if (data.operation==='reset') {
     const hashed=await hashPassword(password(data.password));
     encrypted=await sealPassword(data.password,passwordSecret,id,hashed);
     statements.push(q(db,'UPDATE one_time_project_access SET password_hash=?,generation=generation+1 WHERE project_id=?',hashed,id));
   }
   else if (data.operation==='revoke') statements.push(q(db,'UPDATE one_time_project_access SET active=0,generation=generation+1 WHERE project_id=?',id));
   else {
     if (expiry(p) && expiry(p)<=now) fail(409,'change_expiry_before_reactivation');
     statements.push(q(db,'UPDATE one_time_project_access SET active=1,generation=generation+1,expired_logged_at=NULL WHERE project_id=?',id));
   }
   if(encrypted) statements.push(q(db,'INSERT INTO one_time_project_passwords(project_id,ciphertext) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET ciphertext=excluded.ciphertext',id,encrypted));
   await db.batch([...statements,q(db,'DELETE FROM one_time_project_sessions WHERE project_id=?',id),log(db,id,'access_'+data.operation,actor,now)]);
   return json(await adminView(db,await project(db,id),now));
 }
 if (['start','complete'].includes(action) && request.method==='POST') {
   if (['cancelled','closed','completed'].includes(p.status)) fail(409,'invalid_transition');
   if (action==='complete' && data.confirm!==true) fail(400,'confirmation_required');
   if (action==='start' && p.status==='in_progress') return json(await adminView(db,p,now));
   const service=await readService(db,id);if(action==='complete'&&service.billing_mode==='hourly'&&!p.started_at)fail(409,'hourly_start_required');
   const updated={...p,status:action==='start' ? 'in_progress' : 'completed',started_at:action==='start' ? now : p.started_at,completed_at:action==='complete' ? now : null};
   await db.batch([
     q(db,'UPDATE one_time_projects SET status=?,started_at=?,completed_at=?,updated_at=?,version=CASE WHEN version=? THEN version+1 ELSE -1 END WHERE id=?',updated.status,updated.started_at,updated.completed_at,now,p.version,id),
     q(db,'UPDATE one_time_project_access SET expires_at=?,expired_logged_at=NULL WHERE project_id=?',expiry(updated),id),
     writeService(db,id,{...service,en_route:0,stopped_at:null}),
     log(db,id,action==='start' ? 'intervention_started' : 'intervention_completed',actor,now),
   ]); return json(await adminView(db,await project(db,id),now));
 }
 if (action || request.method!=='PATCH') fail(405,'method_not_allowed');
 if (data.version!==p.version) fail(409,'project_changed_reload');
 if (Object.keys(data).some(k=>!fields.includes(k) && !['tasks','status','version','display_options','service_options'].includes(k))) fail(400,'invalid_field');
 const display=data.display_options===undefined?null:checkedDisplay(data.display_options,await readDisplay(db,id));
 const previousService=await readService(db,id);let service=null;if(data.service_options!==undefined){try{service=validateService(data.service_options,previousService,now);}catch(e){fail(400,e.message);}}
 const updated={...p,...data}; validate(updated);
 if(p.started_at||p.completed_at){const next=service||previousService;if(next.billing_mode!==previousService.billing_mode||((next.billing_mode==='hourly'||previousService.billing_mode==='hourly')&&(updated.price_bani!==p.price_bani||next.minimum_bani!==previousService.minimum_bani||next.minimum_agreement!==previousService.minimum_agreement)))fail(409,'billing_locked_after_start');}
 if(updated.status==='cancelled'&&p.status!=='cancelled'){service={...(service||previousService),en_route:0,stopped_at:now};}
 if(p.status==='cancelled'&&updated.status!=='cancelled'&&p.started_at)fail(409,'billing_locked_after_start');
 if(service?.en_route&& !['scheduled','confirmed'].includes(updated.status))fail(400,'travel_requires_scheduled');
 if (!STATUSES.includes(updated.status) || (!p.completed_at && ['completed','closed'].includes(updated.status)) || (p.completed_at && !['completed','closed'].includes(updated.status)) || (updated.status==='in_progress' && p.status!=='in_progress')) fail(400,'use_start_or_complete');
 // Acquire a write lock via version compare. A failed compare rolls back the entire batch.
 const statements=[q(db,`UPDATE one_time_projects SET ${fields.map(k=>k+'=?').join(',')},status=?,updated_at=?,version=CASE WHEN version=? THEN version+1 ELSE -1 END WHERE id=?`,...fields.map(k=>updated[k]),updated.status,now,p.version,id)];
 if (data.tasks!==undefined) statements.push(...taskChanges(db,id,data.tasks,await tasks(db,id),now,actor));
 statements.push(q(db,'UPDATE one_time_project_access SET expires_at=?,expired_logged_at=CASE WHEN expires_at IS ? THEN expired_logged_at ELSE NULL END WHERE project_id=?',expiry(updated),expiry(updated),id));
 if(service){statements.push(writeService(db,id,service),log(db,id,previousService.en_route!==service.en_route?(service.en_route?'travel_started':'travel_cancelled'):'billing_options_changed',actor,now));}
 if(display){statements.push(writeDisplay(db,id,display),log(db,id,'display_options_changed',actor,now));}
 statements.push(log(db,id,'project_edited',actor,now));
 if (p.status!==updated.status) statements.push(log(db,id,'status_changed',actor,now,updated.status));
 if (p.invoice_url!==updated.invoice_url) statements.push(log(db,id,'invoice_changed',actor,now));
 try { await db.batch(statements); } catch (e) { if (/CHECK constraint/.test(e.message)) fail(409,'project_changed_reload'); throw e; }
 return json(await adminView(db,await project(db,id),now));
}
function taskChanges(db,id,input,existing,now,actor) {
 if (!Array.isArray(input) || input.length>500) fail(400,'invalid_tasks');
 const seen=new Set(), statements=[], old=new Map(existing.map(t=>[t.id,t]));
 for (let i=0;i<input.length;i++) {
   const t=input[i];
   if (!t || typeof t.title!=='string' || !t.title.trim() || t.title.length>300 || typeof t.done!=='boolean' || (t.id && (!ID.test(t.id)||!old.has(t.id))) || (t.id && seen.has(t.id))) fail(400,'invalid_task');
   const key=t.id||crypto.randomUUID(), previous=old.get(key); seen.add(key);
   statements.push(q(db,`INSERT INTO one_time_project_tasks(id,project_id,title,position,done,completed_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,position=excluded.position,done=excluded.done,completed_at=excluded.completed_at`,key,id,t.title.trim(),i,t.done?1:0,t.done?(previous?.completed_at||now):null));
   if(actor && (!previous || !!previous.done!==t.done || previous.title!==t.title.trim() || previous.position!==i)) statements.push(log(db,id,!previous?'task_added':!!previous.done!==t.done?(t.done?'task_done':'task_undone'):'task_edited',actor,now,t.title.trim()));
 }
 for (const t of existing) if(!seen.has(t.id)) { statements.push(q(db,'DELETE FROM one_time_project_tasks WHERE id=? AND project_id=?',t.id,id)); if(actor) statements.push(log(db,id,'task_deleted',actor,now,t.title)); }
 return statements;
}
export async function handleOneTime(request,context) {
 let response; try {response=await dispatch(request,context);} catch(e) {const conflict=/CHECK constraint failed: version/.test(e.message); response=json({error:e instanceof Fault ? e.message : conflict ? 'project_changed_reload' : 'server_error'},e instanceof Fault?e.status:conflict?409:500); if(!(e instanceof Fault)) console.error('one_time_error');}
 const headers=new Headers(response.headers), origin=request.headers.get('origin');
 if (origin && (isPortalOrigin(origin)||origin===new URL(request.url).origin)) {
   headers.set('access-control-allow-origin',origin); headers.set('access-control-allow-credentials','true');
   headers.set('access-control-allow-methods','GET, POST, PATCH, OPTIONS'); headers.set('access-control-allow-headers','Authorization, Content-Type'); headers.set('vary','Origin');
 }
 if(response.status===429) headers.set('retry-after','60');
 return new Response(response.body,{status:response.status,headers});
}
