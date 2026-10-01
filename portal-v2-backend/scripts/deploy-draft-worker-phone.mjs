/** Update the existing Worker only after D1 migration 0008 has been verified. */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './deploy-phone.mjs';
import { assertExistingWorker } from './update-worker-phone.mjs';
import { assertFiles, assertVersion } from './upgrade-draft-phone.mjs';
import { remoteState } from './upgrade-phone.mjs';
import { verifyRemoteD1 } from './verify-remote-d1.mjs';
import { verifyPublishedFields } from './deploy-fields-worker-phone.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';

export function assertChoice(operation, confirmation) {
  if (!['inspect', 'deploy'].includes(operation)) throw new Error('Unknown draft Worker operation');
  if (operation === 'inspect' && confirmation) throw new Error('Inspect confirmation must be empty');
  if (operation === 'deploy' && confirmation !== `UPDATE PORTAL DRAFT ${UUID}`)
    throw new Error('Contract Worker deployment requires exact confirmation');
}

async function cloudflare(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/${path}`, {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Worker target inspection failed (HTTP ${response.status})`);
  return response.json();
}

export async function run(operation, confirmation) {
  assertChoice(operation, confirmation);
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT || !process.env.CLOUDFLARE_API_TOKEN)
    throw new Error('Cloudflare account or token missing');
  assertTarget(JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')));
  assertFiles();
  const details = verifyRemoteD1();
  assertVersion(remoteState(details), true);
  const [subdomain, scripts] = await Promise.all([cloudflare('subdomain'), cloudflare('scripts')]);
  assertExistingWorker(subdomain, scripts);
  process.stdout.write('Verified EU D1 through 0008, eight pinned SQL files and existing Worker target.\n');
  if (operation === 'inspect') return;
  const secret = process.env.PORTAL_WORKER_AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 48 || !/^[A-Za-z0-9_-]+$/.test(secret))
    throw new Error('Worker authentication secret missing or invalid');
  const temporary = mkdtempSync(join(tmpdir(), 'portal-draft-worker-'));
  try {
    const secretsFile = join(temporary, 'secrets.json');
    writeFileSync(secretsFile, JSON.stringify({ BETTER_AUTH_SECRET: secret }), { mode: 0o600 });
    execFileSync(process.execPath, [details.wrangler, 'deploy', '--secrets-file', secretsFile], {
      cwd: ROOT, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  await verifyPublishedFields();
  process.stdout.write('Contract Worker deployed; login visible and anonymous API denied. Public /portal/ unchanged.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(process.argv[2], process.argv[3]); }
  catch (error) {
    process.stderr.write(`Stopped: ${error.message}. Check the public Worker before any retry.\n`);
    process.exitCode = 1;
  }
}
