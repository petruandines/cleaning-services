import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const ACCOUNT='47b9f8498a9865c0fbbaca8f0f5cf59d';
const UUID='6816004b-dc95-48c9-be52-9bd4131d157e';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
assert.equal(config.name,'petru-ines-portal-api');assert.equal(config.d1_databases[0].database_id,UUID);
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
const sql=['0001_one_time.sql','0002_password_copy.sql'].map(file=>readFileSync(new URL('../one-time-migrations/'+file,import.meta.url),'utf8')).join('\n');
const statements=sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
assert.equal(statements.length,10);
for(const statement of statements)assert.match(statement,/^CREATE (?:TABLE|INDEX) IF NOT EXISTS (?:one_time_|otp_)/);
const model=new DatabaseSync(':memory:');model.exec(sql);
const expected=model.prepare("SELECT name,type,sql FROM sqlite_master WHERE name LIKE 'one_time_%' OR name LIKE 'otp_%' ORDER BY name").all();model.close();
async function cf(path,method='GET',data){
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();assert.ok(response.ok&&result.success,`Cloudflare ${path}: HTTP ${response.status}; ${(result.errors||[]).map(e=>e.message).join('; ')}`);return result.result;
}
async function query(sql){const result=await cf(`/accounts/${ACCOUNT}/d1/database/${UUID}/query`,'POST',{sql});assert.ok(result.every(r=>r.success));return result.flatMap(r=>r.results||[]);}
const metadata=await cf(`/accounts/${ACCOUNT}/d1/database/${UUID}`);assert.equal(metadata.uuid,UUID);assert.equal(metadata.name,'petru-ines-portal-eu');
const before=await query("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE '%one_time_%' AND name NOT LIKE 'otp_%' ORDER BY name");
assert.ok(before.some(t=>t.name==='clients'));assert.ok(before.some(t=>t.name==='payment_locations'));
const existing=await query("SELECT name,type,sql FROM sqlite_master WHERE name LIKE 'one_time_%' OR name LIKE 'otp_%' ORDER BY name");
const normalize=value=>value.replace(/IF NOT EXISTS /g,'').replace(/\s+/g,' ').trim();
for(const entry of existing){const match=expected.find(x=>x.name===entry.name);assert.ok(match,'Unexpected one-time schema');assert.equal(normalize(entry.sql),normalize(match.sql),'Existing one-time table definition differs');}
await query(sql);
const after=await query("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE '%one_time_%' AND name NOT LIKE 'otp_%' ORDER BY name");
assert.deepEqual(after,before,'Existing application/auth schema changed');
const actual=await query("SELECT name,type,sql FROM sqlite_master WHERE name LIKE 'one_time_%' OR name LIKE 'otp_%' ORDER BY name");
assert.equal(actual.length,expected.length);for(const entry of actual)assert.equal(normalize(entry.sql),normalize(expected.find(x=>x.name===entry.name).sql));
console.log('Verified seven additive one-time tables and three indexes. Existing schema preserved. No existing rows were updated or deleted.');
