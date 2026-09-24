import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';

test('login popup may post on its own origin; unrelated browser origin is rejected', async () => {
  const base = 'https://portal.example.workers.dev/api/auth/sign-in/email';
  const self = await worker.fetch(new Request(base, {
    method: 'OPTIONS', headers: { Origin: 'https://portal.example.workers.dev' },
  }), {});
  const foreign = await worker.fetch(new Request(base, {
    method: 'OPTIONS', headers: { Origin: 'https://attacker.example' },
  }), {});
  const pagesLogin = await worker.fetch(new Request(base, {
    method: 'OPTIONS', headers: { Origin: 'https://petruandines.github.io' },
  }), {});
  const pagesLogout = await worker.fetch(new Request('https://portal.example.workers.dev/api/auth/sign-out', {
    method: 'OPTIONS', headers: { Origin: 'https://petruandines.github.io' },
  }), {});
  assert.equal(self.status, 204);
  assert.equal(foreign.status, 403);
  assert.equal(pagesLogin.status, 403);
  assert.equal(pagesLogout.status, 204);
});
