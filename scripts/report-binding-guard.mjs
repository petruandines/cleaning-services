import assert from 'node:assert/strict';
// Existing configuration stays valid. Only this reviewed optional pair is
// accepted; unknown bindings and partly configured reports still fail closed.
export function assertReportBindings(bindings,{allowReports=true,bucketName='petru-ines-project-reports'}={}){
 const r2=bindings.find(b=>b.name==='PROJECT_REPORTS'),flag=bindings.find(b=>b.name==='PROJECT_REPORTS_ENABLED');
 const expected=['BETTER_AUTH_SECRET','DB','PUBLIC_API_URL'];
 if(r2||flag){
  assert.ok(allowReports,'Live report binding must be preserved in Wrangler before deployment');
  assert.equal(r2?.type,'r2_bucket');assert.equal(r2.bucket_name,bucketName);
  assert.equal(flag?.type,'plain_text');assert.ok(['true','false'].includes(flag.text));
  expected.push('PROJECT_REPORTS','PROJECT_REPORTS_ENABLED');
 }
 assert.deepEqual(bindings.map(b=>b.name).sort(),expected.sort());
}
