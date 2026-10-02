import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['app.js', 'config.js', 'index.html', 'portal.css', 'session.mjs',
  'appointment-view.mjs', 'calendar-export.mjs', 'payments-export.mjs', 'contract-view.mjs'];
mkdirSync(resolve(root, 'portal'), { recursive: true });
for (const name of files) {
  const source = resolve(root, 'portal-v2-frontend', name);
  const target = resolve(root, 'portal', name);
  if (name === 'index.html') writeFileSync(target,
    readFileSync(source, 'utf8').replace(/\?v=[a-zA-Z0-9-]+/g, '?v=portal-v2-20261002'));
  else copyFileSync(source, target);
}
console.log('Published portal assets prepared from the reviewed v2 frontend.');
