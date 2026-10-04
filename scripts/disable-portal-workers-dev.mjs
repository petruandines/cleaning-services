import assert from 'node:assert/strict';

const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const SCRIPT = 'petru-ines-portal-api';
const API = 'https://api.cloudflare.com/client/v4';
const CUSTOM = 'https://api.petruandines.com';
const LEGACY = 'https://petru-ines-portal-api.petruandines.workers.dev';
const ORIGIN = 'https://petruandines.com';
const SUBDOMAIN_PATH = `/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/subdomain`;

async function cf(path, method = 'GET', body) {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, 'Missing CLOUDFLARE_API_TOKEN');
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    const details = Array.isArray(data.errors)
      ? data.errors.map(error => `${error.code ?? ''} ${error.message ?? ''}`.trim()).join('; ')
      : '';
    throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}${details ? '; ' + details : ''}`);
  }
  return data.result;
}

async function verifyCustomDomain() {
  const response = await fetch(CUSTOM + '/api/me', {
    redirect: 'manual',
    headers: { Origin: ORIGIN, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 401, 'Custom API domain must remain healthy');
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN, 'Custom API CORS mismatch');
}

async function verifyLegacyDisabled() {
  const response = await fetch(LEGACY + '/api/me', {
    redirect: 'manual',
    headers: { Origin: ORIGIN, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20000),
  });
  assert.notEqual(response.status, 200, 'Legacy workers.dev unexpectedly serves the API');
  assert.notEqual(response.status, 401, 'Legacy workers.dev still reaches the Worker application');
  assert.notEqual(response.headers.get('access-control-allow-origin'), ORIGIN, 'Legacy workers.dev still exposes application CORS');
  console.log('Legacy workers.dev disabled; observed HTTP', response.status);
}

const before = await cf(SUBDOMAIN_PATH);
console.log('Before:', JSON.stringify(before));

await cf(SUBDOMAIN_PATH, 'POST', { enabled: false, previews_enabled: false });

const after = await cf(SUBDOMAIN_PATH);
assert.equal(after.enabled, false, 'workers.dev route was not disabled');
assert.equal(after.previews_enabled, false, 'workers.dev preview/version URLs were not disabled');

await verifyCustomDomain();
await verifyLegacyDisabled();
console.log('Verified api.petruandines.com remains healthy and workers.dev is disabled.');
