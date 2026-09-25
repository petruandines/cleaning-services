import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertChoice, assertCloudflareState, assertTarget } from '../scripts/deploy-phone.mjs';

test('manual Worker deployment requires the exact operation and confirmation', () => {
  assertChoice('inspect', '');
  assert.throws(() => assertChoice('apply', ''), /Unknown operation/);
  assert.throws(() => assertChoice('deploy', ''), /exact Worker confirmation/);
  assert.throws(() => assertChoice('deploy', 'DEPLOY petru-ines-portal-evil'), /exact Worker confirmation/);
  assertChoice('deploy', 'DEPLOY petru-ines-portal-api');
});

test('deployment pins its account, Worker URL, assets and only D1 binding', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assertTarget(config);
  for (const mutate of [
    copy => { copy.name = 'different-worker'; },
    copy => { copy.vars.PUBLIC_API_URL = 'https://unrelated.workers.dev'; },
    copy => { copy.d1_databases[0].database_id = 'wrong-database'; },
    copy => { copy.d1_databases.push({ binding: 'OTHER' }); },
    copy => { copy.assets.directory = './other'; },
  ]) {
    const copy = structuredClone(config);
    mutate(copy);
    assert.throws(() => assertTarget(copy), /target or D1 binding changed|Missing or unexpected project D1 binding/);
  }
});

test('deployment refuses an unknown subdomain, failed listing, or existing Worker', () => {
  const subdomain = { success: true, result: { subdomain: 'petruandines' } };
  const scripts = { success: true, result: [{ id: 'some-other-worker' }] };
  assertCloudflareState(subdomain, scripts);
  assert.throws(() => assertCloudflareState({ success: true, result: { subdomain: 'different' } }, scripts), /subdomain/);
  assert.throws(() => assertCloudflareState(subdomain, { success: false }), /existing Worker names/);
  assert.throws(() => assertCloudflareState(subdomain, { success: true, result: [{ id: 'petru-ines-portal-api' }] }), /already exists/);
  assert.throws(() => assertCloudflareState(subdomain, { success: true, result: [], result_info: { total_count: 2 } }), /Incomplete Worker listing/);
});
