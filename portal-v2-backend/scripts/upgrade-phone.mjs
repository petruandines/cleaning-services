/** Explicit, pinned upgrade of an existing D1 from schema 0003 to 0005. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedDatabase, parseWranglerJson, verifyRemoteD1 } from './verify-remote-d1.mjs';
import { assertMigrated, tableNames } from './migrate-phone.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = resolve(ROOT, '..', 'docs', 'portal-v2');
const HASHES = Object.freeze({
  '0001_app_schema.sql': '9cd04b2a7825de6330c2298d80f51049e1d9c030321dd09263c34c2dd6a1534f',
  '0002_auth.sql': '0e97e57b5daac492cc0ff859b5951236090ead6a6968bfcaa740408b86f07f66',
  '0003_portal_accounts.sql': 'a5ef4f93d3894270b17140c58b58eb7893b369e152b06cd1d9817edb5bea16e2',
  '0004_location_contact.sql': 'dedef3a78ae271937bf2c11a661acbcdf0dc6ebbec885e8f9671467d16792ac5',
  '0005_soft_delete.sql': '06578effb18b1a3efca019510ac620c1c63c86743c7a5cffcb64236addbd4156',
});
const ARCHIVED = ['clients', 'locations', 'appointments', 'jobs', 'payments', 'messages'];

export function assertChoice(operation, confirmation, backupConfirmation = '') {
  if (!['inspect', 'apply'].includes(operation)) throw new Error('Unknown upgrade operation');
  if (operation === 'apply' && confirmation !== 'APPLY PORTAL UPGRADE 6816004b-dc95-48c9-be52-9bd4131d157e')
    throw new Error('Upgrade requires the exact database confirmation text');
  if (operation === 'inspect' && confirmation) throw new Error('Inspect confirmation must be empty');
  if (operation === 'apply' && backupConfirmation !== 'BACKUP VERIFIED 6816004b-dc95-48c9-be52-9bd4131d157e')
    throw new Error('Upgrade requires a separately verified backup confirmation');
  if (operation === 'inspect' && backupConfirmation) throw new Error('Inspect backup confirmation must be empty');
}

export function assertFiles() {
  const names = readdirSync(DIRECTORY).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(HASHES).sort()))
    throw new Error('Unexpected migration files; inspect the reviewed commit');
  for (const [name, pinned] of Object.entries(HASHES)) {
    const actual = createHash('sha256').update(readFileSync(join(DIRECTORY, name))).digest('hex');
    if (actual !== pinned) throw new Error(`Migration contents changed: ${name}`);
  }
}

export function queryRows(raw) {
  const result = parseWranglerJson(raw);
  if (!Array.isArray(result) || result.length !== 1 || result[0]?.success !== true ||
      !Array.isArray(result[0].results)) throw new Error('Unexpected remote D1 query response');
  return result[0].results;
}

export function assertSchema({ tables, migrations, columns }, upgraded = false) {
  assertMigrated(tables);
  const wanted = Object.keys(HASHES).slice(0, upgraded ? 5 : 3);
  if (JSON.stringify(migrations) !== JSON.stringify(wanted))
    throw new Error('Unexpected remote D1 migration history; stop and inspect');
  for (const table of ARCHIVED) {
    const names = columns[table];
    if (!Array.isArray(names) || names.includes('deleted_at') !== upgraded)
      throw new Error(`Unexpected remote D1 columns in ${table}`);
  }
  const contacts = ['contact_name', 'contact_phone', 'contact_email'];
  if (contacts.some(column => columns.locations.includes(column) !== upgraded))
    throw new Error('Unexpected location contact columns');
}

function wrangler(executable, args) {
  return execFileSync(process.execPath, [executable, 'd1', ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function remoteState(details) {
  const execute = sql => queryRows(wrangler(details.wrangler, [
    'execute', details.expected.database_name, '--remote', '--json', '--command', sql,
  ]));
  const rawTables = wrangler(details.wrangler, [
    'execute', details.expected.database_name, '--remote', '--json',
    '--command', "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ]);
  const history = execute('SELECT name FROM d1_migrations ORDER BY id');
  if (history.some(row => typeof row.name !== 'string')) throw new Error('Invalid migration history response');
  const columns = {};
  for (const table of ARCHIVED) {
    const values = execute(`PRAGMA table_info(${table})`);
    if (values.some(row => typeof row.name !== 'string')) throw new Error('Invalid schema response');
    columns[table] = values.map(row => row.name);
  }
  return { tables: tableNames(rawTables), migrations: history.map(row => row.name), columns };
}

export function run(operation, confirmation, backupConfirmation) {
  assertChoice(operation, confirmation, backupConfirmation);
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== '47b9f8498a9865c0fbbaca8f0f5cf59d' ||
      !process.env.CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare account or token is missing');
  const expected = expectedDatabase(JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')));
  if (expected.database_id !== '6816004b-dc95-48c9-be52-9bd4131d157e' ||
      expected.migrations_dir !== '../docs/portal-v2') throw new Error('Unexpected upgrade target');
  assertFiles();
  const details = verifyRemoteD1();
  assertSchema(remoteState(details));
  process.stdout.write('Verified EU D1 identity, initial migration history, columns and five pinned files.\n');
  if (operation === 'inspect') return;
  execFileSync(process.execPath, [details.wrangler, 'd1', 'migrations', 'apply', expected.database_name, '--remote'],
    { cwd: ROOT, timeout: 180000, stdio: 'inherit' });
  assertSchema(remoteState(details), true);
  process.stdout.write('D1 upgrades 0004 and 0005 applied and verified. Inspect before deploying new Worker code.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv[2], process.argv[3], process.argv[4]); }
  catch (error) { process.stderr.write(`Stopped: ${error.message}. No further steps will run.\n`); process.exitCode = 1; }
}
