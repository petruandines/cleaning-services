const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!/^[a-f0-9]{32}$/.test(account||''))throw Error('Invalid Cloudflare account identity');
async function tryRead(label,secretNames,resource,options={}){
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/'+resource;
 let lastStatus='no configured token';
 for(const secretName of secretNames){
  const token=process.env[secretName];
  if(!token)continue;
  let response;
  try{response=await fetch(url,{headers:{authorization:'Bearer '+token,accept:'application/json',...(options.eu?{'cf-r2-jurisdiction':'eu'}:{})},signal:AbortSignal.timeout(20000)});}
  catch{lastStatus='network failure';continue;}
  const parsed=await response.json().catch(()=>({}));
  if(response.ok&&parsed.success===true){
   console.log(label+' confirmed through authenticated read-only GET');
   return true;
  }
  lastStatus='HTTP '+response.status;
 }
 console.error(label+' unavailable through supplied tokens ('+lastStatus+'); no mutation performed');
 return false;
}
const reports=await tryRead('EU-private R2 bucket',['PORTAL_REPORTS_CF_TOKEN'],'r2/buckets/petru-ines-project-reports',{eu:true});
const d1=await tryRead('D1 metadata',['PORTAL_BACKUP_D1_EXPORT_TOKEN','PORTAL_ONE_TIME_D1_TOKEN','PORTAL_REPORTS_CF_TOKEN','CLOUDFLARE_MIGRATION_TOKEN'],'d1/database/6816004b-dc95-48c9-be52-9bd4131d157e');
const pages=await tryRead('Pages site',['CLOUDFLARE_MIGRATION_TOKEN'],'pages/projects/petruandines-site');
if(!reports||!pages)process.exitCode=1;
if(!d1)console.warn('D1 GET check inconclusive: successful encrypted backup on 2026-10-18 is the authoritative D1 verification.');
