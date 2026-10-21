import test from 'node:test';
import assert from 'node:assert/strict';
import {recurringRows,eventsForRange,conflicts,createAgendaICS,safePhone,startOfWeek,monthMove,addDays} from '../../portal/agenda/core.mjs';

const weekly={id:'b1',title:'Pauză personală',start:'2026-10-21T12:00',end:'2026-10-21T16:00',all_day:false,repeat:'weekly',repeat_until:'2026-12-31',version:'v1',exceptions:{'2026-10-28':null,'2026-11-04':{title:'Altă oră',start:'2026-11-04T10:00',end:'2026-11-04T13:00',all_day:false}}};
test('weekly recurrence, skipped occurrence and isolated edit work without mutating source',()=>{
 const rows=recurringRows(weekly,'2026-10-20','2026-11-07');
 assert.deepEqual(rows.map(r=>r.start),['2026-10-21T12:00','2026-11-04T10:00']);
 assert.deepEqual(rows.map(r=>r.end),['2026-10-21T16:00','2026-11-04T13:00']);
 assert.equal(weekly.start,'2026-10-21T12:00');
});
test('multi-day all-day block covers each day and exports exclusive end date',()=>{
 const block={id:'b2',title:'Concediu',start:'2026-10-22T00:00',end:'2026-10-25T23:59',all_day:true,repeat:'none'};
 const rows=recurringRows(block,'2026-10-24','2026-10-30');
 assert.equal(rows.length,1);assert.equal(rows[0].end,'2026-10-25T23:59');
 const ics=createAgendaICS(rows,{now:new Date('2026-10-19T00:00:00Z')});
 assert.match(ics,/DTSTART;VALUE=DATE:20261022/);assert.match(ics,/DTEND;VALUE=DATE:20261026/);
 assert.doesNotMatch(ics,/Concediu/,'private reason not exported');
});
test('appointment conflicts and contact navigation fields are kept only in admin model',()=>{
 const appointments=[{id:'a1',client_id:'c1',location_id:'l1',starts_at:'2026-10-21T10:00:00Z',ends_at:'2026-10-21T12:00:00Z',client_name:'Client Privat',location_address:'Str. Exemplu'}];
 const clients=[{id:'c1',phone:'0772 000 999'}],locations=[{id:'l1',city:'București'}];
 const all=eventsForRange(appointments,[],[weekly],'2026-10-20','2026-10-26',clients,locations);
 assert.equal(all.length,2);
 assert.equal(conflicts(all).length,1);
 assert.equal(safePhone(all.find(e=>e.kind==='recurring').phone),'+40772000999');
 const redacted=createAgendaICS(all,{now:new Date('2026-10-19T00:00:00Z')});
 assert.doesNotMatch(redacted,/Client Privat|Str\. Exemplu|0772|Pauză personală/);
 const expanded=createAgendaICS(all,{includePrivate:true,now:new Date('2026-10-19T00:00:00Z')});
 assert.match(expanded,/Client Privat/);
});

test('one-time projects display 30 minutes by default, including overlap and ICS, without changing source',()=>{
 const projects=[{id:'p1',name:'Curățenie',scheduled_at:'2026-10-21T07:00:00Z',status:'scheduled'}];
 const blocks=[
  {id:'inside',title:'Blocaj 1',start:'2026-10-21T10:20',end:'2026-10-21T10:25',repeat:'none'},
  {id:'outside',title:'Blocaj 2',start:'2026-10-21T10:30',end:'2026-10-21T11:00',repeat:'none'}
 ];
 const events=eventsForRange([],projects,blocks,'2026-10-21','2026-10-21');
 const one=events.find(e=>e.kind==='one-time');
 assert.equal(one.start,'2026-10-21T10:00');
 assert.equal(one.end,'2026-10-21T10:30');
 assert.equal(one.approx,true);
 assert.equal(conflicts(events).length,1,'only the block inside the estimated 30-minute interval overlaps');
 assert.equal(projects[0].scheduled_at,'2026-10-21T07:00:00Z','persisted project fields are not changed');
 const ics=createAgendaICS([one],{now:new Date('2026-10-21T00:00:00Z')});
 assert.match(ics,/DTSTART:20261021T070000Z/);
 assert.match(ics,/DTEND:20261021T073000Z/);
});

test('date arithmetic does not jump days at Romanian DST boundaries',()=>{
 assert.equal(addDays('2026-10-24',1),'2026-10-25');
 assert.equal(addDays('2026-10-25',1),'2026-10-26');
 assert.equal(startOfWeek('2026-10-25'),'2026-10-19');
 assert.equal(monthMove('2026-10-25',1),'2026-11-01');
});
