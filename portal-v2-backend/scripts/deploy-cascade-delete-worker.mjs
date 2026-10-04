/** Deploy the cascade-delete Worker only against the verified production D1 and custom API domain. */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFiles, assertVersion } from './upgrade-payment-locations-phone.mjs';
import { remoteState } from './upgrade-phone.mjs';
import { verifyRemoteD1 } from './verify-remote-d1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';
const WORKER = 'petru-ines-portal-api';
const CUSTOM_API = 'https://api.petruandines.com';
const LEGACY_API = 'https://petru-ines-portal-api.petruandines.workers.dev';

export function assertChoice(operation, confirmation) {
  if (!['inspect', 'deploy'].includes(operation)) throw new Error('Unknown cascade-delete Worker operation');
  if (operation === 'inspect' && confirmation) throw new Error('Inspect confirmation must be empty');
  if (operation === 'deploy' && confirmation !== `UPDATE PORTAL CASCADE DELETE ${UUID}`)
    throw new Error('Cascade-delete Worker deployment requires exact confirmation');
}

function assertProductionConfig(config) {
  const db = (config.d1_databases || []).find(item => item.binding === 'DB');
  if (config.name !== WORKER || config.main !== 'src/index.mjs' ||
      db?.database_id !== UUID || db.database_name !== 'petru-ines-portal-eu' ||
      db.migrations_dir !== '../docs/portal-v2' || config.d1_databases?.length !== 1 ||
      config.assets?.directory !== './public' || config.vars?.PUBLIC_API_URL !== CUSTOM_API ||
      config.workers_dev !== false || config.preview_urls !== false) {
    throw new Error('Production Worker routing or D1 target is not hardened');
  }
}

async function cf(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) throw new Error(`Cloudflare inspection failed (HTTP ${response.status})`);
  return data.result;
}

async function verifyWorkerIdentity() {
  const [scripts, domains] = await Promise.all([
    cf(`/accounts/${ACCOUNT}/workers/scripts`),
    cf(`/accounts/${ACCOUNT}/workers/domains`),
  ]);
  if (!Array.isArray(scripts) || scripts.filter(script => script.id === WORKER).length !== 1)
    throw new Error('Expected production Worker was not found exactly once');
  if (!Array.isArray(domains) || !domains.some(domain => domain.hostname === 'api.petruandines.com' && domain.service === WORKER))
    throw new Error('Custom API domain is not attached to the expected Worker');
}

async function verifyPublicState(attempts = 18) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const [anonymous, login, legacy] = await Promise.all([
        fetch(CUSTOM_API + '/api/me?verify=cascade-delete', {
          redirect: 'manual', cache: 'no-store', headers: { Origin: 'https://petruandines.com' },
          signal: AbortSignal.timeout(20000),
        }),
        fetch(CUSTOM_API + '/login?verify=cascade-delete', { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) }),
        fetch(LEGACY_API + '/api/me?verify=cascade-delete', { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) }),
      ]);
      if (anonymous.status === 401 &&
          anonymous.headers.get('access-control-allow-origin') === 'https://petruandines.com' &&
          login.status === 200 && legacy.status !== 200 && legacy.status !== 401) return;
    } catch { /* deployment propagation */ }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('Production API verification failed after deployment');
}

export async function run(operation, confirmation) {
  assertChoice(operation, confirmation);
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT || !process.env.CLOUDFLARE_API_TOKEN)
    throw new Error('Cloudflare account or token missing');
  assertProductionConfig(JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')));
  assertFiles();
  const details = verifyRemoteD1();
  assertVersion(remoteState(details), true);
  await verifyWorkerIdentity();
  process.stdout.write('Verified production Worker, custom API domain and D1 schema through 0009.\n');
  if (operation === 'inspect') return;

  const secret = process.env.PORTAL_WORKER_AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 48 || !/^[A-Za-z0-9_-]+$/.test(secret))
    throw new Error('Worker authentication secret missing or invalid');
  const temporary = mkdtempSync(join(tmpdir(), 'portal-cascade-delete-worker-'));
  try {
    const secretsFile = join(temporary, 'secrets.json');
    writeFileSync(secretsFile, JSON.stringify({ BETTER_AUTH_SECRET: secret }), { mode: 0o600 });
    execFileSync(process.execPath, [details.wrangler, 'deploy', '--secrets-file', secretsFile], {
      cwd: ROOT, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally { rmSync(temporary, { recursive: true, force: true }); }

  await verifyPublicState();
  await verifyWorkerIdentity();
  process.stdout.write('Cascade-delete Worker deployed and verified on api.petruandines.com; workers.dev remains disabled.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(process.argv[2], process.argv[3]); }
  catch (error) {
    process.stderr.write(`Stopped: ${error.message}. Inspect production before retrying.\n`);
    process.exitCode = 1;
  }
}
