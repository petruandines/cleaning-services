import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertChoice, assertEmpty, assertMigrated, assertMigrationFiles, tableNames,
} from '../scripts/migrate-phone.mjs';
import { parseWranglerJson } from '../scripts/verify-remote-d1.mjs';

test('phone migration requires an exact apply confirmation and locked SQL', () => {
  assertChoice('inspect', '');
  assert.throws(() => assertChoice('apply', ''), /exact database confirmation/);
  assert.throws(() => assertChoice('apply', 'APPLY 6816004b-dc95-48c9-be52-9bd4131d157f'), /exact database confirmation/);
  assertChoice('apply', 'APPLY 6816004b-dc95-48c9-be52-9bd4131d157e');
  assertMigrationFiles();
});

test('phone migration refuses an existing schema or an invalid D1 response', () => {
  assert.deepEqual(tableNames('[{"results":[],"success":true}]'), []);
  const internalOnly = tableNames(JSON.stringify([{success:true, results:[
    {name:'_cf_METADATA'}, {name:'_cf_KV'},
  ]}]));
  assert.deepEqual(internalOnly, []);
  assertEmpty(internalOnly);
  for (const name of ['clients', 'd1_migrations', '_cf_UNRECOGNIZED']) {
    assert.throws(() => assertEmpty(tableNames(JSON.stringify([{success:true,results:[
      {name:'_cf_METADATA'}, {name:'_cf_KV'}, {name},
    ]}]))), /not empty/);
  }
  assert.throws(() => tableNames('[{"results":[],"success":false}]'), /Unexpected D1/);
  assert.deepEqual(parseWranglerJson("Proxy environment variables detected. We'll use your proxy for fetch requests.\n{\"uuid\":\"test\"}"), {uuid:'test'});
});

test('phone migration verifies the complete resulting schema', () => {
  const tables = [
    'account', 'appointments', 'audit_events', 'client_users', 'clients',
    'd1_migrations', 'jobs', 'locations', 'messages', 'payments',
    'portal_accounts', 'rateLimit', 'session', 'twoFactor', 'user', 'verification',
  ];
  assertMigrated(tableNames(JSON.stringify([{success:true,results:[
    {name:'_cf_KV'}, ...tables.map(name => ({name})), {name:'_cf_METADATA'},
  ]}])));
  assert.throws(() => assertMigrated(tables.slice(1)), /differs/);
});
