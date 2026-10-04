import test from 'node:test';
import assert from 'node:assert/strict';
import router from './site-router.mjs';

test('aliases redirect to the canonical domain with path and query intact', async () => {
  for (const host of ['www.petruandines.com','petruandines-site.pages.dev','hash.petruandines-site.pages.dev']) {
    const response = await router.fetch(new Request('https://' + host + '/portal/?view=calendar'), {});
    assert.equal(response.status,301);
    assert.equal(response.headers.get('location'),'https://petruandines.com/portal/?view=calendar');
  }
});

test('canonical assets, 404 and portal protection headers are preserved', async () => {
  let calls=0;
  const env = {ASSETS:{fetch:async request => {
    calls++;
    return new Response('asset', {status:request.url.endsWith('/missing') ? 404 : 200});
  }}};
  const portal = await router.fetch(new Request('https://petruandines.com/portal/'), env);
  assert.equal(portal.status,200);
  assert.equal(await portal.text(),'asset');
  assert.equal(portal.headers.get('cache-control'),'no-store');
  assert.equal(portal.headers.get('x-frame-options'),'DENY');
  const missing = await router.fetch(new Request('https://petruandines.com/missing'),env);
  assert.equal(missing.status,404);
  const unrelated = await router.fetch(new Request('https://attacker.example/'),env);
  assert.equal(unrelated.status,404);
  assert.equal(calls,2);
});

test('old paths redirect once to their canonical destination', async () => {
  for (const [path,target] of [['/cleaning-services/portal/','/portal/'],['/portal-v2-frontend/','/portal/'],['/cleaning-services','/']]) {
    const response = await router.fetch(new Request('https://petruandines.com' + path),{});
    assert.equal(response.status,301);
    assert.equal(response.headers.get('location'),'https://petruandines.com' + target);
  }
});
