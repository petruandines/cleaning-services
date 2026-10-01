import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { authOptions } from '../src/auth-options.mjs';

test('bootstrap SQL imports an admin with hashed password and private file mode', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'portal-bootstrap-test-'));
  try {
    const file = join(dir, 'admin.sql');
    const password = 'test-only-bootstrap-password-123';
    const run = spawnSync(process.execPath, [new URL('../scripts/bootstrap-admin.mjs', import.meta.url).pathname,
      '--email', 'owner@example.test', '--name', 'Owner', '--out', file],
    { input: password + '\n', encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const sql = readFileSync(file, 'utf8');
    assert.ok(!sql.includes(password));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('../../docs/portal-v2/0002_auth.sql', import.meta.url), 'utf8'));
    db.exec(sql);
    assert.equal(db.prepare('SELECT role FROM "user" WHERE email = ?').get('owner@example.test').role, 'admin');
    const auth = betterAuth(authOptions({ database: db,
      secret: 'actual-worker-secret-is-independent-of-the-bootstrap-hash',
      baseURL: 'https://portal.example.workers.dev' }));
    const signedIn = await auth.api.signInEmail({ body: { email: 'owner@example.test', password } });
    assert.equal(signedIn.user.email, 'owner@example.test');
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
