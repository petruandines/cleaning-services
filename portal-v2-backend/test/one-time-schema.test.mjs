import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
test('deployment creates only isolated tables and preserves populated existing schema',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec("CREATE TABLE clients(id TEXT PRIMARY KEY,name TEXT); INSERT INTO clients VALUES('existing','Existing client'); CREATE TABLE payment_locations(id TEXT PRIMARY KEY);");
 sqlite.exec(readFileSync(new URL('../one-time-migrations/0001_one_time.sql',import.meta.url),'utf8'));
 const original=globalThis.fetch;const account=process.env.CLOUDFLARE_ACCOUNT_ID;process.env.CLOUDFLARE_ACCOUNT_ID='47b9f8498a9865c0fbbaca8f0f5cf59d';
 let writes=0;
 globalThis.fetch=async(url,options={})=>{
  if(!url.endsWith('/query'))return Response.json({success:true,result:{uuid:'6816004b-dc95-48c9-be52-9bd4131d157e',name:'petru-ines-portal-eu'}});
  const {sql}=JSON.parse(options.body);let rows=[];
  if(sql.startsWith('SELECT'))rows=sqlite.prepare(sql).all();else{writes++;assert.doesNotMatch(sql,/\b(?:DROP|ALTER|DELETE|UPDATE|INSERT)\b/);sqlite.exec(sql);}
  return Response.json({success:true,result:[{success:true,results:rows}]});
 };
 try{await import('../scripts/one-time-schema.mjs?test=first');assert.equal(writes,1);assert.equal(sqlite.prepare('SELECT name FROM clients').get().name,'Existing client');assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'one_time_%'").get().n,8);
  await import('../scripts/one-time-schema.mjs?test=second');assert.equal(writes,2);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM clients').get().n,1);
 }finally{globalThis.fetch=original;if(account===undefined)delete process.env.CLOUDFLARE_ACCOUNT_ID;else process.env.CLOUDFLARE_ACCOUNT_ID=account;sqlite.close();}
});
