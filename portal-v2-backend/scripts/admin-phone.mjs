/** One-time administrator bootstrap from a manually confirmed GitHub Actions run. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertMigrationFiles, assertMigrated, tableNames } from './migrate-phone.mjs';
import { assertTarget } from './deploy-phone.mjs';
import { parseWranglerJson, verifyRemoteD1 } from './verify-remote-d1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const DATABASE = 'petru-ines-portal-eu';
const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';
const MIGRATIONS = ['0001_app_schema.sql', '0002_auth.sql', '0003_portal_accounts.sql'];
const EMPTY_TABLES = [
  'account', 'appointments', 'audit_events', 'client_users', 'clients', 'jobs',
  'locations', 'messages', 'payments', 'portal_accounts', 'rateLimit', 'session',
  'twoFactor', 'user', 'verification',
];

export function assertChoice(operation, confirmation, email) {
  if (operation !== 'inspect' && operation !== 'create') throw new Error('Unknown operation');
  if (typeof email !== 'string' || email.length > 254 ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
    throw new Error('Enter one lowercase administrator email address');
  }
  if (operation === 'create' && confirmation !== `CREATE ADMIN ${UUID} ${email}`) {
    throw new Error('Creation requires exact UUID and administrator email confirmation');
  }
}

export function parseRows(raw) {
  const data = parseWranglerJson(raw);
  if (!Array.isArray(data) || data.length !== 1 || data[0]?.success !== true ||
      !Array.isArray(data[0].results)) throw new Error('Unexpected D1 response');
  return data[0].results;
}

export function assertInitialState(counts, migrations) {
  if (!counts || typeof counts !== 'object' ||
      EMPTY_TABLES.some(table => !Number.isSafeInteger(counts[table]) || counts[table] !== 0)) {
    throw new Error('D1 contains accounts or application data; stop and investigate');
  }
  if (!Array.isArray(migrations) || migrations.length !== MIGRATIONS.length ||
      migrations.some((row, i) => row?.name !== MIGRATIONS[i])) {
    throw new Error('D1 migration history differs from the reviewed initial schema');
  }
}

export function d1Sql(sql) {
  const lines = sql.trimEnd().split('\n');
  if (lines.length !== 4 || lines[0] !== 'BEGIN TRANSACTION;' ||
      lines[3] !== 'COMMIT;' || !lines[1].startsWith('INSERT INTO "user" ') ||
      !lines[2].startsWith('INSERT INTO "account" ')) {
    throw new Error('Unexpected generated bootstrap SQL');
  }
  // Wrangler wraps remote file execution in its own transaction.
  return `${lines[1]}\n${lines[2]}\n`;
}

function query(wrangler, sql) {
  const output = execFileSync(process.execPath,
    [wrangler, 'd1', 'execute', DATABASE, '--remote', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'] });
  return parseRows(output);
}

function countRows(wrangler) {
  const columns = EMPTY_TABLES.map(table =>
    `(SELECT COUNT(*) FROM "${table}") AS "${table}"`).join(', ');
  const rows = query(wrangler, `SELECT ${columns}`);
  if (rows.length !== 1) throw new Error('Unexpected D1 row-count response');
  return rows[0];
}

export function assertCreated(counts, rows, email) {
  if (!counts || EMPTY_TABLES.some(table =>
    !Number.isSafeInteger(counts[table]) || counts[table] !== (table === 'user' || table === 'account' ? 1 : 0)) ||
      rows.length !== 1 || rows[0]?.email !== email || rows[0]?.role !== 'admin' ||
      rows[0]?.providerId !== 'credential' || rows[0]?.hasPassword !== 1) {
    throw new Error('Administrator import needs manual review; do not repeat create');
  }
}

export function run(operation, confirmation, email) {
  assertChoice(operation, confirmation, email);
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT || !process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Expected Cloudflare account or temporary D1 token is missing');
  }
  assertTarget(JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')));
  assertMigrationFiles();
  const { wrangler } = verifyRemoteD1();
  const names = query(wrangler,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  assertMigrated(tableNames(JSON.stringify([{ success: true, results: names }])));
  const migrations = query(wrangler, 'SELECT name FROM d1_migrations ORDER BY id');
  assertInitialState(countRows(wrangler), migrations);
  process.stdout.write('Verified EU D1 identity, migration hashes and history, exact schema, and empty account/application tables.\n');
  if (operation === 'inspect') return;

  const password = process.env.PORTAL_ADMIN_INITIAL_PASSWORD;
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 ||
      /[\r\n]/.test(password)) throw new Error('Initial administrator password must have 12–128 characters on one line');
  delete process.env.PORTAL_ADMIN_INITIAL_PASSWORD;
  const dir = mkdtempSync(join(tmpdir(), 'portal-admin-'));
  try {
    const generated = join(dir, 'generated.sql');
    const prepared = join(dir, 'd1.sql');
    const result = spawnSync(process.execPath,
      [join(ROOT, 'scripts', 'bootstrap-admin.mjs'), '--email', email,
        '--name', 'Petru & Inés', '--out', generated],
      { cwd: ROOT, input: `${password}\n`, encoding: 'utf8', timeout: 60000,
        maxBuffer: 1024 * 1024 });
    if (result.status !== 0) throw new Error('Local credential generation failed; no D1 import attempted');
    writeFileSync(prepared, d1Sql(readFileSync(generated, 'utf8')),
      { flag: 'wx', mode: 0o600 });
    // Keep all Wrangler output private: it might include the hashed credential.
    execFileSync(process.execPath,
      [wrangler, 'd1', 'execute', DATABASE, '--remote', '--yes', '--file', prepared],
      { cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'] });
  } finally { rmSync(dir, { recursive: true, force: true }); }

  const rows = query(wrangler,
    'SELECT u.email, u.role, a.providerId, CASE WHEN length(a.password) > 0 THEN 1 ELSE 0 END AS hasPassword FROM "user" u JOIN "account" a ON a.userId = u.id');
  assertCreated(countRows(wrangler), rows, email);
  process.stdout.write('One administrator and one credential account verified; no client records created.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.env.OPERATION, process.env.CONFIRMATION, process.env.ADMIN_EMAIL); }
  catch {
    // A failed remote import may already have written data. No automatic retry.
    process.stderr.write('Stopped. Inspect remote D1 before any retry; create may have changed it.\n');
    process.exitCode = 1;
  }
}
