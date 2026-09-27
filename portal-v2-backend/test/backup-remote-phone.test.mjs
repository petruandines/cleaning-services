import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveDigest, assertChoice, assertRunner, assertTarget, decodeKey } from '../scripts/backup-remote-phone.mjs';

const valid = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'petruandines/cleaning-services',
  GITHUB_REF: 'refs/heads/main', CLOUDFLARE_ACCOUNT_ID: '47b9f8498a9865c0fbbaca8f0f5cf59d',
  CLOUDFLARE_API_TOKEN: 'temporary-read-token' };

test('backup workflow accepts only inspect or exact one-time export', () => {
  assert.doesNotThrow(() => assertChoice('inspect', ''));
  assert.throws(() => assertChoice('inspect', 'EXPORT PORTAL BACKUP 6816004b-dc95-48c9-be52-9bd4131d157e'));
  assert.throws(() => assertChoice('export', ''));
  assert.throws(() => assertChoice('apply', ''));
  assert.doesNotThrow(() => assertChoice('export', 'EXPORT PORTAL BACKUP 6816004b-dc95-48c9-be52-9bd4131d157e'));
});

test('backup refuses other repository, branch, account and malformed key', () => {
  assert.doesNotThrow(() => assertRunner(valid));
  for (const [field, value] of [['GITHUB_REPOSITORY', 'other/repo'], ['GITHUB_REF', 'refs/heads/test'],
    ['CLOUDFLARE_ACCOUNT_ID', 'other'], ['CLOUDFLARE_API_TOKEN', '']]) {
    assert.throws(() => assertRunner({ ...valid, [field]: value }));
  }
  const key = decodeKey('A1'.repeat(32));
  assert.equal(key.length, 32);
  assert.throws(() => decodeKey('A1'.repeat(31)));
  assert.throws(() => decodeKey('g1'.repeat(32)));
  key.fill(0);
});

test('backup refuses a changed database UUID, name or migration directory', () => {
  const expected = { database_id: '6816004b-dc95-48c9-be52-9bd4131d157e',
    database_name: 'petru-ines-portal-eu', migrations_dir: '../docs/portal-v2' };
  assert.doesNotThrow(() => assertTarget({ expected }));
  for (const [field, value] of [['database_id', '00000000-0000-4000-8000-000000000001'],
    ['database_name', 'other'], ['migrations_dir', 'other']]) {
    assert.throws(() => assertTarget({ expected: { ...expected, [field]: value } }));
  }
});

test('backup digest streams the actual encrypted artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portal-backup-digest-'));
  try {
    const path = join(dir, 'archive');
    const content = Buffer.alloc(2 * 1024 * 1024 + 31, 0xA5);
    writeFileSync(path, content);
    assert.equal(archiveDigest(path), createHash('sha256').update(content).digest('hex'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
