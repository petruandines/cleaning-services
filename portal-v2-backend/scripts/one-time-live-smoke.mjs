// Live HTTP smoke with disposable fixtures ONLY in the isolated one-time tables.
// Does not create users, touch recurrent clients or change authentication configuration.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
const API='https://api.petruandines.com',ORIGIN='https://petruandines.com';
const ACCOUNT='47b9f8498a9865c0fbbaca8f0f5cf59d',DB='6816004b-dc95-48c9-be52-9bd4131d157e';
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
const id='smoke-'+randomUUID(),token=randomBytes(32).toString('hex'),secret=randomBytes(24).toString('hex');
async function query(sql,params=[]){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`,{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});const data=await r.json();assert.ok(r.ok&&data.success&&data.result.every(x=>x.success),'Isolated smoke D1 query failed');return data.result.flatMap(x=>x.results||[]);}
async function call(action,data,cookie){return fetch(`${API}/api/one-time/client/${token}/${action}`,{method:data?'POST':'GET',headers:{Origin:ORIGIN,...(data?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});}
let created=false;
try{
 const denied=await fetch(API+'/api/one-time/admin',{headers:{Origin:ORIGIN},signal:AbortSignal.timeout(20000)});assert.equal(denied.status,401,'Admin endpoint must require the existing admin session');
 for(const path of ['/politica-acces-deplasare/','/conditii-prestare-servicii/']){
  const document=await fetch(ORIGIN+path,{signal:AbortSignal.timeout(20000)});assert.equal(document.status,200,'Client information document must be reachable');
 }
 const now=new Date().toISOString();
 await query(`INSERT INTO one_time_projects(id,name,client_name,phone,location,scheduled_at,price_bani,status,created_at,updated_at,expiry_days)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[id,'Verificare automată · Petru & Inés','Date fictive','000','Locație fictivă',now,100,'scheduled',now,now,7]);created=true;
 await query('INSERT INTO one_time_project_tasks(id,project_id,title,position) VALUES(?,?,?,0)',[id+'-task',id,'Sarcină test']);
 await query('INSERT INTO one_time_project_access(project_id,token,password_hash,created_at) VALUES(?,?,?,?)',[id,token,await hashPassword(secret),now]);
 await query('INSERT INTO one_time_project_display_options(project_id,show_review) VALUES(?,1)',[id]);
 let r=await call('view');assert.equal(r.status,401);
 r=await call('login',{password:secret,remember:true});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);assert.equal(r.headers.get('access-control-allow-credentials'),'true');
 const header=r.headers.get('set-cookie');assert.match(header,/Secure; HttpOnly; SameSite=Lax; Max-Age=/);const cookie=header.split(';')[0];
 r=await call('view',null,cookie);assert.equal(r.status,200);let view=await r.json();assert.equal(view.name,'Verificare automată · Petru & Inés');assert.equal(view.review_url,null);assert.equal(view.tasks.length,1);assert.equal('client_name' in view,false);assert.equal('access' in view,false);
 assert.equal((await call('view',null,cookie)).status,200,'Persistent cookie reusable');
 await query("UPDATE one_time_projects SET status='in_progress',started_at=?,updated_at=? WHERE id=?",[now,now,id]);
 await query('UPDATE one_time_project_tasks SET done=1,completed_at=? WHERE project_id=?',[now,id]);
 view=await(await call('view',null,cookie)).json();assert.equal(view.status,'in_progress');assert.equal(view.tasks[0].done,1);
 const expires=new Date(Date.now()+7*86400000).toISOString();
 await query("UPDATE one_time_projects SET status='completed',completed_at=?,invoice_url='https://example.com/invoice.pdf' WHERE id=?",[now,id]);
 await query('UPDATE one_time_project_access SET expires_at=? WHERE project_id=?',[expires,id]);
 view=await(await call('view',null,cookie)).json();assert.equal(view.review_url,'https://g.page/r/CYhmtVqu_TcCEBE/review');assert.equal(view.invoice_url,'https://example.com/invoice.pdf');
 await query('UPDATE one_time_project_display_options SET invoice_enabled=0,invoice_label=?,show_access_policy=1,show_terms=1,show_supplier=1,show_review=0 WHERE project_id=?',['Document test',id]);
 view=await(await call('view',null,cookie)).json();assert.equal(view.invoice_url,'');assert.equal(view.review_url,null);assert.equal(view.access_policy.url,ORIGIN+'/politica-acces-deplasare/');assert.equal(view.service_terms.url,ORIGIN+'/conditii-prestare-servicii/');assert.equal(view.supplier.cui,'52403391');
 await query('UPDATE one_time_project_display_options SET invoice_enabled=1,show_access_policy=0,show_terms=0,show_supplier=0 WHERE project_id=?',[id]);
 view=await(await call('view',null,cookie)).json();assert.equal(view.invoice_url,'https://example.com/invoice.pdf');assert.equal(view.invoice_label,'Document test');assert.equal(view.access_policy,null);assert.equal(view.service_terms,null);assert.equal(view.supplier,null);
 await query('UPDATE one_time_project_access SET active=0,generation=generation+1 WHERE project_id=?',[id]);assert.equal((await call('view',null,cookie)).status,403);
 await query('UPDATE one_time_project_access SET active=1 WHERE project_id=?',[id]);assert.equal((await call('view',null,cookie)).status,401,'Reactivation does not revive old sessions');
 r=await call('login',{password:secret,remember:true});assert.equal(r.status,200);const nextCookie=r.headers.get('set-cookie').split(';')[0];
 assert.equal((await call('logout',{},nextCookie)).status,200);assert.equal((await call('view',null,nextCookie)).status,401);
 await query('UPDATE one_time_project_access SET expires_at=? WHERE project_id=?',[new Date(Date.now()-1000).toISOString(),id]);r=await call('view',null,cookie);assert.equal(r.status,410);assert.deepEqual(await r.json(),{error:'access_expired'});
 console.log('Live one-time HTTP smoke passed: password login, secure persistent cookie, scoped payload, progress, finalization and opt-in review, invoice visibility/custom label, optional legal/provider cards, revoke/reactivate, logout, expiry. Admin auth gate remains closed to anonymous requests.');
}finally{
 if(created)for(const table of ['one_time_project_display_options','one_time_project_passwords','one_time_project_sessions','one_time_project_activity','one_time_project_tasks','one_time_project_access','one_time_projects'])await query(`DELETE FROM ${table} WHERE ${table==='one_time_projects'?'id':'project_id'}=?`,[id]);
 console.log('Only disposable one-time smoke fixtures removed. Existing customers/users/data were not touched.');
}
