/** Single guarded D1 upgrade from 0005 to 0006; never run the older upgrade again. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSchema, readBookmark, remoteState } from './upgrade-phone.mjs';
import { verifyRemoteD1, expectedDatabase } from './verify-remote-d1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = resolve(ROOT, '..', 'docs', 'portal-v2');
const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';
const FIVE = ['0001_app_schema.sql', '0002_auth.sql', '0003_portal_accounts.sql',
  '0004_location_contact.sql', '0005_soft_delete.sql'];
const FILES = Object.freeze({
  '0001_app_schema.sql': '9cd04b2a7825de6330c2298d80f51049e1d9c030321dd09263c34c2dd6a1534f',
  '0002_auth.sql': '0e97e57b5daac492cc0ff859b5951236090ead6a6968bfcaa740408b86f07f66',
  '0003_portal_accounts.sql': 'a5ef4f93d3894270b17140c58b58eb7893b369e152b06cd1d9817edb5bea16e2',
  '0004_location_contact.sql': 'dedef3a78ae271937bf2c11a661acbcdf0dc6ebbec885e8f9671467d16792ac5',
  '0005_soft_delete.sql': '06578effb18b1a3efca019510ac620c1c63c86743c7a5cffcb64236addbd4156',
  '0006_invoice_client_notes.sql': 'dcf59e0a24d39b6aa3d82daedd3513ce3e6272fe41740fbf82dcf6d34a534b06',
});

export function assertChoice(operation, confirmation, recovery = '') {
  if (!['inspect', 'apply'].includes(operation)) throw new Error('Unknown fields upgrade operation');
  if (operation === 'inspect' && (confirmation || recovery)) throw new Error('Inspect confirmations must be empty');
  if (operation === 'apply' && confirmation !== `APPLY PORTAL FIELDS ${UUID}`)
    throw new Error('Fields upgrade requires exact D1 confirmation');
  if (operation === 'apply' && recovery !== `TIME TRAVEL VERIFIED ${UUID}`)
    throw new Error('Fields upgrade requires exact recovery confirmation');
}

export function assertFiles() {
  const names = readdirSync(DIRECTORY).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(FILES).sort()))
    throw new Error('Unexpected migration files; stop before upgrading D1');
  for (const [name, expected] of Object.entries(FILES)) {
    if (createHash('sha256').update(readFileSync(join(DIRECTORY, name))).digest('hex') !== expected)
      throw new Error(`Migration contents changed: ${name}`);
  }
}

export function assertVersion(state, upgraded = false) {
  const expected = upgraded ? [...FIVE, '0006_invoice_client_notes.sql'] : FIVE;
  if (JSON.stringify(state.migrations) !== JSON.stringify(expected))
    throw new Error('Unexpected D1 migration history');
  // The version-0005 guard still validates all 16 tables and nine prior columns.
  assertSchema({ ...state, migrations: FIVE }, true);
  if (state.columns.clients.includes('internal_note') !== upgraded ||
      state.columns.payments.includes('invoice_url') !== upgraded)
    throw new Error('Unexpected invoice or client notes column');
}

export function run(operation, confirmation, recovery) {
  assertChoice(operation, confirmation, recovery);
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== '47b9f8498a9865c0fbbaca8f0f5cf59d' ||
      !process.env.CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare account or temporary token missing');
  const expected = expectedDatabase(JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')));
  if (expected.database_id !== UUID || expected.migrations_dir !== '../docs/portal-v2')
    throw new Error('Unexpected D1 target');
  assertFiles();
  const details = verifyRemoteD1();
  assertVersion(remoteState(details));
  const bookmark = readBookmark(execFileSync(process.execPath,
    [details.wrangler, 'd1', 'time-travel', 'info', expected.database_name, '--json'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'] }));
  process.stdout.write('Verified EU D1 through 0005, exact 0006 target and six pinned SQL files.\n');
  process.stdout.write(`Time Travel bookmark before fields upgrade: ${bookmark}\n`);
  if (operation === 'inspect') return;
  execFileSync(process.execPath,
    [details.wrangler, 'd1', 'migrations', 'apply', expected.database_name, '--remote'],
    { cwd: ROOT, timeout: 180000, stdio: 'inherit' });
  assertVersion(remoteState(details), true);
  process.stdout.write('D1 migration 0006 applied and final columns verified. Deploy new Worker only after review.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv[2], process.argv[3], process.argv[4]); }
  catch (error) { process.stderr.write(`Stopped: ${error.message}. Do not rerun apply until D1 is inspected.\n`); process.exitCode = 1; }
}
