import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCounts, assertEmpty, assertRequest, assertTarget } from '../scripts/restore-remote-phone.mjs';

const uuid = 'bf95f2d5-04a9-47e4-abfc-755ba05cf122';
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'petruandines/cleaning-services',
  GITHUB_REF: 'refs/heads/main', CLOUDFLARE_ACCOUNT_ID: '47b9f8498a9865c0fbbaca8f0f5cf59d',
  CLOUDFLARE_API_TOKEN: 'test-only' };

test('remote recovery refuses production UUID, unapproved context and mistaken confirmation', () => {
  assert.doesNotThrow(() => assertRequest('inspect', '', uuid, env));
  assert.doesNotThrow(() => assertRequest('restore', `RESTORE INTO TEST D1 ${uuid}`, uuid, env));
  for (const bad of ['', '6816004b-dc95-48c9-be52-9bd4131d157e',
    '00000000-0000-4000-8000-000000000008', 'not-a-uuid'])
    assert.throws(() => assertRequest('inspect', '', bad, env));
  assert.throws(() => assertRequest('restore', '', uuid, env));
  assert.throws(() => assertRequest('inspect', `RESTORE INTO TEST D1 ${uuid}`, uuid, env));
  assert.throws(() => assertRequest('apply', '', uuid, env));
  for (const key of ['GITHUB_REPOSITORY', 'GITHUB_REF', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])
    assert.throws(() => assertRequest('inspect', '', uuid, { ...env, [key]: key === 'CLOUDFLARE_API_TOKEN' ? '' : 'wrong' }));
});

test('recovery demands exact test D1 name, UUID and EU jurisdiction', () => {
  const info = { uuid, name: 'petru-ines-restore-test-eu', jurisdiction: 'eu' };
  assert.doesNotThrow(() => assertTarget(info, uuid));
  for (const [key, value] of [['uuid', '6816004b-dc95-48c9-be52-9bd4131d157e'],
    ['name', 'petru-ines-portal-eu'], ['jurisdiction', 'us']])
    assert.throws(() => assertTarget({ ...info, [key]: value }, uuid));
});

test('internal Cloudflare tables are allowed, but a real test table blocks restore', () => {
  assert.doesNotThrow(() => assertEmpty([{ name: '_cf_KV' }, { name: '_cf_METADATA' }]));
  assert.throws(() => assertEmpty([{ name: '_cf_KV' }, { name: 'clients' }]));
  assert.throws(() => assertEmpty([{ name: 12 }]));
});

test('all 16 restored table counts must equal authenticated backup', () => {
  const names = ['account', 'appointments', 'audit_events', 'client_users', 'clients',
    'd1_migrations', 'jobs', 'locations', 'messages', 'payments',
    'portal_accounts', 'rateLimit', 'session', 'twoFactor', 'user', 'verification'];
  const expected = Object.fromEntries(names.map(name => [name, name === 'clients' ? 2 : 0]));
  assert.doesNotThrow(() => assertCounts(expected, expected));
  assert.throws(() => assertCounts({ ...expected, clients: 1 }, expected));
  const { clients: _removed, ...missing } = expected;
  assert.throws(() => assertCounts(missing, expected));
});
