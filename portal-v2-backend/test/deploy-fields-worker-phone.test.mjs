import assert from 'node:assert/strict';
import test from 'node:test';
import { assertChoice, verifyPublishedFields } from '../scripts/deploy-fields-worker-phone.mjs';

test('fields Worker deployment insists on reviewed operation and confirmation', () => {
  assertChoice('inspect', '');
  assert.throws(() => assertChoice('inspect', 'UPDATE'), /empty/);
  assert.throws(() => assertChoice('deploy', ''), /exact confirmation/);
  assertChoice('deploy', 'UPDATE PORTAL FIELDS 6816004b-dc95-48c9-be52-9bd4131d157e');
});

test('public Worker probe distinguishes the new login from the old version', async () => {
  let calls = 0;
  const request = async url => {
    if (url.includes('/login?')) {
      calls++;
      return { status: 200, text: async () => calls > 1 ? 'am încredere în acest dispozitiv' : 'Autentificare' };
    }
    return { status: 401, json: async () => ({ error: 'unauthorized' }) };
  };
  await verifyPublishedFields({ request, wait: async () => {}, attempts: 2 });
  assert.equal(calls, 2);
  await assert.rejects(verifyPublishedFields({ request: async url => url.includes('/login?') ?
    { status: 200, text: async () => 'Autentificare' } :
    { status: 401, json: async () => ({ error: 'unauthorized' }) }, attempts: 1 }), /not publicly visible/);
});
