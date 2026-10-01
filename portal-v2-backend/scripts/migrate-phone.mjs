/** Manually inspect or apply the three initial D1 migrations from GitHub Actions. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedDatabase, parseWranglerJson, verifyRemoteD1 } from './verify-remote-d1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INTERNAL_D1_TABLES = new Set(['_cf_METADATA', '_cf_KV']);
const MIGRATIONS = Object.freeze({
  '0001_app_schema.sql': '9cd04b2a7825de6330c2298d80f51049e1d9c030321dd09263c34c2dd6a1534f',
  '0002_auth.sql': '0e97e57b5daac492cc0ff859b5951236090ead6a6968bfcaa740408b86f07f66',
  '0003_portal_accounts.sql': 'a5ef4f93d3894270b17140c58b58eb7893b369e152b06cd1d9817edb5bea16e2',
});
const TABLES = [
  'account', 'appointments', 'audit_events', 'client_users', 'clients',
  'd1_migrations', 'jobs', 'locations', 'messages', 'payments',
  'portal_accounts', 'rateLimit', 'session', 'twoFactor', 'user', 'verification',
];

export function assertChoice(operation, confirmation) {
  if (operation !== 'inspect' && operation !== 'apply') {
    throw new Error('Unknown operation');
  }
  if (operation === 'apply' && confirmation !== 'APPLY 6816004b-dc95-48c9-be52-9bd4131d157e') {
    throw new Error('Application requires the exact database confirmation text');
  }
}

export function assertMigrationFiles() {
  const directory = join(ROOT, '..', 'docs', 'portal-v2');
  for (const [name, expectedHash] of Object.entries(MIGRATIONS)) {
    const hash = createHash('sha256')
      .update(readFileSync(join(directory, name))).digest('hex');
    if (hash !== expectedHash) throw new Error(`Migration contents changed: ${name}`);
  }
  if (JSON.stringify(readdirSync(directory).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) !==
      JSON.stringify(Object.keys(MIGRATIONS).sort()))
    throw new Error('Unexpected migration files; use the separate upgrade workflow');
}

export function tableNames(raw) {
  const data = parseWranglerJson(raw);
  if (!Array.isArray(data) || data.length !== 1 || data[0]?.success !== true ||
      !Array.isArray(data[0].results) ||
      data[0].results.some(row => typeof row?.name !== 'string')) {
    throw new Error('Unexpected D1 query response');
  }
  return data[0].results.map(row => row.name)
    .filter(name => !INTERNAL_D1_TABLES.has(name)).sort();
}

export function assertEmpty(names) {
  if (names.length !== 0) throw new Error('Remote D1 is not empty; stop and investigate before any migration');
}

export function assertMigrated(names) {
  if (JSON.stringify(names) !== JSON.stringify([...TABLES].sort())) {
    throw new Error('Remote D1 table list differs from the expected initial schema; inspect the run');
  }
}

function wrangler(wranglerPath, args) {
  return execFileSync(process.execPath, [wranglerPath, 'd1', ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function remoteTables(details) {
  return tableNames(wrangler(details.wrangler, [
    'execute', details.expected.database_name, '--remote', '--json',
    // Only the two known D1 system tables are ignored in tableNames().
    '--command', "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ]));
}

export function run(operation, confirmation) {
  assertChoice(operation, confirmation); // Reject a mistyped apply before contacting Cloudflare.
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== '47b9f8498a9865c0fbbaca8f0f5cf59d' ||
      !process.env.CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare account or token is missing');
  const expected = expectedDatabase(JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')));
  if (expected.database_id !== '6816004b-dc95-48c9-be52-9bd4131d157e' ||
      expected.migrations_dir !== '../docs/portal-v2') throw new Error('Unexpected migration target');
  assertMigrationFiles();
  const details = verifyRemoteD1(); // Recheck the remote UUID, name and EU jurisdiction on every run.
  assertEmpty(remoteTables(details));
  process.stdout.write('Verified remote D1 identity, EU jurisdiction, empty schema and the three pinned SQL files.\n');
  if (operation === 'inspect') return;

  // The CI runner is non-interactive; Wrangler applies tracked migrations in order.
  execFileSync(process.execPath,
    [details.wrangler, 'd1', 'migrations', 'apply', expected.database_name, '--remote'],
    { cwd: ROOT, timeout: 180000, stdio: 'inherit' });
  assertMigrated(remoteTables(details));
  process.stdout.write('Initial D1 migrations applied; expected tables verified. No client data was inserted.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv[2], process.argv[3]); }
  catch (error) {
    process.stderr.write(`Stopped: ${error.message}. No further steps will run.\n`);
    process.exitCode = 1;
  }
}
