import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { handleAdminDeviceSession } from '../src/admin-device-session.mjs';
import { authOptions } from '../src/auth-options.mjs';

function totp(uri) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secret = new URL(uri).searchParams.get('secret').toUpperCase();
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

test('remembered admin cookie survives closing the tab, bounds expiry and is revoked on logout/password change', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../docs/portal-v2/0002_auth.sql', import.meta.url), 'utf8'));
  const base = 'https://portal.example.workers.dev';
  const options = authOptions({ database: db, secret: 'local-test-secret-with-at-least-32-bytes', baseURL: base });
  // Fixture only: production options retain disableSignUp: true.
  options.emailAndPassword = { ...options.emailAndPassword, disableSignUp: false };
  options.rateLimit = { enabled: false }; // Fixture only.
  const auth = betterAuth(options);
  let cookie = '';
  async function post(path, body, bearer) {
    const response = await auth.handler(new Request(base + '/api/auth/' + path, {
      method: 'POST', headers: { Origin: base, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10',
        ...(cookie ? { Cookie: cookie } : {}), ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
      body: JSON.stringify(body),
    }));
    for (const setCookie of response.headers.getSetCookie()) {
      const pair = setCookie.split(';', 1)[0];
      const name = pair.split('=')[0];
      cookie = [...cookie.split('; ').filter(item => item && !item.startsWith(name + '=')), pair].join('; ');
    }
    return { response, body: await response.json() };
  }
  const email = 'admin@example.test', password = 'temporary-password-1234';
  const registration = await post('sign-up/email', { name: 'Test admin', email, password });
  assert.equal(registration.response.status, 200, JSON.stringify(registration.body));
  db.prepare('UPDATE "user" SET role = ? WHERE email = ?').run('admin', email);
  cookie = '';
  const signIn = await post('sign-in/email', { email, password });
  assert.equal(signIn.response.status, 200, JSON.stringify(signIn.body));
  const bearer = signIn.response.headers.get('set-auth-token');
  assert.ok(bearer, 'bearer token is returned to the Worker login popup');
  assert.equal((await auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + bearer }) }))?.user.role, 'admin');
  const enable = await post('two-factor/enable', { password, method: 'totp' }, bearer);
  assert.equal(enable.response.status, 200, JSON.stringify(enable.body));
  assert.ok(enable.body.totpURI);
  assert.ok(Array.isArray(enable.body.backupCodes));
  const verified = await post('two-factor/verify-totp', { code: totp(enable.body.totpURI), trustDevice: false }, bearer);
  assert.equal(verified.response.status, 200, JSON.stringify(verified.body));
  assert.ok(verified.response.headers.get('set-auth-token'), 'TOTP enrollment returns an updated token');
  cookie = '';
  const secondLogin = await post('sign-in/email', { email, password });
  assert.equal(secondLogin.body.twoFactorRedirect, true);
  const secondFactor = await post('two-factor/verify-totp', { code: totp(enable.body.totpURI), trustDevice: true });
  assert.equal(secondFactor.response.status, 200, JSON.stringify(secondFactor.body));
  const finalToken = secondFactor.response.headers.get('set-auth-token');
  assert.ok(finalToken, 'second-factor login returns the bearer session');
  assert.equal((await auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + finalToken }) }))?.user.twoFactorEnabled, true);

  const endpoint = 'https://api.petruandines.com/api/admin-device-session';
  let deviceCookie = '';
  const device = (method, bearer = finalToken, origin = 'https://petruandines.com') => handleAdminDeviceSession(new Request(endpoint, {
    method, headers: {Origin:origin,'content-type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{}),
      ...(deviceCookie?{Cookie:deviceCookie}:{})},...(method==='POST'?{body:'{}'}:{}),
  }),auth);
  assert.equal((await device('POST',null)).status,401);
  assert.equal((await device('POST',finalToken,'https://attacker.test')).status,403);
  const remembered = await device('POST');
  assert.equal(remembered.status,200);
  assert.equal((await remembered.json()).remembered,true);
  const setCookie = remembered.headers.get('set-cookie');
  assert.match(setCookie,/Secure; HttpOnly; SameSite=Strict/);
  assert.match(setCookie,/Max-Age=2592000/);
  assert.match(setCookie,/Path=\//);
  deviceCookie=setCookie.split(';',1)[0];
  const rootToken=deviceCookie.split('=')[1];
  assert.notEqual(rootToken,finalToken);
  const rootSession=await auth.api.getSession({headers:new Headers({Authorization:'Bearer '+rootToken}),query:{disableRefresh:true}});
  assert.ok(rootSession.session.expiresAt.getTime()-Date.now()>29*86400000);
  const restored = await device('GET',null);
  assert.equal(restored.status,200);
  const childToken=(await restored.json()).token;
  assert.notEqual(childToken,rootToken);
  const child=await auth.api.getSession({headers:new Headers({Authorization:'Bearer '+childToken}),query:{disableRefresh:true}});
  assert.equal(child.user.role,'admin');assert.equal(child.user.twoFactorEnabled,true);
  assert.ok(child.session.expiresAt.getTime()-Date.now()<=8*3600000);
  assert.equal((await (await device('GET',null)).json()).token,childToken,'reuses short session without unnecessary writes');
  // Expiring the tab session retains the independent 30 day device login.
  const adapter=(await auth.$context).internalAdapter;
  await adapter.updateSession(childToken,{expiresAt:new Date(Date.now()-1000)});
  const nextChild=(await (await device('GET',null)).json()).token;
  assert.ok(nextChild);assert.notEqual(nextChild,childToken);
  const removed=await device('DELETE',null);
  assert.equal(removed.status,200);assert.match(removed.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal(await auth.api.getSession({headers:new Headers({Authorization:'Bearer '+rootToken})}),null);
  assert.equal(await auth.api.getSession({headers:new Headers({Authorization:'Bearer '+nextChild})}),null);
  assert.equal((await device('GET',null)).status,401);
  // Password rotation also invalidates remembered device and all restored tabs.
  const secondRemembered=await device('POST');
  deviceCookie=secondRemembered.headers.get('set-cookie').split(';',1)[0];
  const passwordChange=await auth.api.changePassword({headers:new Headers({Authorization:'Bearer '+finalToken,Origin:base}),
    body:{currentPassword:password,newPassword:'another-password-1234',revokeOtherSessions:true},asResponse:true});
  assert.equal(passwordChange.status,200);
  assert.equal((await device('GET',null)).status,401);
  db.close();
});

test('remembering excludes client accounts, missing TOTP, banned users and old login sessions',async()=>{
 const request=origin=>new Request('https://api.petruandines.com/api/admin-device-session',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:'{}'});
 for(const user of [{id:'c',role:'user'},{id:'a',role:'admin',twoFactorEnabled:false},{id:'a',role:'admin',twoFactorEnabled:true,banned:true}]){
  const auth={$context:Promise.resolve({internalAdapter:{}}),api:{getSession:async()=>({user,session:{createdAt:new Date()}})}};
  assert.equal((await handleAdminDeviceSession(request('https://petruandines.com'),auth)).status,403);
 }
 const auth={$context:Promise.resolve({internalAdapter:{}}),api:{getSession:async()=>({user:{id:'a',role:'admin',twoFactorEnabled:true},session:{createdAt:new Date(Date.now()-3600000)}})}};
 assert.equal((await handleAdminDeviceSession(request('https://petruandines.com'),auth)).status,403);
 assert.equal((await handleAdminDeviceSession(request('https://petruandines.com.attacker.test'),{})).status,403);
});
