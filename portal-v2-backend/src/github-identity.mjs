// Verify a GitHub Actions identity token. No customer data or secrets here.
const ISS='https://token.actions.githubusercontent.com';
const JWKS=ISS+'/.well-known/jwks';
export const AUD='https://api.petruandines.com/portal-assistant/test-v1';
const REPO='petruandines/portal-assistant';
const WORKFLOW=REPO+'/.github/workflows/portal-bridge.yml@refs/heads/main';
const deny=()=>{throw new Error('github_identity_denied')};
function decode(s,max=65536){
 if(typeof s!=='string'||s.length>max||!s.length||!/^[A-Za-z0-9_-]+$/.test(s)||s.length%4===1)deny();
 const binary=atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function obj(s){const o=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(s)));if(!o||typeof o!=='object'||Array.isArray(o))deny();return o}
export async function verifyGitHubIdentity(jwt,{now=Date.now()/1000,fetcher=fetch}={}){
 try{
  if(typeof jwt!=='string'||jwt.length>24000)deny();
  const segments=jwt.split('.');if(segments.length!==3)deny();
  const [a,b,c]=segments,h=obj(a),p=obj(b);
  if(h.alg!=='RS256'||typeof h.kid!=='string'||h.kid.length>200||h.crit!==undefined)deny();
  if(p.iss!==ISS||p.aud!==AUD||p.repository!==REPO||p.repository_id!=='1475476542'||p.repository_owner_id!=='235442213'||p.repository_visibility!=='private'||p.actor_id!=='235442213'||p.ref!=='refs/heads/main'||p.workflow_ref!==WORKFLOW||p.workflow_sha!=='1dbe4a98aec747213b077472615163b8c76cea34'||p.sha!=='1dbe4a98aec747213b077472615163b8c76cea34'||p.event_name!=='issues'||p.runner_environment!=='github-hosted')deny();
  if(![p.iat,p.nbf,p.exp].every(Number.isSafeInteger)||p.iat>now+30||p.nbf>now+30||p.exp<=now||p.exp-p.iat>600||p.exp<=p.iat||p.iat<now-600)deny();
  if(typeof p.jti!=='string'||!p.jti||typeof p.run_id!=='string'||!/^\d+$/.test(p.run_id))deny();
  const r=await fetcher(JWKS,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{accept:'application/json'}});
  if(!r.ok)deny();
  const keys=(await r.json()).keys;if(!Array.isArray(keys))deny();
  const matching=keys.filter(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  if(matching.length!==1)deny();
  const k=await crypto.subtle.importKey('jwk',matching[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(k.algorithm.modulusLength<2048)deny();
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',k,decode(c),new TextEncoder().encode(a+'.'+b)))deny();
  return {runId:p.run_id,jti:p.jti,actorId:p.actor_id};
 }catch{deny()}
}
