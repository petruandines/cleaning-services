import test from 'node:test';
import assert from 'node:assert/strict';
import { assertChoice } from '../scripts/deploy-messages-worker-phone.mjs';

test('messages update requires its own exact confirmation and refuses inspect confirmations', () => {
  assert.doesNotThrow(() => assertChoice('inspect', ''));
  assert.throws(() => assertChoice('inspect', 'UPDATE PORTAL MESSAGES 6816004b-dc95-48c9-be52-9bd4131d157e'));
  assert.throws(() => assertChoice('deploy', 'UPDATE PORTAL FIELDS 6816004b-dc95-48c9-be52-9bd4131d157e'));
  assert.throws(() => assertChoice('deploy', 'UPDATE PORTAL MESSAGES another-database'));
  assert.doesNotThrow(() => assertChoice('deploy', 'UPDATE PORTAL MESSAGES 6816004b-dc95-48c9-be52-9bd4131d157e'));
  assert.throws(() => assertChoice('apply', ''));
});
