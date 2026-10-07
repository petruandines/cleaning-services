import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './one-time-harness.mjs';
test('hourly pricing, written minimum exception, travel, immutable final amount and existing fixed pricing',async()=>{
 const s=setup();try{
 let p=await s.create(),other=await s.create('Fixed');assert.equal(other.billing.mode,'fixed');assert.equal(other.billing.total_bani,49900);
 async function patch(data,status=200){const r=await s.call('admin/'+p.id,{method:'PATCH',data:{version:p.version,...data}});assert.equal(r.status,status,await r.clone().text());if(status===200)p=await r.json();}
 await patch({price_bani:10000,service_options:{billing_mode:'hourly'}});assert.equal(p.billing.total_bani,null);
 await patch({service_options:{minimum_bani:0}},400);
 await patch({service_options:{en_route:true}});assert.equal(p.service_options.departed_at,'2026-10-15T10:00:00.000Z');
 const access=await s.generate(p.id),{cookie}=await s.login(access.access.token);
 const view=async()=>{const r=await s.call('client/'+access.access.token+'/view',{admin:false,cookie});assert.equal(r.status,200);return r.json();};
 assert.equal((await view()).en_route,true);
 assert.equal((await s.call('admin/'+p.id+'/complete',{data:{confirm:true}})).status,409);
 p=await(await s.call('admin/'+p.id+'/start',{data:{}})).json();assert.equal(p.service_options.en_route,0);
 s.setNow('2026-10-15T10:30:00.000Z');let data=await view();assert.equal(data.billing.total_bani,10000);assert.equal(data.billing.elapsed_ms,1800000);assert.equal(data.en_route,false);
 await patch({price_bani:20000},409);await patch({service_options:{minimum_bani:0,minimum_agreement:'Acord email'}},409);await patch({service_options:{en_route:true}},400);
 s.setNow('2026-10-15T11:30:00.000Z');assert.equal((await view()).billing.total_bani,15000);
 p=await(await s.call('admin/'+p.id+'/complete',{data:{confirm:true}})).json();assert.equal(p.billing.total_bani,15000);assert.equal(p.billing.running,false);
 s.setNow('2026-10-15T14:30:00.000Z');await patch({description:'Updated'});assert.equal((await view()).billing.total_bani,15000);
 p=await s.create('Written exception');await patch({price_bani:10000,service_options:{billing_mode:'hourly',minimum_bani:0,minimum_agreement:'Acord scris email 15 octombrie'}});
 p=await(await s.call('admin/'+p.id+'/start',{data:{}})).json();s.setNow('2026-10-15T15:00:00.000Z');p=await(await s.call('admin/'+p.id)).json();assert.equal(p.billing.total_bani,5000);
 await patch({status:'cancelled'});s.setNow('2026-10-15T16:00:00.000Z');await patch({description:'Cancelled details'});assert.equal(p.billing.total_bani,5000);
 assert.equal((await s.call('admin/'+p.id,{authorization:'Bearer recurrent',method:'PATCH',data:{version:p.version,service_options:{en_route:true}}})).status,403);
 assert.equal((await s.call('admin/'+other.id)).status,200);const unchanged=await(await s.call('admin/'+other.id)).json();assert.equal(unchanged.billing.mode,'fixed');assert.equal(unchanged.price_bani,49900);
 }finally{s.sqlite.close();}
});
