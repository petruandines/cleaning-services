// A separate service key, never the administrator password or a Cloudflare token.
const PATH='/api/portal-assistant/v1/command';
export const SIGNING_CONTEXT='PA-COMMAND-V1\nPOST\n'+PATH+'\n';
const encoder=new TextEncoder();
const unauthorized=()=>{throw new Error('assistant_unauthorized')};
function decode(s){if(typeof s!=='string'||s.length>600||!s.length||!/^[A-Za-z0-9_-]+$/.test(s)||s.length%4===1)unauthorized();return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0))}
export async function verifyAssistantRequest(request,jwk,now=Date.now()/1000){
 if(!jwk||jwk.kty!=='RSA'||typeof jwk.n!=='string'||jwk.n.length!==512||jwk.e!=='AQAB'||Object.keys(jwk).some(k=>!['kty','n','e'].includes(k)))unauthorized();
 const url=new URL(request.url);
 if(url.pathname!==PATH||url.search||request.method!=='POST'||request.headers.has('origin')||request.headers.has('cookie'))unauthorized();
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')unauthorized();
 const stamp=request.headers.get('x-pa-timestamp'),signature=request.headers.get('x-pa-signature');
 if(!/^\d{10}$/.test(stamp||'')||Math.abs(now-Number(stamp))>90)unauthorized();
 const sig=decode(signature);if(sig.length!==384)unauthorized();
 if(Number(request.headers.get('content-length'))>65536||!request.body)unauthorized();
 const reader=request.body.getReader(),parts=[];let total=0;
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>65536){await reader.cancel();unauthorized();}parts.push(value)}
 const bytes=new Uint8Array(total);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length}
 const prefix=encoder.encode(SIGNING_CONTEXT+stamp+'\n'),signed=new Uint8Array(prefix.length+bytes.length);signed.set(prefix);signed.set(bytes,prefix.length);
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSA-PSS',hash:'SHA-256'},false,['verify']);if(key.algorithm.modulusLength!==3072)unauthorized();
 if(!await crypto.subtle.verify({name:'RSA-PSS',saltLength:32},key,sig,signed))unauthorized();
 try{const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))unauthorized();return data}catch{unauthorized()}
}
