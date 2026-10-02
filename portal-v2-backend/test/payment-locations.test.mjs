import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {assertFiles,assertChoice,assertVersion} from '../scripts/upgrade-payment-locations-phone.mjs';
import {assertChoice as deployChoice} from '../scripts/deploy-payment-locations-worker-phone.mjs';
const uuid='6816004b-dc95-48c9-be52-9bd4131d157e';
const dir=new URL('../../docs/portal-v2/',import.meta.url);
test('payment migration preserves every financial record and backfills archived locations',()=>{
 assertFiles();assertChoice('inspect','','');
 assert.throws(()=>assertChoice('apply',`APPLY PORTAL PAYMENT LOCATIONS ${uuid}`,''),/recovery/);
 assertChoice('apply',`APPLY PORTAL PAYMENT LOCATIONS ${uuid}`,`TIME TRAVEL VERIFIED ${uuid}`);
 assert.throws(()=>deployChoice('deploy',''),/exact confirmation/);
 deployChoice('deploy',`UPDATE PORTAL PAYMENT LOCATIONS ${uuid}`);
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync(dir).filter(f=>/^000[1-8]_.*sql$/.test(f)).sort()){
  db.exec('BEGIN');db.exec(readFileSync(new URL(f,dir),'utf8'));db.exec('COMMIT');
 }
 db.exec(`INSERT INTO clients(id,kind,display_name,created_at,updated_at) VALUES('c','PF','test','n','n');
 INSERT INTO locations(id,client_id,label,address,city,county,created_at,updated_at,deleted_at) VALUES('l','c','L','A','B','IF','n','n','archived');
 INSERT INTO appointments(id,client_id,location_id,starts_at,ends_at,status,created_at,updated_at) VALUES('a','c','l','2026-10-02T10:00:00Z','2026-10-02T11:00:00Z','draft','n','n');
 INSERT INTO jobs(id,client_id,appointment_id,service_name,status,created_at,updated_at) VALUES('j','c','a','clean','planned','n','n'),('j2','c',NULL,'other','planned','n','n');
 INSERT INTO payments(id,client_id,job_id,amount_bani,status,created_at,deleted_at) VALUES('p','c','j',12345,'confirmed','n','archived'),('p2','c','j2',500,'pending','n',NULL);`);
 const snapshot=()=>JSON.stringify(['clients','locations','appointments','jobs','payments'].map(t=>db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()));
 const before=snapshot();db.exec(readFileSync(new URL('0009_payment_locations.sql',dir),'utf8'));
 assert.equal(snapshot(),before);
 assert.deepEqual(db.prepare('SELECT * FROM payment_locations').all().map(r=>({...r})),[{payment_id:'p',client_id:'c',location_id:'l'}]);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 const state={tables:db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name).concat('d1_migrations').sort(),
 migrations:readdirSync(dir).filter(f=>/^000[1-9]_.*sql$/.test(f)).sort(),columns:{}};
 for(const t of ['clients','locations','appointments','jobs','payments','messages'])state.columns[t]=db.prepare(`PRAGMA table_info(${t})`).all().map(r=>r.name);
 assertVersion(state,true);assert.throws(()=>assertVersion(state,false),/migration/);
 db.close();
});
