import test from 'node:test';
import assert from 'node:assert/strict';
import { assertChoice } from '../scripts/deploy-cascade-delete-worker.mjs';

const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';

test('cascade-delete Worker deployment requires exact operation and confirmation', () => {
  assert.doesNotThrow(() => assertChoice('inspect', ''));
  assert.doesNotThrow(() => assertChoice('deploy', `UPDATE PORTAL CASCADE DELETE ${UUID}`));
  assert.throws(() => assertChoice('inspect', 'anything'));
  assert.throws(() => assertChoice('deploy', `UPDATE PORTAL CASCADE DELETE wrong`));
  assert.throws(() => assertChoice('apply', `UPDATE PORTAL CASCADE DELETE ${UUID}`));
});
