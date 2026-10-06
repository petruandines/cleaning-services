// A purpose-specific key is derived from the existing server secret, never the DB.
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=value=>{if(typeof value!=='string'||!value.length||value.length%2||!/^[a-f0-9]+$/.test(value))throw new Error('invalid_ciphertext');return Uint8Array.from(value.match(/../g),x=>parseInt(x,16));};
async function key(secret){
 if(typeof secret!=='string'||secret.length<32)throw new Error('password_key_unavailable');
 const material=await crypto.subtle.importKey('raw',encoder.encode(secret),'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('petru-ines/one-time/password/v1'),info:encoder.encode('admin-password-copy')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function sealPassword(password,secret,id,hash){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(id+'\0'+hash),tagLength:128},await key(secret),encoder.encode(password));
 return 'v1:'+hex(iv)+':'+hex(data);
}
export async function openPassword(sealed,secret,id,hash){
 const [version,iv,data,...extra]=sealed.split(':');
 if(version!=='v1'||extra.length||iv.length!==24)throw new Error('invalid_ciphertext');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode(id+'\0'+hash),tagLength:128},await key(secret),bytes(data));
 return new TextDecoder().decode(plain);
}
