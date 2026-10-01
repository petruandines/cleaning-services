/** Guarded Worker update for message privacy and per-conversation read receipts. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as runFields } from './deploy-fields-worker-phone.mjs';

const UUID = '6816004b-dc95-48c9-be52-9bd4131d157e';

export function assertChoice(operation, confirmation) {
  if (!['inspect', 'deploy'].includes(operation)) throw new Error('Unknown messages Worker operation');
  if (operation === 'inspect' && confirmation) throw new Error('Inspect confirmation must be empty');
  if (operation === 'deploy' && confirmation !== `UPDATE PORTAL MESSAGES ${UUID}`)
    throw new Error('Messages deployment requires the exact confirmation');
}

export async function run(operation, confirmation) {
  assertChoice(operation, confirmation);
  // Retain the previously verified EU D1, migration hashes, existing Worker,
  // persistent auth secret and public authentication checks.
  await runFields(operation, operation === 'deploy' ? `UPDATE PORTAL FIELDS ${UUID}` : '');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(process.argv[2], process.argv[3]); }
  catch (error) {
    process.stderr.write(`Stopped: ${error.message}. Check the public Worker before any retry.\n`);
    process.exitCode = 1;
  }
}
