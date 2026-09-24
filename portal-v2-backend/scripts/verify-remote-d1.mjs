/** Read-only Cloudflare D1 identity check; run before any remote migration. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function assertDatabaseIdentity(actual, expected) {
  if (actual?.uuid !== expected.database_id || actual?.name !== expected.database_name ||
      actual?.jurisdiction !== 'eu') {
    throw new Error('Remote D1 UUID, name or EU jurisdiction does not match the project configuration');
  }
}

export function expectedDatabase(config) {
  const databases = config?.d1_databases;
  if (!Array.isArray(databases) || databases.length !== 1 || databases[0]?.binding !== 'DB' ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(databases[0].database_id) ||
      databases[0].database_name !== 'petru-ines-portal-eu') {
    throw new Error('Missing or unexpected project D1 binding');
  }
  return databases[0];
}

export function verifyRemoteD1() {
  const expected = expectedDatabase(JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')));
  const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const raw = execFileSync(process.execPath,
    [wrangler, 'd1', 'info', expected.database_name, '--json'],
    { cwd: ROOT, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  assertDatabaseIdentity(JSON.parse(raw), expected);
  return { expected, wrangler, root: ROOT };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyRemoteD1();
    process.stdout.write('Remote D1 UUID, name and EU jurisdiction confirmed. No data was changed.\n');
  } catch {
    process.stderr.write('Could not verify remote D1. Stop before remote migrations or deploy.\n');
    process.exitCode = 1;
  }
}
