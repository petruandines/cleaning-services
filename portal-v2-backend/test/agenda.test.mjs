import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAgenda} from '../src/agenda.mjs';

function setup(){
 const records=new Map();let version=0;
 const bucket={
  async get(key){const v=records.get(key);return v?{etag:v.etag,text:async()=>v.body}:null;},
  async put(key,body,opts={}){
   const existing=records.get(key),condition=opts.onlyIf||{};
   if(condition.etagMatches&&existing?.etag!==condition.etagMatches)return null;
   if(condition.etagDoesNotMatch==='*'&&existing)return null;
   const etag='e'+(++version);records.set(key,{body,etag});return {etag,key};
  },
 };
 let role='admin',twoFactorEnabled=true;
 const auth={api:{getSession:async()=>({user:{id:'staff-test',role,twoFactorEnabled}})}};
 const call=(method='GET',path='/api/agenda/blocks',data,origin='https://petruandines.com')=>
  handleAgenda(new Request('https://api.petruandines.com'+path,{method,headers:{origin,authorization:'Bearer admin',...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}),{auth,bucket});
 return {bucket,records,call,setRole:r=>role=r,set2FA:v=>twoFactorEnabled=v};
}
const block={title:'Indisponibil',start:'2026-10-21T12:00',end:'2026-10-21T16:00',all_day:false,repeat:'weekly',repeat_until:'2027-01-31',exceptions:{}};

test('client and unverified admin cannot list or mutate private agenda blocks',async()=>{
 const s=setup();s.setRole('user');assert.equal((await s.call()).status,403);
 assert.equal((await s.call('POST',undefined,block)).status,403);
 s.setRole('admin');s.set2FA(false);assert.equal((await s.call()).status,403);
 s.set2FA(true);assert.equal((await s.call()).status,200);
 assert.equal((await s.call('POST',undefined,block,'https://evil.example')).status,403);
});
test('isolated R2 catalogue supports create, list, optimistic edit, exception and delete',async()=>{
 const s=setup();
 let r=await s.call('POST',undefined,block);assert.equal(r.status,201,await r.clone().text());
 const created=await r.json();assert.equal(created.title,block.title);
 let rows=await (await s.call()).json();assert.equal(rows.rows.length,1);
 const updated={...block,version:created.version,exceptions:{'2026-10-28':null}};
 r=await s.call('PATCH','/api/agenda/blocks/'+created.id,updated);
 assert.equal(r.status,200,await r.clone().text());const newValue=await r.json();
 assert.deepEqual(newValue.exceptions,{'2026-10-28':null});
 assert.equal((await s.call('PATCH','/api/agenda/blocks/'+created.id,updated)).status,409,'stale edits must fail');
 assert.equal((await s.call('DELETE','/api/agenda/blocks/'+created.id,{version:created.version})).status,409);
 assert.equal((await s.call('DELETE','/api/agenda/blocks/'+created.id,{version:newValue.version})).status,200);
 rows=await (await s.call()).json();assert.equal(rows.rows.length,0);
 assert.deepEqual([...s.records.keys()],['agenda-blocks/v1/index.json'],'must not touch PDF objects or D1');
});
test('invalid intervals and payload fields are rejected before storage',async()=>{
 const s=setup();
 assert.equal((await s.call('POST',undefined,{...block,end:'2026-10-21T11:00'})).status,400);
 assert.equal((await s.call('POST',undefined,{...block,role:'admin'})).status,400);
 assert.equal((await s.call('POST',undefined,{...block,repeat:'weekly',end:'2026-10-23T16:00'})).status,400);
 assert.equal((await s.call('POST',undefined,{...block,exceptions:{'2026-10-28':{title:'A',start:'2026-10-28T12:00',end:'2026-10-28T10:00',all_day:false}}})).status,400);
});
