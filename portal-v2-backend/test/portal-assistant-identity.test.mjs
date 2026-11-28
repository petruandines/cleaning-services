import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {AUD,verifyGitHubIdentity} from '../src/github-identity.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'};
const fetcher=async url=>{assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');return new Response(JSON.stringify({keys:[jwk]}))};
const now=1800000000;
const claims={iss:'https://token.actions.githubusercontent.com',aud:AUD,repository:'petruandines/portal-assistant',repository_id:'1475476542',repository_owner_id:'235442213',repository_visibility:'private',actor_id:'235442213',ref:'refs/heads/main',workflow_ref:'petruandines/portal-assistant/.github/workflows/portal-bridge.yml@refs/heads/main',workflow_sha:'1dbe4a98aec747213b077472615163b8c76cea34',sha:'1dbe4a98aec747213b077472615163b8c76cea34',event_name:'issues',runner_environment:'github-hosted',iat:now-5,nbf:now-5,exp:now+295,jti:'fixture',run_id:'123'};
function token(p=claims,h={alg:'RS256',kid:'fixture'}){const x=Buffer.from(JSON.stringify(h)).toString('base64url')+'.'+Buffer.from(JSON.stringify(p)).toString('base64url');return x+'.'+sign('RSA-SHA256',Buffer.from(x),privateKey).toString('base64url')}
assert.equal((await verifyGitHubIdentity(token(),{now,fetcher})).runId,'123');
for(const [field,value] of Object.entries({aud:'wrong',iss:'wrong',repository:'other',repository_id:'0',repository_owner_id:'0',repository_visibility:'public',actor_id:'0',ref:'refs/heads/dev',workflow_ref:'other',workflow_sha:'wrong',sha:'wrong',event_name:'push',runner_environment:'self-hosted',exp:now-1,iat:now+100,nbf:now+100,jti:''})){
 await assert.rejects(verifyGitHubIdentity(token({...claims,[field]:value}),{now,fetcher}),/github_identity_denied/,field);
}
await assert.rejects(verifyGitHubIdentity(token(claims,{alg:'none',kid:'fixture'}),{now,fetcher}),/github_identity_denied/);
const [a,b,c]=token().split('.');const altered=a+'.'+b+'.'+(c[0]==='a'?'b':'a')+c.slice(1);
await assert.rejects(verifyGitHubIdentity(altered,{now,fetcher}),/github_identity_denied/);
console.log('Identity fixture: valid token accepted; 20 invalid cases rejected.');
