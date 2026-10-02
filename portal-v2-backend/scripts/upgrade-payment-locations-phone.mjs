/** Explicit, one-time D1 upgrade from 0008 to 0009; inspection never writes. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSchema, readBookmark, remoteState, queryRows } from './upgrade-phone.mjs';
import { verifyRemoteD1, expectedDatabase } from './verify-remote-d1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = resolve(ROOT, '..', 'docs', 'portal-v2');
const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';
const HASHES = Object.freeze({
  '0009_payment_locations.sql': '7188b450bd76d720ae4e6065aa5b0bc62651ef7589a0ee004a754cea2b99c13f',
  '0008_appointment_draft.sql': 'a358c5e2e81604a8e2189d5b020c36151a0bac8d1d713d22fa9411018788bb50',
  '0001_app_schema.sql': '9cd04b2a7825de6330c2298d80f51049e1d9c030321dd09263c34c2dd6a1534f',
  '0002_auth.sql': '0e97e57b5daac492cc0ff859b5951236090ead6a6968bfcaa740408b86f07f66',
  '0003_portal_accounts.sql': 'a5ef4f93d3894270b17140c58b58eb7893b369e152b06cd1d9817edb5bea16e2',
  '0004_location_contact.sql': 'dedef3a78ae271937bf2c11a661acbcdf0dc6ebbec885e8f9671467d16792ac5',
  '0005_soft_delete.sql': '06578effb18b1a3efca019510ac620c1c63c86743c7a5cffcb64236addbd4156',
  '0006_invoice_client_notes.sql': 'dcf59e0a24d39b6aa3d82daedd3513ce3e6272fe41740fbf82dcf6d34a534b06',
  '0007_client_contract.sql': 'ed9d3c8b99d114c24eee2025df9e4675d9d5dda6cbb684470fd1425824526b4b',
});
const COLUMNS = ['billing_type', 'contract_rate_bani', 'manager_name', 'manager_email',
  'manager_phone', 'contract_reference', 'contract_details'];

export function assertChoice(operation, confirmation, recovery = '') {
  if (!['inspect', 'apply'].includes(operation)) throw new Error('Unknown payment locations upgrade operation');
  if (operation === 'inspect' && (confirmation || recovery)) throw new Error('Inspect confirmations must be empty');
  if (operation === 'apply' && confirmation !== `APPLY PORTAL PAYMENT LOCATIONS ${UUID}`)
    throw new Error('Payment locations upgrade requires exact D1 confirmation');
  if (operation === 'apply' && recovery !== `TIME TRAVEL VERIFIED ${UUID}`)
    throw new Error('Payment locations upgrade requires exact recovery confirmation');
}

export function assertFiles() {
  const names = readdirSync(DIRECTORY).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(HASHES).sort()))
    throw new Error('Unexpected migration files; stop before touching D1');
  for (const [name, pinned] of Object.entries(HASHES)) {
    if (createHash('sha256').update(readFileSync(join(DIRECTORY, name))).digest('hex') !== pinned)
      throw new Error(`Migration contents changed: ${name}`);
  }
}

export function assertVersion(state, upgraded = false) {
  const files = Object.keys(HASHES).sort();
  if (JSON.stringify(state.migrations) !== JSON.stringify(files.slice(0, upgraded ? 9 : 8)))
    throw new Error('Unexpected D1 migration history');
  // Preserve all 16 application/auth tables and the columns from migration 0006.
  if (state.tables.includes('payment_locations') !== upgraded) throw new Error('Unexpected payment locations table');
  assertSchema({ ...state, tables: state.tables.filter(name => name !== 'payment_locations'), migrations: files.slice(0, 5) }, true);
  if (!state.columns.clients.includes('internal_note') ||
      !state.columns.payments.includes('invoice_url') ||
      COLUMNS.some(name => !state.columns.clients.includes(name)))
    throw new Error('Unexpected contract or previous schema columns');
}


export function query(details, sql) {
  return queryRows(execFileSync(process.execPath, [details.wrangler, 'd1', 'execute',
    details.expected.database_name, '--remote', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024, stdio: ['ignore','pipe','pipe'] }));
}
export function verifyIntegrity(details) {
  if (query(details, 'PRAGMA foreign_key_check').length) throw new Error('Foreign key integrity failed');
  return JSON.stringify(query(details, "SELECT (SELECT COUNT(*) FROM appointments) AS appointments, (SELECT COUNT(*) FROM jobs) AS jobs, (SELECT COUNT(*) FROM payments) AS payments, (SELECT COALESCE(SUM(amount_bani),0) FROM payments) AS payment_total"));
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
  process.stdout.write('Verified EU D1 through 0008, exact 0009 target and nine pinned SQL files.\n');
  process.stdout.write(`Time Travel bookmark before payment locations upgrade: ${bookmark}\n`);
  const before = verifyIntegrity(details);
  if (operation === 'inspect') return;
  execFileSync(process.execPath, [details.wrangler, 'd1', 'migrations', 'apply', expected.database_name, '--remote'],
    { cwd: ROOT, timeout: 180000, stdio: 'inherit' });
  assertVersion(remoteState(details), true);
  if (query(details, `SELECT p.id FROM payments p JOIN jobs j ON j.id=p.job_id AND j.client_id=p.client_id JOIN appointments a ON a.id=j.appointment_id AND a.client_id=p.client_id LEFT JOIN payment_locations pl ON pl.payment_id=p.id AND pl.client_id=p.client_id AND pl.location_id=a.location_id WHERE pl.payment_id IS NULL LIMIT 1`).length) throw new Error('Payment location backfill incomplete');
  if (verifyIntegrity(details) !== before) throw new Error('Record counts changed during migration');
  process.stdout.write('D1 migration 0009 applied and final columns verified. Deploy Worker only after review.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv[2], process.argv[3], process.argv[4]); }
  catch (error) { process.stderr.write(`Stopped: ${error.message}. Do not rerun apply until D1 is inspected.\n`); process.exitCode = 1; }
}
