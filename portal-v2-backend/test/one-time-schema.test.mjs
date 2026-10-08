import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
test('deployment creates only isolated tables and preserves populated existing schema',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec("CREATE TABLE clients(id TEXT PRIMARY KEY,name TEXT); INSERT INTO clients VALUES('existing','Existing client'); CREATE TABLE payment_locations(id TEXT PRIMARY KEY);");
 sqlite.exec(readFileSync(new URL('../one-time-migrations/0001_one_time.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../one-time-migrations/0002_password_copy.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../one-time-migrations/0003_display_options.sql',import.meta.url),'utf8'));
 sqlite.exec("INSERT INTO one_time_projects(id,name,client_name,phone,location,scheduled_at,price_bani,created_at,updated_at) VALUES('kept','Kept','Client','000','Location','2026-10-15',100,'2026-10-01','2026-10-01'); INSERT INTO one_time_project_display_options(project_id,invoice_enabled,invoice_label,show_terms) VALUES('kept',0,'Document',1)");
 const original=globalThis.fetch;const account=process.env.CLOUDFLARE_ACCOUNT_ID;process.env.CLOUDFLARE_ACCOUNT_ID='47b9f8498a9865c0fbbaca8f0f5cf59d';
 let writes=0;
 globalThis.fetch=async(url,options={})=>{
  if(!url.endsWith('/query'))return Response.json({success:true,result:{uuid:'6816004b-dc95-48c9-be52-9bd4131d157e',name:'petru-ines-portal-eu'}});
  const {sql}=JSON.parse(options.body);let rows=[];
  if(sql.startsWith('SELECT'))rows=sqlite.prepare(sql).all();else{writes++;if(sql.startsWith('ALTER'))assert.equal(sql,'ALTER TABLE one_time_project_display_options ADD COLUMN show_review INTEGER NOT NULL DEFAULT 0 CHECK(show_review IN (0,1));');else assert.doesNotMatch(sql,/\b(?:DROP|ALTER|DELETE|UPDATE|INSERT)\b/);sqlite.exec(sql);}
  return Response.json({success:true,result:[{success:true,results:rows}]});
 };
 try{await import('../scripts/one-time-schema.mjs?test=first');assert.equal(writes,2);assert.equal(sqlite.prepare('SELECT name FROM clients').get().name,'Existing client');assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'one_time_%'").get().n,11);
  assert.deepEqual({...sqlite.prepare("SELECT invoice_enabled,invoice_label,show_terms,show_review FROM one_time_project_display_options WHERE project_id='kept'").get()},{invoice_enabled:0,invoice_label:'Document',show_terms:1,show_review:0});
  await import('../scripts/one-time-schema.mjs?test=second');assert.equal(writes,3);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM clients').get().n,1);
 }finally{globalThis.fetch=original;if(account===undefined)delete process.env.CLOUDFLARE_ACCOUNT_ID;else process.env.CLOUDFLARE_ACCOUNT_ID=account;sqlite.close();}
});
