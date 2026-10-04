import assert from 'node:assert/strict';

const ZONE = '556df3da801c06b34a4dcd7ea25c0d06';
const API = 'https://api.cloudflare.com/client/v4';
const PHASE = 'http_ratelimit';
const REF = 'petru_ines_portal_login_rate_limit';
const DESCRIPTION = 'Protect portal login from brute-force attempts';

const desiredRule = {
  ref: REF,
  description: DESCRIPTION,
  expression: '(http.request.uri.path eq "/api/auth/sign-in/email")',
  action: 'block',
  ratelimit: {
    characteristics: ['cf.colo.id', 'ip.src'],
    period: 10,
    requests_per_period: 5,
    mitigation_timeout: 10,
  },
  enabled: true,
};

async function request(path, method = 'GET', body, { allow404 = false } = {}) {
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
  if (allow404 && response.status === 404) return null;
  if (!response.ok || data.success !== true) {
    const details = Array.isArray(data.errors)
      ? data.errors.map(error => `${error.code ?? ''} ${error.message ?? ''}`.trim()).join('; ')
      : '';
    throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}${details ? '; ' + details : ''}`);
  }
  return data.result;
}

function assertRule(rule) {
  assert.equal(rule.ref, REF);
  assert.equal(rule.action, 'block');
  assert.equal(rule.expression, desiredRule.expression);
  assert.equal(rule.enabled, true);
  assert.deepEqual(rule.ratelimit?.characteristics, ['cf.colo.id', 'ip.src']);
  assert.equal(rule.ratelimit?.period, 10);
  assert.equal(rule.ratelimit?.requests_per_period, 5);
  assert.equal(rule.ratelimit?.mitigation_timeout, 10);
}

async function getEntryPoint() {
  return request(`/zones/${ZONE}/rulesets/phases/${PHASE}/entrypoint`, 'GET', undefined, { allow404: true });
}

async function apply() {
  let ruleset = await getEntryPoint();
  if (!ruleset) {
    ruleset = await request(`/zones/${ZONE}/rulesets`, 'POST', {
      name: 'Zone rate limiting',
      description: 'Zone-level rate limiting rules',
      kind: 'zone',
      phase: PHASE,
      rules: [desiredRule],
    });
    console.log('Created zone rate limiting entry point:', ruleset.id);
  } else {
    const rules = ruleset.rules || [];
    const ours = rules.find(rule => rule.ref === REF);
    const unrelated = rules.filter(rule => rule.ref !== REF);
    if (unrelated.length) {
      throw new Error(`Refusing to alter existing unrelated rate limiting rule(s): ${unrelated.map(rule => rule.description || rule.id).join(', ')}`);
    }
    if (ours) {
      ruleset = await request(`/zones/${ZONE}/rulesets/${ruleset.id}/rules/${ours.id}`, 'PATCH', desiredRule);
      console.log('Updated existing portal login rate limit.');
    } else {
      ruleset = await request(`/zones/${ZONE}/rulesets/${ruleset.id}/rules`, 'POST', desiredRule);
      console.log('Added portal login rate limit.');
    }
  }

  const verified = await getEntryPoint();
  assert.ok(verified, 'Rate limiting entry point missing after apply');
  const rule = (verified.rules || []).find(item => item.ref === REF);
  assert.ok(rule, 'Portal login rate limit rule missing after apply');
  assertRule(rule);
  assert.equal((verified.rules || []).length, 1, 'Unexpected additional rate limiting rules');
  console.log('Verified login rate limit: 5 requests / 10 seconds / IP, block for 10 seconds.');
}

if (process.argv[2] === 'apply') await apply();
else throw new Error('Usage: node scripts/configure-login-rate-limit.mjs apply');
