import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'dist-cloudflare');
const oldBase = 'https://petruandines.github.io/cleaning-services';
const newBase = 'https://petruandines.com';
const oldApi = 'https://petru-ines-portal-api.petruandines.workers.dev';
const newApi = 'https://api.petruandines.com';
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
    let text = data.toString('utf8')
      .replaceAll(oldBase, newBase)
      .replaceAll('/cleaning-services/', '/')
      .replaceAll(oldApi, newApi);
    if (path === 'portal/app.js') {
      // Keep the authentication popup on the canonical portal origin. Safari/iPadOS
      // may sever window.opener for a cross-origin popup; the local page talks to
      // api.petruandines.com over the narrowly allowlisted CORS auth surface.
      const loginOpen = "window.open(API + '/login.html?state=' + loginState, 'petru-ines-login'";
      const localLoginOpen = "window.open('/portal/login.html?state=' + loginState, 'petru-ines-login'";
      if (!text.includes(loginOpen)) throw new Error('Portal login popup source changed');
      text = text.replace(loginOpen, localLoginOpen);

      const loginOriginCheck = "if (!ready() || event.origin !== API || !loginWindow || event.source !== loginWindow ||";
      const localLoginOriginCheck = "if (!ready() || event.origin !== window.location.origin || !loginWindow || event.source !== loginWindow ||";
      if (!text.includes(loginOriginCheck)) throw new Error('Portal login origin guard changed');
      text = text.replace(loginOriginCheck, localLoginOriginCheck);

      // Account creation remains on the API host for now and keeps its explicit
      // return-origin parameter and exact postMessage origin checks.
      const accountNeedle = " + accountState, 'petru-ines-account";
      if (!text.includes(accountNeedle)) throw new Error('Portal account popup source changed');
      text = text.replace(accountNeedle,
        " + accountState + '&portal_origin=' + encodeURIComponent(window.location.origin), 'petru-ines-account");
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
// Host aliases are redirected at Cloudflare account level through Bulk Redirects.

// Verify that all local HTML links/assets resolve in the actual upload folder.
const broken = [];
for (const path of included.filter(p => p.endsWith('.html'))) {
  const text = readFileSync(join(out, path), 'utf8');
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
const portalIndex = readFileSync(join(out, 'portal/index.html'), 'utf8');
const portalConfig = readFileSync(join(out, 'portal/config.js'), 'utf8');
const portalApp = readFileSync(join(out, 'portal/app.js'), 'utf8');
const portalLogin = readFileSync(join(out, 'portal/login.html'), 'utf8');
if (!portalIndex.includes(`connect-src ${newApi}`)) throw new Error('Portal CSP does not use custom API domain');
if (!portalConfig.includes(newApi)) throw new Error('Portal config does not use custom API domain');
if (portalIndex.includes(oldApi) || portalConfig.includes(oldApi)) throw new Error('Legacy workers.dev API leaked into portal build');
if (!portalApp.includes("window.open('/portal/login.html?state=' + loginState")) throw new Error('Portal does not use same-origin login');
if (portalApp.includes("API + '/login.html?state=' + loginState")) throw new Error('Cross-origin login popup leaked into build');
if (!portalApp.includes('event.origin !== window.location.origin || !loginWindow')) throw new Error('Same-origin login message guard missing');
if (!portalLogin.includes('login.js') || !portalLogin.includes('login.css')) throw new Error('Portal login assets missing');
if (broken.length) throw new Error('Broken local links:\n' + broken.join('\n'));
console.log('Cloudflare build:', included.length, 'public files; static-only deployment; same-origin portal login verified.');