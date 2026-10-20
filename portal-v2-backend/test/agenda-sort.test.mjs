import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './one-time-harness.mjs';

test('global date sorting and status filters occur in SQL before paging, client route unchanged',async()=>{
 const s=setup();
 try{
  const a=await s.create('A'),b=await s.create('B'),c=await s.create('C');
  const change=s.sqlite.prepare('UPDATE one_time_projects SET scheduled_at=?, client_name=?, status=? WHERE id=?');
  change.run('2026-10-14T08:00:00.000Z','Zebra','completed',a.id);
  change.run('2026-10-16T10:00:00.000Z','Alfa','scheduled',b.id);
  change.run('2026-10-15T11:00:00.000Z','Beta','confirmed',c.id);
  const list=async query=>{const response=await s.call('admin'+query);assert.equal(response.status,200,await response.clone().text());return (await response.json()).rows.map(r=>r.id);};
  assert.deepEqual(await list('?sort=upcoming'),[c.id,b.id,a.id]);
  assert.deepEqual(await list('?sort=date_asc'),[a.id,c.id,b.id]);
  assert.deepEqual(await list('?sort=date_desc'),[b.id,c.id,a.id]);
  assert.deepEqual(await list('?sort=name'),[b.id,c.id,a.id]);
  assert.deepEqual(await list('?sort=upcoming&status=confirmed'),[c.id]);
  assert.deepEqual(await list('?sort=upcoming&status=completed'),[a.id]);
  assert.deepEqual(await list('?sort=created').then(ids=>ids.slice().sort()),[a.id,b.id,c.id].sort());
  assert.equal((await s.call('admin?sort=DROP%20TABLE')).status,400);
  assert.equal((await s.call('admin?status=unknown')).status,400);
  assert.equal((await s.call('admin',{authorization:'Bearer recurrent'})).status,403);
 }finally{s.sqlite.close();}
});
