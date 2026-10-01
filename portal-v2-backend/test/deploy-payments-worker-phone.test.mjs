import test from 'node:test';
import assert from 'node:assert/strict';
import { assertChoice } from '../scripts/deploy-payments-worker-phone.mjs';

test('payments Worker operation keeps exact confirmation guard', () => {
  assertChoice('inspect', '');
  assert.throws(() => assertChoice('inspect', 'anything'), /empty/);
  assert.throws(() => assertChoice('deploy', ''), /exact confirmation/);
  assert.throws(() => assertChoice('deploy', 'UPDATE PORTAL PAYMENTS 6816004b-dc95-48c9-be52-9bd4131d157f'), /exact confirmation/);
  assertChoice('deploy', 'UPDATE PORTAL PAYMENTS 6816004b-dc95-48c9-be52-9bd4131d157e');
});
