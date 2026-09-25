/** Apply tracked D1 migrations only after checking the remote database identity. */
import { spawnSync } from 'node:child_process';
import { verifyRemoteD1 } from './verify-remote-d1.mjs';

if (!process.stdin.isTTY) {
  process.stderr.write('Run this command in an interactive terminal on your trusted device.\n');
  process.exit(1);
}

let details;
try {
  details = verifyRemoteD1();
} catch {
  process.stderr.write('Remote D1 identity could not be verified; no migration was attempted.\n');
  process.exit(1);
}

process.stdout.write('Verified remote D1 UUID, name and EU jurisdiction. Wrangler will show pending migrations and request confirmation.\n');
const result = spawnSync(process.execPath,
  [details.wrangler, 'd1', 'migrations', 'apply', details.expected.database_name, '--remote'],
  { cwd: details.root, stdio: 'inherit' });
if (result.error) {
  process.stderr.write('Wrangler could not start.\n');
  process.exit(1);
}
process.exitCode = result.status ?? 1;
