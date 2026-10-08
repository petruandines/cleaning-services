import test from 'node:test';import assert from 'node:assert/strict';
import {assertReportBindings} from '../../scripts/report-binding-guard.mjs';
test('deployment accepts original bindings or exactly the reviewed optional report pair',()=>{
 const original=[{name:'DB'},{name:'BETTER_AUTH_SECRET'},{name:'PUBLIC_API_URL'}];
 const r2={name:'PROJECT_REPORTS',type:'r2_bucket',bucket_name:'petru-ines-project-reports'},flag={name:'PROJECT_REPORTS_ENABLED',type:'plain_text',text:'true'};
 assertReportBindings(original);assertReportBindings([...original,r2,flag]);assertReportBindings([...original,r2,{...flag,text:'false'}]);
 for(const extra of [[r2],[flag],[r2,{...flag,text:'yes'}],[{...r2,bucket_name:'other'},flag],[{name:'UNKNOWN'}]])assert.throws(()=>assertReportBindings([...original,...extra]));
 assert.throws(()=>assertReportBindings([...original,r2,flag],{allowReports:false}));
});
