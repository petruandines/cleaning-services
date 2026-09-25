/** First Worker deployment from an explicitly confirmed GitHub Actions run. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertMigrated, assertMigrationFiles, tableNames } from './migrate-phone.mjs';
import { expectedDatabase, verifyRemoteD1 } from './verify-remote-d1.mjs';
import { readFileSync } from 'node:fs';
import { verifyPublicWorker } from './verify-worker-phone.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const DATABASE = '6816004b-dc95-48c9-be52-9bd4131d157e';
const WORKER = 'petru-ines-portal-api';
const SUBDOMAIN = 'petruandines';
const URL = `https://${WORKER}.${SUBDOMAIN}.workers.dev`;

export function assertChoice(operation, confirmation) {
  if (!['inspect', 'deploy'].includes(operation)) throw new Error('Unknown operation');
  if (operation === 'deploy' && confirmation !== `DEPLOY ${WORKER}`) {
    throw new Error('Deployment requires the exact Worker confirmation text');
  }
}

export function assertTarget(config) {
  const db = expectedDatabase(config);
  if (config.name !== WORKER || config.main !== 'src/index.mjs' ||
      config.vars?.PUBLIC_API_URL !== URL || db.database_id !== DATABASE ||
      db.database_name !== 'petru-ines-portal-eu' || db.migrations_dir !== '../docs/portal-v2' ||
      config.d1_databases?.length !== 1 || config.assets?.directory !== './public') {
    throw new Error('Worker target or D1 binding changed');
  }
}

export function assertCloudflareState(subdomainResponse, scriptsResponse) {
  if (subdomainResponse?.success !== true || subdomainResponse.result?.subdomain !== SUBDOMAIN) {
    throw new Error('Cloudflare Workers subdomain does not match the reviewed account');
  }
  if (scriptsResponse?.success !== true || !Array.isArray(scriptsResponse.result) ||
      scriptsResponse.result.some(script => typeof script?.id !== 'string')) {
    throw new Error('Could not verify the existing Worker names');
  }
  if (typeof scriptsResponse.result_info?.total_count === 'number' &&
      scriptsResponse.result_info.total_count > scriptsResponse.result.length) {
    throw new Error('Incomplete Worker listing; refusing to overwrite an unseen Worker');
  }
  if (scriptsResponse.result.some(script => script.id === WORKER)) {
    throw new Error('A Worker with this name already exists; stop before overwriting it');
  }
}

async function cloudflare(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/${path}`, {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Cloudflare Worker inspection failed (HTTP ${response.status})`);
  try { return await response.json(); }
  catch { throw new Error('Cloudflare Worker inspection returned invalid JSON'); }
}

function remoteTables(wrangler) {
  const raw = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'petru-ines-portal-eu',
    '--remote', '--json', '--command',
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"],
  { cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] });
  return tableNames(raw);
}

export async function run(operation, confirmation) {
  assertChoice(operation, confirmation);
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT || !process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Expected Cloudflare account or temporary token is missing');
  }
  const config = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8'));
  assertTarget(config);
  assertMigrationFiles();
  const details = verifyRemoteD1();
  assertMigrated(remoteTables(details.wrangler));
  const [subdomain, scripts] = await Promise.all([cloudflare('subdomain'), cloudflare('scripts')]);
  assertCloudflareState(subdomain, scripts);
  process.stdout.write('Verified EU D1 identity, 16 expected tables, locked SQL, account, Workers subdomain, and unused Worker name.\n');
  if (operation === 'inspect') return;

  const secret = process.env.PORTAL_WORKER_AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 48 || !/^[A-Za-z0-9_-]+$/.test(secret)) {
    throw new Error('Worker authentication secret is missing or too short');
  }
  // A mode-0600 file outside the checkout lets Wrangler upload code and secret
  // in one operation. The value is never printed or stored in the repository.
  const temporary = mkdtempSync(join(tmpdir(), 'portal-worker-'));
  try {
    const secretsFile = join(temporary, 'secrets.json');
    writeFileSync(secretsFile, JSON.stringify({ BETTER_AUTH_SECRET: secret }), { mode: 0o600 });
    execFileSync(process.execPath, [details.wrangler, 'deploy', '--secrets-file', secretsFile], {
      cwd: ROOT, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally { rmSync(temporary, { recursive: true, force: true }); }

  // Workers routes can take a short time to become visible. Verify only public
  // endpoints without credentials or customer data; this never redeploys.
  await verifyPublicWorker();
  process.stdout.write('Worker deployed with its secret. Login serves HTTP 200; anonymous API correctly returns HTTP 401. No accounts or client data were created.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(process.argv[2], process.argv[3]); }
  catch (error) {
    process.stderr.write(`Stopped: ${error.message}. Check the run before retrying; a deployment may already exist.\n`);
    process.exitCode = 1;
  }
}
