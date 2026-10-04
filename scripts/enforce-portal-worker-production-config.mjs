import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
assert.ok(path, 'Usage: node scripts/enforce-portal-worker-production-config.mjs <wrangler.jsonc>');

const raw = readFileSync(path, 'utf8');
let config;
try {
  config = JSON.parse(raw);
} catch (error) {
  throw new Error(`Refusing to deploy because ${path} is not plain JSON-compatible JSONC: ${error.message}`);
}

assert.equal(config.name, 'petru-ines-portal-api', 'Unexpected Worker name');
const d1 = (config.d1_databases || []).find(item => item.binding === 'DB');
assert.equal(d1?.database_id, '6816004b-dc95-48c9-be52-9bd4131d157e', 'Unexpected D1 binding');

config.workers_dev = false;
config.preview_urls = false;
config.vars = {
  ...(config.vars || {}),
  PUBLIC_API_URL: 'https://api.petruandines.com',
};

writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log('Enforced portal Worker production routing: workers_dev=false, preview_urls=false, PUBLIC_API_URL=https://api.petruandines.com');
