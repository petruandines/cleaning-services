const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!/^[a-f0-9]{32}$/.test(account||''))throw Error('Invalid Cloudflare account identity');
async function check(label,token,resource){
 if(!token){console.error(label+' skipped: secret not configured');process.exitCode=1;return;}
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/'+resource;
 let res;try{res=await fetch(url,{headers:{authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(20000)});}catch{console.error(label+' GET network failure');process.exitCode=1;return;}
 const body=await res.json().catch(()=>({}));
 if(!res.ok||body.success!==true){console.error(label+' GET failed HTTP '+res.status+' (read-only permissions or resource missing)');process.exitCode=1;return;}
 console.log(label+' confirmed via read-only Cloudflare GET');
}
await check('Private R2 report bucket',process.env.PORTAL_REPORTS_CF_TOKEN,'r2/buckets/petru-ines-project-reports');
await check('Portal D1 identity',process.env.CLOUDFLARE_MIGRATION_TOKEN,'d1/database/6816004b-dc95-48c9-be52-9bd4131d157e');
await check('Pages site',process.env.CLOUDFLARE_MIGRATION_TOKEN,'pages/projects/petruandines-site');
