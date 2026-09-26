import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { assertChoice, assertFiles, assertVersion } from '../scripts/upgrade-fields-phone.mjs';

test('fields upgrade accepts only exact confirmation, recovery and six pinned files', () => {
  assertChoice('inspect', '');
  assert.throws(() => assertChoice('inspect', 'APPLY'), /empty/);
  assert.throws(() => assertChoice('apply', ''), /exact D1/);
  assert.throws(() => assertChoice('apply', 'APPLY PORTAL FIELDS 6816004b-dc95-48c9-be52-9bd4131d157e'), /recovery/);
  assertChoice('apply', 'APPLY PORTAL FIELDS 6816004b-dc95-48c9-be52-9bd4131d157e',
    'TIME TRAVEL VERIFIED 6816004b-dc95-48c9-be52-9bd4131d157e');
  assertFiles();
});

test('migration 0006 retains existing records and requires exact version transition', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  const files = ['0001_app_schema.sql', '0002_auth.sql', '0003_portal_accounts.sql',
    '0004_location_contact.sql', '0005_soft_delete.sql', '0006_invoice_client_notes.sql'];
  const snapshot = () => ({
    tables: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name),
    migrations: db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(row => row.name),
    columns: Object.fromEntries(['clients', 'locations', 'appointments', 'jobs', 'payments', 'messages']
      .map(name => [name, db.prepare(`PRAGMA table_info(${name})`).all().map(row => row.name)])),
  });
  for (const [index, file] of files.slice(0, 5).entries()) {
    db.exec(readFileSync(new URL('../../docs/portal-v2/' + file, import.meta.url), 'utf8'));
    db.prepare('INSERT INTO d1_migrations (id,name) VALUES (?,?)').run(index + 1, file);
  }
  const at = '2026-09-26T20:00:00Z';
  db.prepare('INSERT INTO clients (id,kind,display_name,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run('kept', 'PF', 'Rămâne', at, at);
  assertVersion(snapshot());
  assert.throws(() => assertVersion(snapshot(), true), /history/);
  db.exec(readFileSync(new URL('../../docs/portal-v2/0006_invoice_client_notes.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO d1_migrations (id,name) VALUES (?,?)').run(6, files[5]);
  assertVersion(snapshot(), true);
  assert.throws(() => assertVersion(snapshot()), /history/);
  const kept = db.prepare('SELECT display_name, internal_note FROM clients WHERE id = ?').get('kept');
  assert.equal(kept.display_name, 'Rămâne');
  assert.equal(kept.internal_note, null);
  db.close();
});
