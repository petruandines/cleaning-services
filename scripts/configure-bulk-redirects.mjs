import assert from 'node:assert/strict';

const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const LIST_NAME = 'petruandines_canonical_redirects';
const RULE_REF = 'petruandines_canonical_redirects';
const RULE_DESCRIPTION = 'Canonical redirects for Petru & Inés website';
const API = 'https://api.cloudflare.com/client/v4';

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
    const details = Array.isArray(data.errors) ? data.errors.map(e => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ') : '';
    throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}${details ? '; ' + details : ''}`);
  }
  return data.result;
}

async function waitForBulkOperation(operationId) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await cf(`/accounts/${ACCOUNT}/rules/lists/bulk_operations/${operationId}`);
    if (result.status === 'completed') return;
    if (result.status === 'failed') throw new Error(`Cloudflare bulk list operation failed: ${operationId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for Cloudflare bulk list operation: ${operationId}`);
}

function desiredRule() {
  return {
    ref: RULE_REF,
    action: 'redirect',
    expression: `http.request.full_uri in $${LIST_NAME}`,
    description: RULE_DESCRIPTION,
    action_parameters: {
      from_list: {
        name: LIST_NAME,
        key: 'http.request.full_uri',
      },
    },
  };
}

async function ensureRedirectList() {
  const lists = await cf(`/accounts/${ACCOUNT}/rules/lists`);
  let list = lists.find(item => item.name === LIST_NAME);
  if (list && list.kind !== 'redirect') throw new Error(`Existing list ${LIST_NAME} is not a redirect list`);
  if (!list) {
    list = await cf(`/accounts/${ACCOUNT}/rules/lists`, 'POST', {
      name: LIST_NAME,
      description: 'Canonical host redirects for petruandines.com',
      kind: 'redirect',
    });
    console.log('Created Bulk Redirect List:', list.id);
  } else {
    console.log('Using existing Bulk Redirect List:', list.id);
  }

  const redirects = [
    {
      redirect: {
        source_url: 'www.petruandines.com/',
        target_url: 'https://petruandines.com/',
        status_code: 301,
        include_subdomains: false,
        subpath_matching: true,
        preserve_query_string: true,
        preserve_path_suffix: true,
      },
      comment: 'Redirect www to canonical apex domain',
    },
    {
      redirect: {
        source_url: 'petruandines-site.pages.dev/',
        target_url: 'https://petruandines.com/',
        status_code: 301,
        include_subdomains: true,
        subpath_matching: true,
        preserve_query_string: true,
        preserve_path_suffix: true,
      },
      comment: 'Redirect Pages production and preview aliases to canonical domain',
    },
  ];

  const operation = await cf(`/accounts/${ACCOUNT}/rules/lists/${list.id}/items`, 'PUT', redirects);
  await waitForBulkOperation(operation.operation_id);
  console.log('Bulk Redirect List items configured.');
  return list;
}

async function ensureBulkRedirectRule() {
  const rulesets = await cf(`/accounts/${ACCOUNT}/rulesets`);
  let ruleset = rulesets.find(item => item.kind === 'root' && item.phase === 'http_request_redirect');
  const rule = desiredRule();

  if (!ruleset) {
    ruleset = await cf(`/accounts/${ACCOUNT}/rulesets`, 'POST', {
      name: 'Account-level Bulk Redirects',
      description: 'Account-level Bulk Redirect entry point',
      kind: 'root',
      phase: 'http_request_redirect',
      rules: [rule],
    });
    console.log('Created Bulk Redirect phase ruleset:', ruleset.id);
    return;
  }

  const details = await cf(`/accounts/${ACCOUNT}/rulesets/${ruleset.id}`);
  const existing = (details.rules || []).find(item =>
    item.ref === RULE_REF || item.action_parameters?.from_list?.name === LIST_NAME
  );
  if (existing) {
    await cf(`/accounts/${ACCOUNT}/rulesets/${ruleset.id}/rules/${existing.id}`, 'PATCH', rule);
    console.log('Updated existing Bulk Redirect rule:', existing.id);
  } else {
    const created = await cf(`/accounts/${ACCOUNT}/rulesets/${ruleset.id}/rules`, 'POST', rule);
    console.log('Added Bulk Redirect rule:', created.id);
  }
}

async function publicFetch(url) {
  return fetch(url, {
    redirect: 'manual',
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20000),
  });
}

async function verifyRedirect(source, expected) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const response = await publicFetch(source);
    if (response.status === 301 && response.headers.get('location') === expected) {
      console.log('Verified 301:', source, '->', expected);
      return;
    }
    if (attempt === 20) {
      throw new Error(`Redirect verification failed for ${source}: status=${response.status}, location=${response.headers.get('location')}`);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

async function verify() {
  await verifyRedirect(
    'https://www.petruandines.com/portal/?view=calendar',
    'https://petruandines.com/portal/?view=calendar'
  );
  await verifyRedirect(
    'https://petruandines-site.pages.dev/catalog/?source=pages',
    'https://petruandines.com/catalog/?source=pages'
  );
}

const operation = process.argv[2];
if (operation === 'apply') {
  await ensureRedirectList();
  await ensureBulkRedirectRule();
  await verify();
} else if (operation === 'verify') {
  await verify();
} else {
  throw new Error('Usage: node scripts/configure-bulk-redirects.mjs apply|verify');
}
