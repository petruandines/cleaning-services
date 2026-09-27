import test from 'node:test';
import assert from 'node:assert/strict';
import { assertChoice } from '../scripts/deploy-contract-worker-phone.mjs';

test('contract Worker deploy keeps exact operation and confirmation guard', () => {
  assertChoice('inspect', '');
  assert.throws(() => assertChoice('inspect', 'something'), /empty/);
  assert.throws(() => assertChoice('deploy', ''), /exact confirmation/);
  assert.throws(() => assertChoice('deploy', 'UPDATE PORTAL CONTRACT 6816004b-dc95-48c9-be52-9bd4131d157f'), /exact confirmation/);
  assertChoice('deploy', 'UPDATE PORTAL CONTRACT 6816004b-dc95-48c9-be52-9bd4131d157e');
});
