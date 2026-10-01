import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { assertChoice, assertFiles, assertVersion } from '../scripts/upgrade-contract-phone.mjs';

const files = ['0001_app_schema.sql', '0002_auth.sql', '0003_portal_accounts.sql',
  '0004_location_contact.sql', '0005_soft_delete.sql', '0006_invoice_client_notes.sql',
  '0007_client_contract.sql'];

test('contract migration requires exact operation, identity and seven pinned files', () => {
  assertChoice('inspect', '');
  assert.throws(() => assertChoice('inspect', 'APPLY'), /empty/);
  assert.throws(() => assertChoice('apply', ''), /exact D1/);
  assert.throws(() => assertChoice('apply', 'APPLY PORTAL CONTRACT 6816004b-dc95-48c9-be52-9bd4131d157e'), /recovery/);
  assertChoice('apply', 'APPLY PORTAL CONTRACT 6816004b-dc95-48c9-be52-9bd4131d157e',
    'TIME TRAVEL VERIFIED 6816004b-dc95-48c9-be52-9bd4131d157e');
  assertFiles();
});

test('contract migration preserves clients, nullable details and previous schema', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  const snapshot = () => ({
    tables: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map(row => row.name),
    migrations: db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(row => row.name),
    columns: Object.fromEntries(['clients', 'locations', 'appointments', 'jobs', 'payments', 'messages']
      .map(name => [name, db.prepare(`PRAGMA table_info(${name})`).all().map(row => row.name)])),
  });
  for (const [index, file] of files.slice(0, 6).entries()) {
    db.exec(readFileSync(new URL('../../docs/portal-v2/' + file, import.meta.url), 'utf8'));
    db.prepare('INSERT INTO d1_migrations (id,name) VALUES (?,?)').run(index + 1, file);
  }
  const at = '2026-09-27T10:00:00Z';
  db.prepare('INSERT INTO clients (id,kind,display_name,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run('kept', 'PJ', 'Client păstrat', at, at);
  assertVersion(snapshot());
  assert.throws(() => assertVersion(snapshot(), true), /history/);
  db.exec(readFileSync(new URL('../../docs/portal-v2/0007_client_contract.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO d1_migrations (id,name) VALUES (?,?)').run(7, files[6]);
  assertVersion(snapshot(), true);
  assert.throws(() => assertVersion(snapshot()), /history/);
  assert.deepEqual({ ...db.prepare('SELECT display_name, billing_type, contract_rate_bani, manager_email FROM clients WHERE id = ?')
    .get('kept') }, { display_name: 'Client păstrat', billing_type: null, contract_rate_bani: null, manager_email: null });
  assert.throws(() => db.prepare('UPDATE clients SET billing_type = ? WHERE id = ?').run('unknown', 'kept'), /CHECK/);
  db.close();
});
