import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';
const WORKER = 'petru-ines-portal-api';
const CUSTOM_API = 'https://api.petruandines.com';
const LEGACY_API = 'https://petru-ines-portal-api.petruandines.workers.dev';
const ORIGIN = 'https://petruandines.com';

function assertConfig() {
  const config = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8'));
  const db = (config.d1_databases || []).find(item => item.binding === 'DB');
  assert.equal(config.name, WORKER);
  assert.equal(config.main, 'src/index.mjs');
  assert.equal(db?.database_id, UUID);
  assert.equal(db?.database_name, 'petru-ines-portal-eu');
  assert.equal(db?.migrations_dir, '../docs/portal-v2');
  assert.equal(config.d1_databases?.length, 1);
  assert.equal(config.assets?.directory, './public');
  assert.equal(config.vars?.PUBLIC_API_URL, CUSTOM_API);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
}

async function cf(path) {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, 'Missing Cloudflare token');
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN },
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    const detail = Array.isArray(data.errors) ? data.errors.map(error => `${error.code ?? ''} ${error.message ?? ''}`.trim()).join('; ') : '';
    throw new Error(`Cloudflare inspection failed: HTTP ${response.status}${detail ? '; ' + detail : ''}`);
  }
  return data.result;
}

async function assertLiveBindings() {
  const settings = await cf(`/accounts/${ACCOUNT}/workers/scripts/${WORKER}/settings`);
  const db = settings.bindings?.find(binding => binding.name === 'DB');
  const secret = settings.bindings?.find(binding => binding.name === 'BETTER_AUTH_SECRET');
  const publicUrl = settings.bindings?.find(binding => binding.name === 'PUBLIC_API_URL');
  assert.equal(db?.id, UUID, 'Live Worker D1 binding changed');
  assert.equal(db?.type, 'd1', 'Live DB binding is not D1');
  assert.equal(secret?.type, 'secret_text', 'Live auth secret binding is missing');
  assert.equal(publicUrl?.text, CUSTOM_API, 'Live PUBLIC_API_URL changed');
  assert.deepEqual(settings.bindings.map(binding => binding.name).sort(), ['BETTER_AUTH_SECRET', 'DB', 'PUBLIC_API_URL']);

  const subdomain = await cf(`/accounts/${ACCOUNT}/workers/scripts/${WORKER}/subdomain`);
  assert.equal(subdomain.enabled, false, 'workers.dev is enabled');
  assert.equal(subdomain.previews_enabled, false, 'Worker preview URLs are enabled');

  const domains = await cf(`/accounts/${ACCOUNT}/workers/domains`);
  assert.ok(domains.some(domain => domain.hostname === 'api.petruandines.com' && domain.service === WORKER),
    'Custom API domain is not attached to the production Worker');
}

async function assertPublicState(attempts = 18) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const [me, login, legacy] = await Promise.all([
        fetch(CUSTOM_API + '/api/me?verify=cascade-delete-code', {
          redirect: 'manual', cache: 'no-store', headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(20000),
        }),
        fetch(CUSTOM_API + '/login?verify=cascade-delete-code', {
          redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000),
        }),
        fetch(LEGACY_API + '/api/me?verify=cascade-delete-code', {
          redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000),
        }),
      ]);
      if (me.status === 401 && me.headers.get('access-control-allow-origin') === ORIGIN &&
          login.status === 200 && legacy.status !== 200 && legacy.status !== 401) return;
    } catch {}
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('Live API verification failed');
}

async function main() {
  assertConfig();
  await assertLiveBindings();
  const secret = process.env.PORTAL_WORKER_AUTH_SECRET;
  assert.ok(typeof secret === 'string' && secret.length >= 48 && /^[A-Za-z0-9_-]+$/.test(secret),
    'Worker auth secret missing or invalid');

  const temporary = mkdtempSync(join(tmpdir(), 'portal-cascade-code-'));
  try {
    const secretsFile = join(temporary, 'secrets.json');
    writeFileSync(secretsFile, JSON.stringify({ BETTER_AUTH_SECRET: secret }), { mode: 0o600 });
    execFileSync(process.execPath, [join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--secrets-file', secretsFile], {
      cwd: ROOT,
      timeout: 180000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  await assertLiveBindings();
  await assertPublicState();
  process.stdout.write('Code-only cascade-delete Worker deployment verified. D1 schema/data were not migrated or written by the deployment workflow.\n');
}

try { await main(); }
catch (error) {
  process.stderr.write(`Stopped: ${error.message}.\n`);
  process.exitCode = 1;
}
