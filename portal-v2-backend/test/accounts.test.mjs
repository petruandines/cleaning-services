import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { authOptions } from '../src/auth-options.mjs';
import { handleApi, ORIGIN } from '../src/api.mjs';
import worker from '../src/index.mjs';

test('admin links a client account; temporary password gate and session rotation', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const path of ['0001_app_schema.sql', '0002_auth.sql', '0003_portal_accounts.sql',
    '0004_location_contact.sql', '0005_soft_delete.sql'])
    sqlite.exec(readFileSync(new URL('../../docs/portal-v2/' + path, import.meta.url), 'utf8'));
  for (const id of ['a', 'b']) {
    sqlite.prepare('INSERT INTO clients (id,kind,display_name,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run(id, 'PF', id, '2026-09-24T10:00:00Z', '2026-09-24T10:00:00Z');
    sqlite.prepare('INSERT INTO locations (id,client_id,label,address,city,county,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run('loc_' + id, id, id, 'Strada Test', 'București', 'București', '2026-09-24T10:00:00Z', '2026-09-24T10:00:00Z');
    sqlite.prepare('INSERT INTO appointments (id,client_id,location_id,starts_at,ends_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run('ap_' + id, id, 'loc_' + id, '2026-09-24T10:00:00Z', '2026-09-24T11:00:00Z', 'confirmed', '2026-09-24T10:00:00Z', '2026-09-24T10:00:00Z');
  }
  const db = {
    prepare(sql) { return { bind(...args) { const statement = sqlite.prepare(sql); return {
      async all() { return { results: statement.all(...args) }; }, async run() { return statement.run(...args); },
    }; } }; },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { for (const statement of statements) await statement.run(); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const base = 'https://portal.example.workers.dev';
  const options = authOptions({ database: sqlite, secret: 'integration-test-secret-at-least-32-bytes', baseURL: base });
  options.emailAndPassword = { ...options.emailAndPassword, disableSignUp: false };
  options.rateLimit = { enabled: false }; // Exercise both failure and success immediately in this fixture.
  const auth = betterAuth(options);
  async function signIn(email, password) {
    const response = await auth.handler(new Request(base + '/api/auth/sign-in/email', {
      method: 'POST', headers: { Origin: base, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10' },
      body: JSON.stringify({ email, password }),
    }));
    return { status: response.status, token: response.headers.get('set-auth-token') };
  }
  const adminEmail = 'admin@example.test', adminPassword = 'safe-admin-password-123';
  await auth.api.signUpEmail({ body: { name: 'Admin test', email: adminEmail, password: adminPassword } });
  sqlite.prepare('UPDATE "user" SET role = ? WHERE email = ?').run('admin', adminEmail);
  const admin = await signIn(adminEmail, adminPassword);
  assert.equal(admin.status, 200);
  assert.ok(admin.token);
  // The preceding integration test covers actual TOTP enrollment and login.
  // This fixture marks the admin verified only after obtaining its session.
  sqlite.prepare('UPDATE "user" SET "twoFactorEnabled" = 1 WHERE email = ?').run(adminEmail);
  async function call(path, token, data, origin = ORIGIN) {
    return handleApi(new Request(base + '/api/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }), { db, auth });
  }

  const tempPassword = 'temporary-client-1234', newPassword = 'changed-client-1234';
  const payload = { client_id: 'a', email: 'client@example.test', name: 'Client Test', password: tempPassword };
  assert.equal((await call('users', admin.token, { ...payload, role: 'admin' })).status, 400);
  const created = await call('users', admin.token, payload);
  assert.equal(created.status, 201, await created.clone().text());
  const id = (await created.json()).id;
  assert.equal(sqlite.prepare('SELECT role FROM "user" WHERE id = ?').get(id).role, 'user');
  assert.equal(sqlite.prepare('SELECT client_id FROM client_users WHERE user_id = ?').get(id).client_id, 'a');
  assert.equal(sqlite.prepare('SELECT must_change_password FROM portal_accounts WHERE user_id = ?').get(id).must_change_password, 1);
  assert.equal((await call('users', admin.token, payload)).status, 409);
  const access = await (await call('users?client_id=a', admin.token)).json();
  assert.deepEqual(access.rows.map(row => row.email), ['client@example.test']);

  const client = await signIn(payload.email, tempPassword);
  assert.equal(client.status, 200);
  assert.equal((await (await call('me', client.token)).json()).mustChangePassword, true);
  assert.equal((await call('appointments', client.token)).status, 403);
  assert.equal((await call('password', client.token, { currentPassword: 'wrong-password', newPassword }, base)).status, 400);
  assert.equal((await call('password', client.token, { currentPassword: tempPassword, newPassword }, ORIGIN)).status, 403);
  const changed = await call('password', client.token, { currentPassword: tempPassword, newPassword }, base);
  assert.equal(changed.status, 200, await changed.clone().text());
  const freshToken = (await changed.json()).token;
  assert.ok(freshToken);
  assert.equal(await auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + client.token }) }), null);
  assert.equal((await (await call('me', freshToken)).json()).mustChangePassword, false);
  assert.deepEqual((await (await call('appointments', freshToken)).json()).rows.map(row => row.id), ['ap_a']);
  assert.equal((await signIn(payload.email, tempPassword)).status, 401);
  assert.equal((await signIn(payload.email, newPassword)).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE actor_user_id = ?').get(id).n, 1);

  sqlite.exec("CREATE TRIGGER reject_new_links BEFORE INSERT ON client_users BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
  const failed = await call('users', admin.token, { ...payload, email: 'retry@example.test' });
  assert.equal(failed.status, 500);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM "user" WHERE email = ?').get('retry@example.test').n, 0);
  assert.equal((await worker.fetch(new Request(base + '/api/auth/admin/create-user', { method: 'POST' }), {})).status, 404);
  sqlite.close();
});
