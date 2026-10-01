/** Guarded replacement of the existing Worker after D1 migrations 0004–0005. */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './deploy-phone.mjs';
import { assertFiles, assertSchema, remoteState } from './upgrade-phone.mjs';
import { verifyRemoteD1 } from './verify-remote-d1.mjs';
import { verifyPublicWorker } from './verify-worker-phone.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const WORKER = 'petru-ines-portal-api';

export function assertChoice(operation, confirmation) {
  if (!['inspect', 'deploy'].includes(operation)) throw new Error('Unknown Worker update operation');
  if (operation === 'inspect' && confirmation) throw new Error('Inspect confirmation must be empty');
  if (operation === 'deploy' && confirmation !== 'UPDATE petru-ines-portal-api 6816004b-dc95-48c9-be52-9bd4131d157e')
    throw new Error('Worker update requires the exact confirmation text');
}

export function assertExistingWorker(subdomain, scripts) {
  if (subdomain?.success !== true || subdomain.result?.subdomain !== 'petruandines')
    throw new Error('Unexpected Workers subdomain');
  if (scripts?.success !== true || !Array.isArray(scripts.result) ||
      scripts.result.some(script => typeof script?.id !== 'string') ||
      (typeof scripts.result_info?.total_count === 'number' && scripts.result_info.total_count > scripts.result.length))
    throw new Error('Incomplete or invalid Worker listing');
  if (scripts.result.filter(script => script.id === WORKER).length !== 1)
    throw new Error('The expected existing Worker was not found exactly once');
}

// The old deployed version advertises only GET/POST; the reviewed update
// advertises PATCH/DELETE. This read-only probe detects actual propagation.
export async function verifyUpgradedWorker({ request = fetch,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 24 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await request('https://petru-ines-portal-api.petruandines.workers.dev/api/me', {
        method: 'OPTIONS', cache: 'no-store',
      });
      const methods = response.headers.get('access-control-allow-methods')?.split(',').map(value => value.trim());
      if (response.status === 204 && methods?.includes('PATCH') && methods.includes('DELETE')) return;
    } catch { /* Cloudflare may need time to propagate the new deployment. */ }
    if (i + 1 < attempts) await wait(5000);
  }
  throw new Error('Updated Worker was not visible after public checks; deployment may already be complete');
}

async function cloudflare(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/${path}`, {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Cloudflare Worker inspection failed (HTTP ${response.status})`);
  return response.json();
}

export async function run(operation, confirmation) {
  assertChoice(operation, confirmation);
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT || !process.env.CLOUDFLARE_API_TOKEN)
    throw new Error('Cloudflare account or temporary token is missing');
  assertTarget(JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')));
  assertFiles();
  const details = verifyRemoteD1();
  assertSchema(remoteState(details), true);
  const [subdomain, scripts] = await Promise.all([cloudflare('subdomain'), cloudflare('scripts')]);
  assertExistingWorker(subdomain, scripts);
  process.stdout.write('Verified EU D1 upgraded through 0005, five pinned SQL files, and existing Worker target.\n');
  if (operation === 'inspect') return;

  const secret = process.env.PORTAL_WORKER_AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 48 || !/^[A-Za-z0-9_-]+$/.test(secret))
    throw new Error('Existing Worker authentication secret is missing or too short');
  const temporary = mkdtempSync(join(tmpdir(), 'portal-worker-update-'));
  try {
    const secretsFile = join(temporary, 'secrets.json');
    writeFileSync(secretsFile, JSON.stringify({ BETTER_AUTH_SECRET: secret }), { mode: 0o600 });
    execFileSync(process.execPath, [details.wrangler, 'deploy', '--secrets-file', secretsFile], {
      cwd: ROOT, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  await verifyPublicWorker();
  await verifyUpgradedWorker();
  process.stdout.write('Updated Worker deployed; login HTTP 200 and anonymous API HTTP 401. No D1 migration or portal cutover performed.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(process.argv[2], process.argv[3]); }
  catch (error) {
    process.stderr.write(`Stopped: ${error.message}. A deployment may already have occurred; inspect before retrying.\n`);
    process.exitCode = 1;
  }
}
