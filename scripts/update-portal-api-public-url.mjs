import assert from 'node:assert/strict';

const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const SCRIPT = 'petru-ines-portal-api';
const OLD_URL = 'https://petru-ines-portal-api.petruandines.workers.dev';
const NEW_URL = 'https://api.petruandines.com';
const DB_ID = '6816004b-dc95-48c9-be52-9bd4131d157e';
const API = 'https://api.cloudflare.com/client/v4';
const ORIGIN = 'https://petruandines.com';
const SETTINGS_PATH = `/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/settings`;

function cloudflareError(method, path, response, data) {
  const details = Array.isArray(data.errors)
    ? data.errors.map(error => `${error.code ?? ''} ${error.message ?? ''}`.trim()).join('; ')
    : '';
  return new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}${details ? '; ' + details : ''}`);
}

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
  if (!response.ok || data.success !== true) throw cloudflareError(method, path, response, data);
  return data.result;
}

async function cfPatchSettings(settings) {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, 'Missing CLOUDFLARE_API_TOKEN');
  const boundary = '----petruines-' + crypto.randomUUID();
  const payload = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="settings"\r\n',
    'Content-Type: application/json\r\n\r\n',
    JSON.stringify(settings),
    `\r\n--${boundary}--\r\n`,
  ].join('');
  const response = await fetch(API + SETTINGS_PATH, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: payload,
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) throw cloudflareError('PATCH', SETTINGS_PATH, response, data);
  return data.result;
}

function assertBindings(settings, expectedUrl) {
  const bindings = settings.bindings || [];
  const names = bindings.map(binding => binding.name).sort();
  assert.deepEqual(names, ['BETTER_AUTH_SECRET', 'DB', 'PUBLIC_API_URL']);
  const db = bindings.find(binding => binding.name === 'DB');
  const secret = bindings.find(binding => binding.name === 'BETTER_AUTH_SECRET');
  const publicUrl = bindings.find(binding => binding.name === 'PUBLIC_API_URL');
  assert.equal(db?.type, 'd1');
  assert.equal(db?.id, DB_ID);
  assert.equal(secret?.type, 'secret_text');
  assert.equal(publicUrl?.type, 'plain_text');
  assert.equal(publicUrl?.text, expectedUrl);
}

async function verifyEndpoint(url) {
  const response = await fetch(url + '/api/me', {
    redirect: 'manual',
    headers: { Origin: ORIGIN, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 401, url + '/api/me');
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN, 'CORS mismatch for ' + url);
}

async function apply() {
  const before = await cf(SETTINGS_PATH);
  const currentUrl = before.bindings?.find(binding => binding.name === 'PUBLIC_API_URL')?.text;
  assert.ok(currentUrl === OLD_URL || currentUrl === NEW_URL, `Unexpected PUBLIC_API_URL: ${currentUrl}`);
  assertBindings(before, currentUrl);

  if (currentUrl !== NEW_URL) {
    const bindings = before.bindings.map(binding => {
      if (binding.name === 'PUBLIC_API_URL') {
        return { name: 'PUBLIC_API_URL', type: 'plain_text', text: NEW_URL };
      }
      return { name: binding.name, type: 'inherit', version_id: 'latest' };
    });
    await cfPatchSettings({ bindings });
    console.log('Updated PUBLIC_API_URL while inheriting DB and auth-secret bindings.');
  } else {
    console.log('PUBLIC_API_URL already uses the custom API domain.');
  }

  const after = await cf(SETTINGS_PATH);
  assertBindings(after, NEW_URL);
  await verifyEndpoint(NEW_URL);
  await verifyEndpoint(OLD_URL);
  console.log('Verified new and legacy API endpoints after binding-only update.');
}

if (process.argv[2] === 'apply') {
  await apply();
} else {
  throw new Error('Usage: node scripts/update-portal-api-public-url.mjs apply');
}
