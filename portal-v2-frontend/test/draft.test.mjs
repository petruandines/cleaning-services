import test from 'node:test';
import assert from 'node:assert/strict';
import { statusTone } from '../appointment-view.mjs';
import { createCalendar, selectCalendarRows } from '../calendar-export.mjs';
test('Draft is distinct and calendar events stay tentative',()=>{
 const row={id:'draft-1',location_id:'l',status:'draft',starts_at:'2030-10-02T10:00:00Z',ends_at:'2030-10-02T11:00:00Z',client_name:'Test'};
 assert.equal(statusTone('appointments','draft'),'violet');
 assert.equal(selectCalendarRows([row],{futureOnly:true,now:new Date('2030-10-01')}).length,1);
 assert.match(createCalendar([row]),/STATUS:TENTATIVE/);
});
