/** Remote D1 read-only export; encrypted artifact and isolated local restore. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFiles, assertVersion } from './upgrade-payment-locations-phone.mjs';
import { remoteState } from './upgrade-phone.mjs';
import { verifyRemoteD1 } from './verify-remote-d1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';
const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const DATABASE = 'petru-ines-portal-eu';
const CONFIRMATION = `EXPORT PORTAL BACKUP ${UUID}`;

// These are the eleven additive one-time-project tables reviewed in the
// production one-time migrations (0001, 0002, 0003, 0005 and 0006).
// Fail closed if a future schema change is not explicitly reviewed.
export const ONE_TIME_BACKUP_TABLES = Object.freeze([
  'one_time_projects',
  'one_time_project_tasks',
  'one_time_project_access',
  'one_time_project_sessions',
  'one_time_project_activity',
  'one_time_project_rate_limits',
  'one_time_project_passwords',
  'one_time_project_display_options',
  'one_time_project_service_options',
  'one_time_project_reports',
  'one_time_project_report_files',
]);

export function assertOneTimeBackupTables(tables) {
  if (!Array.isArray(tables) || tables.some(name => typeof name !== 'string') ||
      new Set(tables).size !== tables.length) {
    throw new Error('Unexpected or repeated D1 table names');
  }
  const approved = new Set(ONE_TIME_BACKUP_TABLES);
  if (ONE_TIME_BACKUP_TABLES.some(name => !tables.includes(name))) {
    throw new Error('Required one-time project backup tables are missing');
  }
  // The existing nine-migration validator still checks the entire legacy
  // schema, columns and history and rejects ALL other extra tables.
  return tables.filter(name => !approved.has(name));
}

export function assertChoice(operation, confirmation) {
  if (!['inspect', 'export'].includes(operation)) throw new Error('Unknown backup operation');
  if (operation === 'inspect' && confirmation) throw new Error('Inspect confirmation must be empty');
  if (operation === 'export' && confirmation !== CONFIRMATION)
    throw new Error('Backup export requires the exact confirmation');
}

export function assertRunner(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'petruandines/cleaning-services' ||
      env.GITHUB_REF !== 'refs/heads/main') throw new Error('Backup must run in the reviewed main workflow');
  if (env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT || !env.CLOUDFLARE_API_TOKEN)
    throw new Error('Cloudflare account or read-only token missing');
}

export function assertTarget(details) {
  if (details?.expected?.database_id !== UUID || details?.expected?.database_name !== DATABASE ||
      details?.expected?.migrations_dir !== '../docs/portal-v2')
    throw new Error('Unexpected D1 UUID, name or migrations directory');
}

export function decodeKey(raw) {
  if (typeof raw !== 'string' || !/^[0-9a-fA-F]{64}$/.test(raw))
    throw new Error('A separately saved 64-digit hexadecimal backup key is required');
  return Buffer.from(raw, 'hex');
}

export function archiveDigest(path) {
  const hash = createHash('sha256');
  const fd = openSync(path, 'r');
  const chunk = Buffer.alloc(1024 * 1024);
  try {
    let bytes;
    while ((bytes = readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, bytes));
    return hash.digest('hex');
  } finally { closeSync(fd); }
}

export function safeVaultError(error) {
  const message = String(error?.stderr || '').match(/Backup operation failed: ([^\r\n]+)/)?.[1];
  // Python only emits fixed diagnostic categories for an export failure.
  const known = [
    'Cloudflare rejected D1 export authorization; check token\'s D1 export permission',
    'D1 export failed due to a network or timeout error',
    'Cloudflare completed export, but the runner could not download its temporary SQL URL',
    'Cloudflare rejected or interrupted the D1 export request',
    'Wrangler D1 export failed before completion; no encrypted artifact was uploaded',
    'The key and backup files must be outside the public repository',
    'The key must be a regular file readable only by its owner (chmod 600)',
    'Expected a 32-byte key created with keygen', 'Backup file is incomplete',
    'Unknown backup format', 'Refusing to overwrite a backup',
    'Could not locate the isolated local D1 database',
    'Restored database failed SQLite integrity check',
    'Restored database has broken foreign-key references',
    'Restored database is missing portal tables',
    'Restored database row counts differ from backup',
    'Backup schema does not match the expected portal tables',
    'Local D1 import failed foreign-key validation', 'Local D1 import failed SQL validation',
    'Local D1 import failed before completion',
    'ValueError', 'InvalidTag', 'FileExistsError', 'PermissionError', 'FileNotFoundError', 'OSError', 'CalledProcessError',
  ];
  return known.includes(message) ? message : 'Backup operation failed before an encrypted artifact was uploaded';
}

export function run(operation, confirmation, env = process.env) {
  assertChoice(operation, confirmation);
  assertRunner(env);
  assertFiles();
  const details = verifyRemoteD1();
  assertTarget(details);
  const state = remoteState(details);
  assertVersion({ ...state, tables: assertOneTimeBackupTables(state.tables) }, true);
  process.stdout.write('Verified EU D1, nine pinned portal migrations and eleven reviewed one-time tables. No database writes.\n');
  if (operation === 'inspect') return;

  // The runner's temporary directory and the output are outside the public
  // checkout. Only the encrypted result is uploaded; the key never is.
  const runnerTemp = env.RUNNER_TEMP && resolve(env.RUNNER_TEMP);
  if (!runnerTemp || runnerTemp === ROOT || runnerTemp.startsWith(ROOT + '/'))
    throw new Error('Private runner temporary directory missing');
  const archive = join(runnerTemp, 'portal-d1-backup.pi-d1');
  if (existsSync(archive)) throw new Error('Refusing to overwrite an encrypted backup');
  const key = decodeKey(env.PORTAL_BACKUP_KEY_HEX);
  const privateDir = mkdtempSync(join(runnerTemp, 'portal-backup-key-'));
  const keyFile = join(privateDir, 'key');
  try {
    writeFileSync(keyFile, key, { mode: 0o600 });
    const vault = join(ROOT, 'scripts', 'd1_vault.py');
    const python = env.PYTHON || 'python3';
    const { PORTAL_BACKUP_KEY_HEX: _keyFromSecret, ...pythonEnv } = env;
    const invoke = args => execFileSync(python, [vault, ...args], {
      cwd: ROOT, timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024,
      env: pythonEnv,
    });
    for (const [stage, args] of [
      ['export and encryption', ['export', '--database', DATABASE, '--scope', 'remote', '--out', archive, '--key', keyFile]],
      ['encrypted archive authentication', ['verify', '--input', archive, '--key', keyFile]],
      ['isolated local D1 recovery', ['restore-local-test', '--input', archive, '--key', keyFile]],
    ]) {
      process.stdout.write(`Starting backup stage: ${stage}.\n`);
      try { invoke(args); }
      catch (error) { throw new Error(`Backup stage ${stage}: ${safeVaultError(error)}`); }
      process.stdout.write(`Completed backup stage: ${stage}.\n`);
    }
    const digest = archiveDigest(archive);
    process.stdout.write(`Encrypted D1 export verified and restored into isolated local D1. SHA-256: ${digest}\n`);
    process.stdout.write('Download the artifact and store it outside GitHub and Cloudflare; keep the key separately.\n');
  } finally {
    key.fill(0);
    rmSync(privateDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv[2], process.argv[3]); }
  catch (error) {
    process.stderr.write(`Stopped: ${error.message}. The source D1 was not modified.\n`);
    process.exitCode = 1;
  }
}
