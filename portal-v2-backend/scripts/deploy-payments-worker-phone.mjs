/** Guarded Worker update to expose payment creation dates for complete period exports. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as runFields } from './deploy-fields-worker-phone.mjs';

const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';

export function assertChoice(operation, confirmation) {
  if (!['inspect', 'deploy'].includes(operation)) throw new Error('Unknown payments Worker operation');
  if (operation === 'inspect' && confirmation) throw new Error('Inspect confirmation must be empty');
  if (operation === 'deploy' && confirmation !== `UPDATE PORTAL PAYMENTS ${UUID}`)
    throw new Error('Payments deployment requires the exact confirmation');
}

export async function run(operation, confirmation) {
  assertChoice(operation, confirmation);
  // The existing deployment guard verifies the exact EU D1 target, six migration
  // hashes, schema 0006, existing Worker and auth secret before deploying.
  await runFields(operation, operation === 'deploy' ? `UPDATE PORTAL FIELDS ${UUID}` : '');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(process.argv[2], process.argv[3]); }
  catch (error) {
    process.stderr.write(`Stopped: ${error.message}. Check the public Worker before any retry.\n`);
    process.exitCode = 1;
  }
}
