import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertDatabaseIdentity, expectedDatabase } from '../scripts/verify-remote-d1.mjs';

test('remote D1 check requires configured UUID, name and EU jurisdiction together', () => {
  const expected = expectedDatabase(JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url))));
  const valid = { uuid: expected.database_id, name: expected.database_name, jurisdiction: 'eu' };
  assert.doesNotThrow(() => assertDatabaseIdentity(valid, expected));
  for (const changed of [
    { uuid: '00000000-0000-4000-8000-000000000000' },
    { name: 'another-database' },
    { jurisdiction: null },
    { jurisdiction: 'us' },
  ]) assert.throws(() => assertDatabaseIdentity({ ...valid, ...changed }, expected));
});
