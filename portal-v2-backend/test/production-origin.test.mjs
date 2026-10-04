import test from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN } from '../src/api.mjs';

test('production portal origin is the custom domain', () => {
  assert.equal(ORIGIN, 'https://petruandines.com');
});
