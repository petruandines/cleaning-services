import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { assertChoice, assertFiles, assertSchema, queryRows, readBookmark } from '../scripts/upgrade-phone.mjs';

const tables = [
  'account', 'appointments', 'audit_events', 'client_users', 'clients',
  'd1_migrations', 'jobs', 'locations', 'messages', 'payments',
  'portal_accounts', 'rateLimit', 'session', 'twoFactor', 'user', 'verification',
].sort();
const names = ['0001_app_schema.sql', '0002_auth.sql', '0003_portal_accounts.sql',
  '0004_location_contact.sql', '0005_soft_delete.sql'];
const entities = ['clients', 'locations', 'appointments', 'jobs', 'payments', 'messages'];
const state = upgraded => ({ tables: [...tables], migrations: names.slice(0, upgraded ? 5 : 3),
  columns: Object.fromEntries(entities.map(table => [table, upgraded ?
    ['id', 'deleted_at', ...(table === 'locations' ? ['contact_name', 'contact_phone', 'contact_email'] : [])] : ['id']])) });

test('upgrade requires precise operation, exact UUID confirmation and five pinned migrations', () => {
  assertChoice('inspect', '');
  assert.throws(() => assertChoice('inspect', 'APPLY'), /empty/);
  assert.throws(() => assertChoice('apply', ''), /exact database confirmation/);
  assert.throws(() => assertChoice('apply', 'APPLY PORTAL UPGRADE 6816004b-dc95-48c9-be52-9bd4131d157f'), /exact database confirmation/);
  assert.throws(() => assertChoice('apply', 'APPLY PORTAL UPGRADE 6816004b-dc95-48c9-be52-9bd4131d157e'), /Time Travel recovery/);
  assertChoice('apply', 'APPLY PORTAL UPGRADE 6816004b-dc95-48c9-be52-9bd4131d157e',
    'TIME TRAVEL VERIFIED 6816004b-dc95-48c9-be52-9bd4131d157e');
  assertFiles();
});

test('upgrade refuses unexpected or partially migrated remote schema', () => {
  assertSchema(state(false));
  assertSchema(state(true), true);
  assert.throws(() => assertSchema(state(true)), /migration history/);
  assert.throws(() => assertSchema(state(false), true), /migration history/);
  const partial = state(false);
  partial.columns.locations.push('contact_name');
  assert.throws(() => assertSchema(partial), /location contact/);
  const unknown = state(false);
  unknown.tables.push('customer_data');
  assert.throws(() => assertSchema(unknown), /differs/);
  const missing = state(false);
  missing.migrations.pop();
  assert.throws(() => assertSchema(missing), /history/);
  const archived = state(false);
  archived.columns.messages.push('deleted_at');
  assert.throws(() => assertSchema(archived), /columns/);
});

test('remote query response must contain one successful D1 result', () => {
  assert.deepEqual(queryRows('[{"success":true,"results":[{"name":"clients"}]}]'), [{name: 'clients'}]);
  for (const value of ['[]', '[{"success":false,"results":[]}]', '[{"success":true}]',
    '[{"success":true,"results":[]},{"success":true,"results":[]}]']) {
    assert.throws(() => queryRows(value), /Unexpected remote D1/);
  }
});

test('Time Travel recovery bookmark is strictly validated', () => {
  const bookmark = '00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683';
  assert.equal(readBookmark(JSON.stringify({bookmark})), bookmark);
  for (const value of ['{}', '{"bookmark":"invalid"}', '{"bookmark":null}'])
    assert.throws(() => readBookmark(value), /bookmark is unavailable/);
});

test('initial schema upgrades to the reviewed columns without losing records', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)');
  const sql = name => readFileSync(new URL('../../docs/portal-v2/' + name, import.meta.url), 'utf8');
  for (const name of names.slice(0, 3)) {
    db.exec(sql(name));
    db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
  }
  db.prepare('INSERT INTO clients (id, kind, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('kept', 'PF', 'Păstrat', '2026-09-25T00:00:00Z', '2026-09-25T00:00:00Z');
  const snapshot = () => ({
    tables: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map(row => row.name),
    migrations: db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(row => row.name),
    columns: Object.fromEntries(entities.map(table => [table, db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name)])),
  });
  assertSchema(snapshot());
  for (const name of names.slice(3)) {
    db.exec(sql(name));
    db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
  }
  assertSchema(snapshot(), true);
  assert.equal(db.prepare('SELECT display_name, deleted_at FROM clients WHERE id = ?').get('kept').display_name, 'Păstrat');
  assert.equal(db.prepare('SELECT deleted_at FROM clients WHERE id = ?').get('kept').deleted_at, null);
  db.close();
});
