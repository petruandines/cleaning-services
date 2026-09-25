import assert from 'node:assert/strict';
import test from 'node:test';
import { assertChoice, assertFiles, assertSchema, queryRows } from '../scripts/upgrade-phone.mjs';

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
  assert.throws(() => assertChoice('apply', 'APPLY PORTAL UPGRADE 6816004b-dc95-48c9-be52-9bd4131d157e'), /backup confirmation/);
  assertChoice('apply', 'APPLY PORTAL UPGRADE 6816004b-dc95-48c9-be52-9bd4131d157e',
    'BACKUP VERIFIED 6816004b-dc95-48c9-be52-9bd4131d157e');
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
