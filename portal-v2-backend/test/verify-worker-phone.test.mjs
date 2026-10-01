import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyPublicWorker } from '../scripts/verify-worker-phone.mjs';

test('public Worker verification waits through a fresh route and checks login plus denied API', async () => {
  let waits = 0;
  const request = async url => {
    assert.match(url, /^https:\/\/petru-ines-portal-api\.petruandines\.workers\.dev\//);
    if (waits === 0) return { status: 404 };
    if (url.endsWith('/login')) return { status: 200, text: async () => '<title>Autentificare · Petru & Inés</title>' };
    return { status: 401, json: async () => ({ error: 'unauthorized' }) };
  };
  const result = await verifyPublicWorker({ request, wait: async () => { waits++; }, attempts: 2 });
  assert.deepEqual(result, { login: 200, anonymous: 401 });
  assert.equal(waits, 1);
  await assert.rejects(verifyPublicWorker({ request: async () => ({ status: 404 }), wait: async () => {}, attempts: 1 }), /failed after 1 checks/);
});
