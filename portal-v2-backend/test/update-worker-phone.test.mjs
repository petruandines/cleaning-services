import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertChoice, assertExistingWorker, verifyUpgradedWorker } from '../scripts/update-worker-phone.mjs';
import { assertTarget } from '../scripts/deploy-phone.mjs';
import { assertFiles, assertSchema } from '../scripts/upgrade-phone.mjs';

test('Worker update requires exact consent and an empty inspect confirmation', () => {
  assertChoice('inspect', '');
  assert.throws(() => assertChoice('inspect', 'UPDATE petru-ines-portal-api'), /empty/);
  assert.throws(() => assertChoice('deploy', ''), /exact confirmation/);
  assert.throws(() => assertChoice('deploy', 'UPDATE other 6816004b-dc95-48c9-be52-9bd4131d157e'), /exact confirmation/);
  assertChoice('deploy', 'UPDATE petru-ines-portal-api 6816004b-dc95-48c9-be52-9bd4131d157e');
  assert.throws(() => assertChoice('apply', ''), /Unknown/);
});

test('Worker update requires an existing Worker on the exact subdomain', () => {
  const subdomain = { success: true, result: { subdomain: 'petruandines' } };
  const listing = { success: true, result: [{ id: 'petru-ines-portal-api' }] };
  assertExistingWorker(subdomain, listing);
  assert.throws(() => assertExistingWorker(subdomain, { success: true, result: [] }), /not found/);
  assert.throws(() => assertExistingWorker(subdomain, { success: true, result: [...listing.result, ...listing.result] }), /not found/);
  assert.throws(() => assertExistingWorker({ success: true, result: { subdomain: 'other' } }, listing), /subdomain/);
  assert.throws(() => assertExistingWorker(subdomain, { ...listing, result_info: { total_count: 4 } }), /Incomplete/);
});

test('Worker update retains reviewed D1 target and exactly five pinned migrations', () => {
  assertTarget(JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')));
  assert.throws(() => assertFiles(), /Unexpected migration files/);
  const tables = ['account', 'appointments', 'audit_events', 'client_users', 'clients',
    'd1_migrations', 'jobs', 'locations', 'messages', 'payments', 'portal_accounts',
    'rateLimit', 'session', 'twoFactor', 'user', 'verification'];
  const entities = ['clients', 'locations', 'appointments', 'jobs', 'payments', 'messages'];
  const columns = Object.fromEntries(entities.map(name => [name,
    ['id', 'deleted_at', ...(name === 'locations' ? ['contact_name', 'contact_phone', 'contact_email'] : [])]]));
  const state = { tables, columns, migrations: ['0001_app_schema.sql', '0002_auth.sql',
    '0003_portal_accounts.sql', '0004_location_contact.sql', '0005_soft_delete.sql'] };
  assertSchema(state, true);
  assert.throws(() => assertSchema({ ...state, migrations: state.migrations.slice(0, 3) }, true), /history/);
  assert.throws(() => assertSchema({ ...state, columns: { ...columns, locations: ['id', 'deleted_at'] } }, true), /contact/);
});

test('public upgrade probe waits for PATCH and DELETE support without credentials', async () => {
  let calls = 0;
  await verifyUpgradedWorker({ attempts: 2, wait: async () => {}, request: async (url, options) => {
    assert.match(url, /\/api\/me$/);
    assert.equal(options.method, 'OPTIONS');
    calls++;
    return { status: 204, headers: new Headers({ 'access-control-allow-methods':
      calls === 1 ? 'GET, POST, OPTIONS' : 'GET, POST, PATCH, DELETE, OPTIONS' }) };
  } });
  assert.equal(calls, 2);
  await assert.rejects(verifyUpgradedWorker({ attempts: 1, request: async () => ({
    status: 204, headers: new Headers({ 'access-control-allow-methods': 'GET, POST, OPTIONS' }),
  }) }), /not visible/);
});
