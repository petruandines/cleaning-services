import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { guardAdminPassword } from '../src/admin-password.mjs';
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

test('admin password verifies current password, revokes all old sessions and retains TOTP', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../docs/portal-v2/0002_auth.sql', import.meta.url), 'utf8'));
  const base = 'https://portal.example.workers.dev';
  const options = authOptions({ database: db, secret: 'local-test-secret-with-at-least-32-bytes', baseURL: base });
  // Fixture only: production options retain disableSignUp: true.
  options.emailAndPassword = { ...options.emailAndPassword, disableSignUp: false };
  options.rateLimit = { enabled: false }; // Fixture only: production rate limits remain enabled.
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

  const request = (data, token = finalToken) => new Request(base + '/api/auth/change-password', {
    method: 'POST', headers: { Origin: base, 'content-type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(data),
  });
  const next = 'new-test-password-5678';
  const body = { currentPassword: password, newPassword: next, revokeOtherSessions: true };
  const bad = request({ ...body, currentPassword: 'wrong-password' });
  assert.equal(await guardAdminPassword(bad, auth), null);
  assert.equal((await auth.handler(bad)).status, 400);
  assert.ok(await auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + finalToken }) }));
  const change = request(body);
  assert.equal(await guardAdminPassword(change, auth), null);
  const changed = await auth.handler(change);
  assert.equal(changed.status, 200);
  const rotated = changed.headers.get('set-auth-token');
  assert.ok(rotated);
  assert.equal(await auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + finalToken }) }), null);
  assert.equal(await auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + bearer }) }), null);
  assert.equal((await auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + rotated }) })).user.twoFactorEnabled, true);
  cookie = '';
  assert.equal((await post('sign-in/email', { email, password })).response.status, 401);
  assert.equal((await post('sign-in/email', { email, password: next })).body.twoFactorRedirect, true);
  db.close();
});

test('admin guard rejects clients, unenrolled staff, invalid inputs and optional session revocation', async () => {
  const valid = {currentPassword:'old-password-1234',newPassword:'new-password-5678',revokeOtherSessions:true};
  const request = data => new Request('https://api.petruandines.com/api/auth/change-password', {
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),
  });
  const auth = user => ({api:{getSession:async()=> user ? {user} : null}});
  for (const [user,status] of [[null,401],[{id:'u',role:'user'},403],[{id:'a',role:'admin',twoFactorEnabled:false},403]])
    assert.equal((await guardAdminPassword(request(valid),auth(user))).status,status);
  const admin = auth({id:'a',role:'admin',twoFactorEnabled:true});
  for(const data of [{...valid,revokeOtherSessions:false},{...valid,newPassword:'short'},
    {...valid,newPassword:valid.currentPassword},{...valid,userId:'other'},null])
    assert.equal((await guardAdminPassword(request(data),admin)).status,400);
  assert.equal(await guardAdminPassword(request(valid),admin),null);
});
