import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'dist-cloudflare');
const oldBase = 'https://petruandines.github.io/cleaning-services';
const newBase = 'https://petruandines.com';
const canonicalHostScript = '<script src="/assets/js/canonical-host.js"></script>';
const textTypes = new Set(['.html','.css','.js','.mjs','.json','.txt','.xml','.webmanifest','.svg']);
const files = execFileSync('git', ['ls-files', '-z'], {cwd:root, encoding:'utf8'}).split('\0').filter(Boolean);
const included = files.filter(path => {
  if (path.split('/').some(part => part.startsWith('.'))) return false;
  if (/^(docs|scripts|node_modules|portal-v2-backend|portal-v2-frontend)\//.test(path)) return false;
  if (/\/(test|tests|src)\//.test(path) || /(^|\/)(README[^/]*|package[^/]*)$/.test(path)) return false;
  return !['.md','.yml','.yaml','.sql'].includes(extname(path));
});
rmSync(out, {recursive:true, force:true});
mkdirSync(out, {recursive:true});
for (const path of included) {
  const source = join(root, path), dest = join(out, path);
  if (statSync(source).size > 25 * 1024 * 1024) throw new Error('Pages asset exceeds 25 MiB: ' + path);
  mkdirSync(dirname(dest), {recursive:true});
  let data = readFileSync(source);
  if (textTypes.has(extname(path))) {
    let text = data.toString('utf8').replaceAll(oldBase, newBase).replaceAll('/cleaning-services/', '/');
    if (path.endsWith('.html') && text.includes('<head>') && !text.includes(canonicalHostScript)) {
      text = text.replace('<head>', '<head>\n' + canonicalHostScript);
    }
    if (path === 'portal/app.js') {
      for (const state of ['loginState','accountState']) {
        const needle = " + " + state + ", 'petru-ines-";
        if (!text.includes(needle)) throw new Error('Portal popup source changed: ' + state);
        text = text.replace(needle, " + " + state + " + '&portal_origin=' + encodeURIComponent(window.location.origin), 'petru-ines-");
      }
    }
    data = Buffer.from(text);
  }
  writeFileSync(dest, data);
}
writeFileSync(join(out, '_redirects'), [
  '/cleaning-services / 301',
  '/cleaning-services/* /:splat 301',
  '/portal-v2-frontend /portal/ 301',
  '/portal-v2-frontend/* /portal/:splat 301',
  '',
].join('\n'));
writeFileSync(join(out, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '/portal/*',
  '  Cache-Control: no-store',
  '  X-Robots-Tag: noindex, nofollow',
  '  X-Frame-Options: DENY',
  '',
].join('\n'));

// This deployment is intentionally static-only: do not emit _worker.js or _routes.json.
// Host aliases are redirected client-side by /assets/js/canonical-host.js until
// Cloudflare account-level Bulk Redirects are configured.

// Verify that all local HTML links/assets resolve in the actual upload folder.
const broken = [];
for (const path of included.filter(p => p.endsWith('.html'))) {
  const text = readFileSync(join(out, path), 'utf8');
  if (text.includes('<head>') && !text.includes(canonicalHostScript)) broken.push(path + ' -> canonical host script missing');
  for (const match of text.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/g)) {
    const raw = match[1];
    if (/^(?:#|data:|mailto:|tel:|javascript:)/.test(raw)) continue;
    const url = new URL(raw.replaceAll('&amp;', '&'), newBase + '/' + path);
    if (url.origin !== newBase) continue;
    const target = join(out, decodeURIComponent(url.pathname));
    if (!existsSync(target) && !existsSync(target + '.html') && !existsSync(join(target, 'index.html'))) broken.push(path + ' -> ' + raw);
  }
}
if (existsSync(join(out, '_worker.js')) || existsSync(join(out, '_routes.json'))) {
  throw new Error('Static Pages build must not contain _worker.js or _routes.json');
}
if (broken.length) throw new Error('Broken local links:\n' + broken.join('\n'));
console.log('Cloudflare build:', included.length, 'public files; static-only deployment; all local HTML links verified.');
