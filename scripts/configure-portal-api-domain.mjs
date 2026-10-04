import assert from 'node:assert/strict';

const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const ZONE = '556df3da801c06b34a4dcd7ea25c0d06';
const HOSTNAME = 'api.petruandines.com';
const SERVICE = 'petru-ines-portal-api';
const API = 'https://api.cloudflare.com/client/v4';
const ORIGIN = 'https://petruandines.com';

async function cf(path, method = 'GET', body) {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, 'Missing CLOUDFLARE_API_TOKEN');
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN,
      'Content-Type': 'application/json',
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

async function ensureCustomDomain() {
  const domains = await cf(`/accounts/${ACCOUNT}/workers/domains`);
  const existing = domains.find(domain => domain.hostname === HOSTNAME);
  if (existing) {
    assert.equal(existing.service, SERVICE, `${HOSTNAME} is attached to an unexpected Worker`);
    assert.equal(existing.zone_id, ZONE, `${HOSTNAME} is attached to an unexpected zone`);
    console.log('Worker custom domain already attached:', HOSTNAME);
    return existing;
  }

  const attached = await cf(`/accounts/${ACCOUNT}/workers/domains`, 'PUT', {
    hostname: HOSTNAME,
    service: SERVICE,
    zone_id: ZONE,
    zone_name: 'petruandines.com',
  });
  console.log('Attached Worker custom domain:', attached.hostname, '->', attached.service);
  return attached;
}

async function verifyLive() {
  let last = 'not attempted';
  for (let attempt = 1; attempt <= 24; attempt++) {
    try {
      const response = await fetch(`https://${HOSTNAME}/api/me`, {
        redirect: 'manual',
        headers: {
          Origin: ORIGIN,
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(20000),
      });
      const allowOrigin = response.headers.get('access-control-allow-origin');
      if (response.status === 401 && allowOrigin === ORIGIN) {
        console.log('Verified live API custom domain:', HOSTNAME, 'status=401, CORS origin accepted');
        return;
      }
      last = `status=${response.status}, access-control-allow-origin=${allowOrigin}`;
    } catch (error) {
      last = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`Custom domain did not become healthy: ${last}`);
}

const operation = process.argv[2];
if (operation === 'apply') {
  await ensureCustomDomain();
  await verifyLive();
} else if (operation === 'verify') {
  await verifyLive();
} else {
  throw new Error('Usage: node scripts/configure-portal-api-domain.mjs apply|verify');
}
