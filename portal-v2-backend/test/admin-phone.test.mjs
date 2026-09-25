import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { assertChoice, assertCreated, assertInitialState, d1Sql } from '../scripts/admin-phone.mjs';

const email = 'owner@example.test';
const migrations = [
  { name: '0001_app_schema.sql' }, { name: '0002_auth.sql' },
  { name: '0003_portal_accounts.sql' },
];
const empty = Object.fromEntries([
  'account', 'appointments', 'audit_events', 'client_users', 'clients', 'jobs',
  'locations', 'messages', 'payments', 'portal_accounts', 'rateLimit', 'session',
  'twoFactor', 'user', 'verification',
].map(table => [table, 0]));

test('manual admin bootstrap requires the precise operation, UUID and email', () => {
  assertChoice('inspect', '', email);
  assert.throws(() => assertChoice('apply', '', email), /Unknown operation/);
  assert.throws(() => assertChoice('create', '', email), /exact UUID/);
  assert.throws(() => assertChoice('create', 'CREATE ADMIN 6816004b-dc95-48c9-be52-9bd4131d157e attacker@example.test', email), /exact UUID/);
  assert.throws(() => assertChoice('inspect', '', 'owner@example.test\n'), /email/);
  assertChoice('create', 'CREATE ADMIN 6816004b-dc95-48c9-be52-9bd4131d157e owner@example.test', email);
});

test('only the three reviewed migrations and entirely empty data pass inspection', () => {
  assertInitialState(empty, migrations);
  for (const table of Object.keys(empty)) {
    assert.throws(() => assertInitialState({ ...empty, [table]: 1 }, migrations), /data/);
  }
  assert.throws(() => assertInitialState(empty, migrations.slice(0, 2)), /history/);
  assert.throws(() => assertInitialState(empty, [{ name: 'wrong.sql' }, ...migrations.slice(1)]), /history/);
  assert.throws(() => assertInitialState({ ...empty, user: undefined }, migrations), /data/);
});

test('generated admin inserts import without nested transaction and verify exactly one credential', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portal-admin-phone-test-'));
  const db = new DatabaseSync(':memory:');
  try {
    const file = join(dir, 'admin.sql');
    const password = 'test-only-bootstrap-password-123';
    const result = spawnSync(process.execPath, [new URL('../scripts/bootstrap-admin.mjs', import.meta.url).pathname,
      '--email', email, '--name', 'Petru & Inés', '--out', file],
    { input: `${password}\n`, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const sql = d1Sql(readFileSync(file, 'utf8'));
    assert.ok(!sql.includes('BEGIN TRANSACTION') && !sql.includes('COMMIT;'));
    assert.ok(!sql.includes(password));
    db.exec(readFileSync(new URL('../../docs/portal-v2/0002_auth.sql', import.meta.url), 'utf8'));
    db.exec('BEGIN TRANSACTION;');
    db.exec(sql);
    db.exec('COMMIT;');
    const row = db.prepare('SELECT u.email, u.role, a.providerId, CASE WHEN length(a.password) > 0 THEN 1 ELSE 0 END AS hasPassword FROM "user" u JOIN "account" a ON a.userId = u.id').all();
    assertCreated({ ...empty, user: 1, account: 1 }, row, email);
    assert.throws(() => assertCreated({ ...empty, user: 1, account: 1, clients: 1 }, row, email), /manual review/);
    assert.throws(() => d1Sql('DELETE FROM "user";'), /Unexpected/);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
