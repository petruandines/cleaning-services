const cases=[
 {name:'Portal login static page',url:'https://petruandines.com/portal/',status:200,contains:'PORTAL CLIEN'},
 {name:'One-time admin static page',url:'https://petruandines.com/portal/projects/',status:200,contains:'Intervenții punctuale'},
 {name:'New agenda static page',url:'https://petruandines.com/portal/agenda/',status:200,contains:'Agenda Petru'},
 {name:'New agenda executable module',url:'https://petruandines.com/portal/agenda/agenda.mjs',status:200,contains:'eventsForRange'},
 {name:'Private agenda blocks require admin session',url:'https://api.petruandines.com/api/agenda/blocks',status:401},
 {name:'Existing one-time admin requires admin session',url:'https://api.petruandines.com/api/one-time/admin',status:401},
 {name:'Existing normal portal requires login',url:'https://api.petruandines.com/api/me',status:401},
 {name:'Outside Origin rejected',url:'https://api.petruandines.com/api/agenda/blocks',status:403,origin:'https://untrusted.example'}
];
let failed=0;
for(const test of cases){
 let result='',passed=false;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await fetch(test.url,{redirect:'follow',headers:{...(test.origin?{origin:test.origin}:{})},signal:AbortSignal.timeout(15000)});
   const text=await response.text();
   passed=response.status===test.status&&(!test.contains||text.includes(test.contains));
   result='HTTP '+response.status+(test.contains&&!text.includes(test.contains)?' missing expected content':'');
   if(passed)break;
  }catch(e){result='GET failed: '+e.name;}
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 if(!passed)failed++;
 console.log((passed?'PASS ':'FAIL ')+test.name+' · '+result);
}
if(failed)process.exitCode=1;else console.log('All live read-only access and asset smoke checks passed.');
