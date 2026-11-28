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
export async function verifyGitHubIdentity(jwt,{now=Date.now()/1000,fetcher=(...args)=>globalThis.fetch(...args)}={}){
 let stage='identity_format';
 try{
  if(typeof jwt!=='string'||jwt.length>24000)deny();
  const segments=jwt.split('.');if(segments.length!==3)deny();
  const [a,b,c]=segments,h=obj(a),p=obj(b);
  if(h.alg!=='RS256'||typeof h.kid!=='string'||h.kid.length>200||h.crit!==undefined)deny();
  stage='identity_claims';
  if(p.iss!==ISS||p.aud!==AUD||p.repository!==REPO||p.repository_id!=='1475476542'||p.repository_owner_id!=='235442213'||p.repository_visibility!=='private'||p.actor_id!=='235442213'||p.ref!=='refs/heads/main'||p.workflow_ref!==WORKFLOW||p.workflow_sha!=='fc812cf837b55d0ace90a5d2d0e7edd771293037'||p.sha!=='fc812cf837b55d0ace90a5d2d0e7edd771293037'||p.event_name!=='issues'||p.runner_environment!=='github-hosted')deny();
  stage='identity_time';
  if(![p.iat,p.nbf,p.exp].every(Number.isSafeInteger)||p.iat>now+30||p.nbf>now+30||p.exp<=now||p.exp-p.iat>600||p.exp<=p.iat||p.iat<now-600)deny();
  if(typeof p.jti!=='string'||!p.jti||typeof p.run_id!=='string'||!/^\d+$/.test(p.run_id))deny();
  stage='identity_jwks_fetch';
  const r=await fetcher(JWKS,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{accept:'application/json'}});
  if(!r.ok)deny();
  stage='identity_jwks_keys';
  const keys=(await r.json()).keys;if(!Array.isArray(keys))deny();
  const matching=keys.filter(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  if(matching.length!==1)deny();
  stage='identity_key_import';
  const k=await crypto.subtle.importKey('jwk',matching[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(k.algorithm.modulusLength<2048)deny();
  stage='identity_signature';
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',k,decode(c),new TextEncoder().encode(a+'.'+b)))deny();
  return {runId:p.run_id,jti:p.jti,actorId:p.actor_id};
 }catch{const e=new Error('github_identity_denied');e.diagnostic=stage;throw e;}
}

// Temporary, independently retrieved official GitHub public keys for the isolated synthetic test only.
// Source: official JWKS, verified GitHub Actions run 46139055885 on 2026-11-28.
// This is not a permanent replacement for live key discovery; fail closed at cutoff.
const TEST_KEY_CUTOFF=Date.parse('2026-11-28T13:00:00.000Z')/1000;
const TEST_PUBLIC_KEYS=[{"kty":"RSA","alg":"RS256","use":"sig","kid":"cc413527-173f-5a05-976e-9c52b1d7b431","n":"w4M936N3ZxNaEblcUoBm-xu0-V9JxNx5S7TmF0M3SBK-2bmDyAeDdeIOTcIVZHG-ZX9N9W0u1yWafgWewHrsz66BkxXq3bscvQUTAw7W3s6TEeYY7o9shPkFfOiU3x_KYgOo06SpiFdymwJflRs9cnbaU88i5fZJmUepUHVllP2tpPWTi-7UA3AdP3cdcCs5bnFfTRKzH2W0xqKsY_jIG95aQJRBDpbiesefjuyxcQnOv88j9tCKWzHpJzRKYjAUM6OPgN4HYnaSWrPJj1v41eEkFM1kORuj-GSH2qMVD02VklcqaerhQHIqM-RjeHsN7G05YtwYzomE5G-fZuwgvQ","e":"AQAB"},{"kty":"RSA","alg":"RS256","use":"sig","kid":"38826b17-6a30-5f9b-b169-8beb8202f723","n":"5Manmy-zwsk3wEftXNdKFZec4rSWENW4jTGevlvAcU9z3bgLBogQVvqYLtu9baVm2B3rfe5onadobq8po5UakJ0YsTiiEfXWdST7YI2Sdkvv-hOYMcZKYZ4dFvuSO1vQ2DgEkw_OZNiYI1S518MWEcNxnPU5u67zkawAGsLlmXNbOylgVfBRJrG8gj6scr-sBs4LaCa3kg5IuaCHe1pB-nSYHovGV_z0egE83C098FfwO1dNZBWeo4Obhb5Z-ZYFLJcZfngMY0zJnCVNmpHQWOgxfGikh3cwi4MYrFrbB4NTlxbrQ3bL-rGKR5X318veyDlo8Dyz2KWMobT4wB9U1Q","e":"AQAB"},{"kty":"RSA","alg":"RS256","use":"sig","kid":"38E9B30B3A023A1B72309921A69A42FCC496C42C","n":"tEq2Fp9HcdT5MwMsB_UTm8j_woJJLi3sA-y0RX2tioTm581seyfvOH6lJ5JmHVtS-_fb8B2tRT1pznHQSNq14PsJdu9bp5egbWmIz-5RvhqoM-oKem_MJENCNFuqXijRLT47FRdfH3inqde1vJlA_JJHCqYMKIpHH7kqNFYcCpwr0vk80Hc2rTyL0uBXI7NqBZbtUgNoyucWO5O7QQrPNOmlr-GI8aFckFRfobCaCOiH9qW02FtkV74fwBGVCNhNf3a1CK81-O8xEGimvVydI_pQA5B8QqVuQjY_ntOu555HdirA0hKkY6fsE9eZCMFmWDHZ2kSWLjhabxWxIzSzXQ","e":"AQAB"},{"kty":"RSA","alg":"RS256","use":"sig","kid":"4F3E9AD8C9A6F5EB3173006F4FA630E28F43DCE9","n":"tGevqhkBGn8NB0dKxs8Ddxhn-xZPm55svcSlkJZEOwDOXDLl_0-iVOVKNJfcHHLHvMqa6zh2DDcpAWZi2FpeBAJupsrymqwzllxOODWKWoVIoaIjOO7h1JLiF9Knwuq-o6BPtKdwOT-bOrXRzChMtQsc5C1Auex-D0Z6loObBuK1Lkm0RK9ISQsLqBEwq8g0OOupI_shU1r2rT2G0nkZ0CvxVlQeUGShFi8Mdys2s5LPqBwjC4LKwjk8moWQV32KEccbTPKxnG_539DxRglHJgHPHisSVGsfZIUXi2chtXdQHZPdVve8ZRmknCykZtkJ6K87llSUXi7oyzhCIZdiUQ","e":"AQAB"}];
export async function verifySyntheticGitHubIdentity(jwt,{now=Date.now()/1000}={}){
 if(!Number.isFinite(now)||now>=TEST_KEY_CUTOFF)deny();
 return verifyGitHubIdentity(jwt,{now,fetcher:async target=>{
  if(target!==JWKS)deny();
  return Response.json({keys:TEST_PUBLIC_KEYS});
 }});
}
