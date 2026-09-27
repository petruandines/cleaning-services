/** Restore the reviewed encrypted backup ONLY into a separate, empty EU D1. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveDigest, decodeKey } from './backup-remote-phone.mjs';
import { assertFiles, assertVersion } from './upgrade-fields-phone.mjs';
import { tableNames } from './migrate-phone.mjs';
import { parseWranglerJson } from './verify-remote-d1.mjs';
import { queryRows } from './upgrade-phone.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROD_UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';
const TEST_NAME = 'petru-ines-restore-test-eu';
const TEST_UUID = 'bf95f2d5-04a9-47e4-abfc-755ba05cf122';
const EXPECTED_SHA = '9f57064178c22bf39c733b27e57a862e0e30ff3d6350c57a29c6218642cd49b8';
const TABLES = ['account', 'appointments', 'audit_events', 'client_users', 'clients',
  'd1_migrations', 'jobs', 'locations', 'messages', 'payments',
  'portal_accounts', 'rateLimit', 'session', 'twoFactor', 'user', 'verification'];

export function assertRequest(operation, confirmation, uuid, env) {
  if (!['inspect', 'restore'].includes(operation)) throw new Error('Unknown recovery operation');
  if (uuid !== TEST_UUID || uuid === PROD_UUID)
    throw new Error('Recovery requires the fixed, reviewed test D1 UUID; production is forbidden');
  if (operation === 'inspect' && confirmation) throw new Error('Inspect confirmation must be empty');
  if (operation === 'restore' && confirmation !== `RESTORE INTO TEST D1 ${uuid}`)
    throw new Error('Restore requires exact test database confirmation');
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'petruandines/cleaning-services' ||
      env.GITHUB_REF !== 'refs/heads/main' || env.CLOUDFLARE_ACCOUNT_ID !== '47b9f8498a9865c0fbbaca8f0f5cf59d' ||
      !env.CLOUDFLARE_API_TOKEN) throw new Error('Wrong repository, branch, Cloudflare account or missing token');
}

export function assertTarget(info, uuid) {
  if (info?.uuid !== uuid || info?.uuid === PROD_UUID || info?.name !== TEST_NAME || info?.jurisdiction !== 'eu')
    throw new Error('Recovery D1 UUID, name or EU jurisdiction mismatch');
}

export function assertEmpty(rows) {
  const names = rows.map(row => row.name);
  if (names.some(name => typeof name !== 'string') || tableNames(JSON.stringify([{ success: true, results: rows }])).length)
    throw new Error('Recovery D1 has application tables; refuse to overwrite data');
}

export function assertCounts(actual, expected) {
  if (JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(TABLES) ||
      JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(TABLES) ||
      TABLES.some(name => !Number.isSafeInteger(actual[name]) || actual[name] < 0 || actual[name] !== expected[name]))
    throw new Error('Restored D1 table counts differ from the authenticated backup');
}

function command(wrangler, args, timeout = 120000) {
  try {
    return execFileSync(process.execPath, [wrangler, 'd1', ...args], {
      cwd: ROOT, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    // Never print Wrangler output: a failed import could quote client data.
    throw new Error('Recovery D1 command failed; inspect test target before any retry');
  }
}

export function run(operation, confirmation, uuid, env = process.env) {
  assertRequest(operation, confirmation, uuid, env);
  assertFiles();
  const original = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8'));
  if (original.d1_databases?.length !== 1 || original.d1_databases[0].database_id !== PROD_UUID)
    throw new Error('Production binding differs from reviewed code; stop');
  const runnerTemp = env.RUNNER_TEMP && resolve(env.RUNNER_TEMP);
  if (!runnerTemp || runnerTemp === ROOT || runnerTemp.startsWith(ROOT + '/'))
    throw new Error('Private runner temp directory required');
  const archive = join(runnerTemp, 'restore-artifact', 'portal-d1-backup.pi-d1');
  if (!existsSync(archive) || archiveDigest(archive) !== EXPECTED_SHA)
    throw new Error('Encrypted source artifact missing or SHA-256 mismatch');
  const privateDir = mkdtempSync(join(runnerTemp, 'portal-remote-restore-'));
  try {
    const config = join(privateDir, 'wrangler.jsonc');
    writeFileSync(config, JSON.stringify({ name: 'pi-restore-test-only', main: join(ROOT, 'src', 'index.mjs'),
      compatibility_date: '2026-09-24', d1_databases: [{ binding: 'RESTORE_TEST',
        database_name: TEST_NAME, database_id: uuid, jurisdiction: 'eu' }] }), { mode: 0o600 });
    const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const base = ['execute', TEST_NAME, '--remote', '--config', config];
    const identity = parseWranglerJson(command(wrangler, ['info', TEST_NAME, '--json', '--config', config]));
    assertTarget(identity, uuid);
    const query = sql => queryRows(command(wrangler, [...base, '--json', '--command', sql]));
    const tableQuery = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name";
    assertEmpty(query(tableQuery));
    process.stdout.write('Verified distinct EU recovery D1 identity, empty application schema and exact encrypted artifact. No remote writes.\n');
    if (operation === 'inspect') return;

    const key = decodeKey(env.PORTAL_BACKUP_KEY_HEX);
    const keyFile = join(privateDir, 'key');
    const sqlFile = join(privateDir, 'backup.sql');
    try {
      writeFileSync(keyFile, key, { mode: 0o600 });
      const vault = join(ROOT, 'scripts', 'd1_vault.py');
      const { PORTAL_BACKUP_KEY_HEX: _excluded, ...safeEnv } = env;
      execFileSync('python3', [vault, 'decrypt', '--input', archive, '--out', sqlFile, '--key', keyFile],
        { cwd: ROOT, env: safeEnv, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
      const expected = JSON.parse(execFileSync('python3', [vault, 'counts', '--input', sqlFile],
        { cwd: ROOT, env: safeEnv, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }));
      // The explicit --config points only to the just-verified, distinct UUID.
      command(wrangler, [...base, '--file', sqlFile], 300000);
      const actualTables = tableNames(JSON.stringify([{ success: true, results: query(tableQuery) }]));
      if (JSON.stringify(actualTables) !== JSON.stringify(TABLES))
        throw new Error('Restored test D1 schema differs from portal schema');
      const actual = Object.fromEntries(TABLES.map(name => [name,
        query(`SELECT count(*) AS total FROM "${name}"`)[0]?.total]));
      assertCounts(actual, expected);
      const history = query('SELECT name FROM d1_migrations ORDER BY id').map(row => row.name);
      const columns = Object.fromEntries(['clients', 'locations', 'appointments', 'jobs', 'payments', 'messages'].map(name =>
        [name, query(`PRAGMA table_info("${name}")`).map(row => row.name)]));
      assertVersion({ tables: actualTables, migrations: history, columns }, true);
      if (query('PRAGMA quick_check')[0]?.quick_check !== 'ok' || query('PRAGMA foreign_key_check').length)
        throw new Error('Restored test D1 failed integrity or foreign key check');
      process.stdout.write('Remote recovery test passed: distinct EU D1, schema 0006, table counts, quick_check and foreign keys. Production D1 unchanged.\n');
    } catch (error) {
      // Child process exceptions may include command arguments or SQL. Use only
      // fixed error messages emitted above, never the raw subprocess output.
      if (error.message.startsWith('Restored ') || error.message.startsWith('Recovery D1 ')) throw error;
      throw new Error('Recovery test failed; inspect the distinct test D1 before retrying');
    } finally { key.fill(0); }
  } finally { rmSync(privateDir, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv[2], process.argv[3], process.argv[4]); }
  catch (error) { process.stderr.write(`Stopped: ${error.message}. Production D1 was not written.\n`); process.exitCode = 1; }
}
