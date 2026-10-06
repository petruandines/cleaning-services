import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { authOptions } from '../src/auth-options.mjs';
import { handleApi } from '../src/api.mjs';

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of ['0001_app_schema.sql', '0002_auth.sql', '0003_portal_accounts.sql',
    '0004_location_contact.sql', '0005_soft_delete.sql', '0006_invoice_client_notes.sql'])
    sqlite.exec(readFileSync(new URL('../../docs/portal-v2/' + file, import.meta.url), 'utf8'));
  const at = new Date().toISOString();
  for (const id of ['a', 'b']) sqlite.prepare('INSERT INTO clients (id,kind,display_name,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run(id, 'PF', id, at, at);
  const db = {
    prepare(sql) { return { bind(...args) { const s = sqlite.prepare(sql); return {
      async all() { return { results: s.all(...args) }; }, async run() { return s.run(...args); },
    }; } }; },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { for (const s of statements) await s.run(); sqlite.exec('COMMIT'); }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  const base = 'https://api.petruandines.com';
  const options = authOptions({ database: sqlite, secret: 'integration-test-secret-at-least-32-bytes', baseURL: base });
  options.emailAndPassword = { ...options.emailAndPassword, disableSignUp: false };
  options.rateLimit = { enabled: false };
  const auth = betterAuth(options);
  const password = 'initial-client-password-123';
  async function signIn(email, pass = password) {
    const r = await auth.handler(new Request(base + '/api/auth/sign-in/email', {
      method: 'POST', headers: { Origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    }));
    return { status: r.status, token: r.headers.get('set-auth-token') };
  }
  await auth.api.signUpEmail({ body: { name: 'Admin', email: 'admin@example.test', password } });
  sqlite.prepare('UPDATE "user" SET role = ? WHERE email = ?').run('admin', 'admin@example.test');
  const admin = await signIn('admin@example.test');
  sqlite.prepare('UPDATE "user" SET "twoFactorEnabled" = 1 WHERE email = ?').run('admin@example.test');
  async function call(path, token = admin.token, method = 'GET', data, origin = base) {
    return handleApi(new Request(base + '/api/' + path, { method,
      headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }), { db, auth });
  }
  const accounts = [];
  for (const [email, client_id] of [['first@example.test', 'a'], ['second@example.test', 'a'], ['other@example.test', 'b']]) {
    const r = await call('users', admin.token, 'POST', { email, client_id, name: email, password });
    assert.equal(r.status, 201, await r.clone().text());
    const id = (await r.json()).id;
    accounts.push({ id, email, token: (await signIn(email)).token });
  }
  return { sqlite, auth, admin, accounts, password, signIn, call };
}

test('staff edits a scoped account, rejects duplicate emails and invalidates only that account sessions', async () => {
  const f = await fixture();
  try {
    const [a, second] = f.accounts;
    assert.equal((await f.call('users?client_id=a')).status, 200);
    const patch = data => f.call('users/' + a.id, f.admin.token, 'PATCH', { client_id: 'a', ...data });
    assert.equal((await patch({ email: ' SECOND@example.test ' })).status, 409);
    assert.equal((await f.call('me', a.token)).status, 200);
    assert.equal((await patch({ role: 'admin', name: 'Forbidden' })).status, 400);
    const edited = await patch({ name: 'New name', email: ' UPDATED@example.test ' });
    assert.equal(edited.status, 200, await edited.clone().text());
    assert.equal((await f.call('me', a.token)).status, 401);
    assert.equal((await f.call('me', second.token)).status, 200);
    assert.equal((await f.signIn(a.email)).status, 401);
    assert.equal((await f.signIn('updated@example.test')).status, 200);
    const row = f.sqlite.prepare('SELECT name, email, role FROM "user" WHERE id = ?').get(a.id);
    assert.deepEqual({ ...row }, { name: 'New name', email: 'updated@example.test', role: 'user' });
  } finally { f.sqlite.close(); }
});

test('password reset requires a new client password and preserves the first-login flow', async () => {
  const f = await fixture();
  try {
    const [a, second] = f.accounts;
    // Simulate an established account that already completed the first-login gate.
    f.sqlite.prepare('UPDATE portal_accounts SET must_change_password = 0 WHERE user_id = ?').run(a.id);
    const temporary = 'replacement-temporary-123';
    const reset = data => f.call('users/' + a.id, f.admin.token, 'PATCH', { client_id: 'a', ...data });
    assert.equal((await reset({ password: 'short' })).status, 400);
    assert.equal((await f.call('users/' + a.id, f.admin.token, 'PATCH', { client_id: 'a', password: temporary }, 'https://petruandines.com')).status, 403);
    const r = await reset({ password: temporary });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal((await f.call('me', a.token)).status, 401);
    assert.equal((await f.call('me', second.token)).status, 200);
    assert.equal((await f.signIn(a.email)).status, 401);
    const signed = await f.signIn(a.email, temporary);
    assert.equal(signed.status, 200);
    assert.equal((await (await f.call('me', signed.token)).json()).mustChangePassword, true);
    assert.equal((await f.call('appointments', signed.token)).status, 403);
    const changed = await f.call('password', signed.token, 'POST', {
      currentPassword: temporary, newPassword: 'client-chosen-password-123',
    }, 'https://petruandines.com');
    assert.equal(changed.status, 200, await changed.clone().text());
    assert.equal((await (await f.call('me', (await changed.json()).token)).json()).mustChangePassword, false);
  } finally { f.sqlite.close(); }
});

test('revocation closes sessions, removes only the selected link and allows explicit later reactivation', async () => {
  const f = await fixture();
  try {
    const [a, second] = f.accounts;
    const r = await f.call('users/' + a.id, f.admin.token, 'DELETE', { client_id: 'a' }, 'https://petruandines.com');
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal((await f.call('me', a.token)).status, 401);
    const oldLogin = await f.signIn(a.email);
    assert.equal((await f.call('me', oldLogin.token)).status, 401);
    assert.equal((await f.call('me', second.token)).status, 200);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM clients').get().n, 2);
    assert.deepEqual((await (await f.call('users?client_id=a')).json()).rows.map(r => r.id), [second.id]);
    const data = { client_id: 'a', email: a.email, name: 'Restored', password: 'restored-temporary-123' };
    assert.equal((await f.call('users', f.admin.token, 'POST', data)).status, 409);
    const restored = await f.call('users', f.admin.token, 'POST', { ...data, reactivate_existing: true });
    assert.equal(restored.status, 201, await restored.clone().text());
    assert.equal((await f.call('me', oldLogin.token)).status, 401);
    const login = await f.signIn(a.email, data.password);
    assert.equal((await (await f.call('me', login.token)).json()).mustChangePassword, true);
  } finally { f.sqlite.close(); }
});

test('account management refuses clients, unverified staff, wrong scope and administrator targets', async () => {
  const f = await fixture();
  try {
    const [a] = f.accounts;
    const data = { client_id: 'a', name: 'Changed' };
    assert.equal((await f.call('users/' + a.id, null, 'PATCH', data)).status, 401);
    assert.equal((await f.call('users/' + a.id, a.token, 'PATCH', data)).status, 403);
    assert.equal((await f.call('users/' + a.id, f.admin.token, 'PATCH', { ...data, client_id: 'b' })).status, 404);
    const adminId = f.sqlite.prepare('SELECT id FROM "user" WHERE email = ?').get('admin@example.test').id;
    assert.equal((await f.call('users/' + adminId, f.admin.token, 'DELETE', { client_id: 'a' })).status, 404);
    f.sqlite.prepare('UPDATE "user" SET "twoFactorEnabled" = 0 WHERE id = ?').run(adminId);
    assert.equal((await f.call('users/' + a.id, f.admin.token, 'PATCH', data)).status, 403);
    assert.equal(f.sqlite.prepare('SELECT name FROM "user" WHERE id = ?').get(a.id).name, a.email);
  } finally { f.sqlite.close(); }
});

test('failed audit rolls back edits, password reset and session revocation', async () => {
  const f = await fixture();
  try {
    const [a] = f.accounts;
    f.sqlite.exec("CREATE TRIGGER reject_account_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END");
    const r = await f.call('users/' + a.id, f.admin.token, 'PATCH', {
      client_id: 'a', email: 'changed@example.test', password: 'changed-temporary-123',
    });
    assert.equal(r.status, 500);
    assert.equal((await f.call('me', a.token)).status, 200);
    assert.equal((await f.signIn(a.email)).status, 200);
    assert.equal((await f.signIn('changed@example.test', 'changed-temporary-123')).status, 401);
    assert.equal((await f.call('users/' + a.id, f.admin.token, 'DELETE', { client_id: 'a' })).status, 500);
    assert.equal((await f.call('me', a.token)).status, 200);
  } finally { f.sqlite.close(); }
});
