import assert from 'node:assert/strict';

const ACCOUNT = '47b9f8498a9865c0fbbaca8f0f5cf59d';
const ZONE = '556df3da801c06b34a4dcd7ea25c0d06';
const DOMAIN = 'petruandines.com';
const PROJECT = 'petruandines-site';
const PREVIEW = 'https://petruandines-site.pages.dev';
const API = 'https://petru-ines-portal-api.petruandines.workers.dev';
const PROJECT_PATH = `/accounts/${ACCOUNT}/pages/projects/${PROJECT}`;

async function cf(path, method='GET', body) {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, 'Missing migration token');
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method, headers: {Authorization:'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'Content-Type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}; ${(data.errors || []).map(e => e.code + ' ' + e.message).join('; ')}`);
  return data.result;
}

async function inspect() {
  const zone = await cf('/zones/' + ZONE);
  assert.equal(zone.name,DOMAIN); assert.equal(zone.account.id,ACCOUNT); assert.equal(zone.status,'active');
  const settings = await cf(`/accounts/${ACCOUNT}/workers/scripts/petru-ines-portal-api/settings`);
  assert.equal(settings.bindings.find(b => b.name === 'DB')?.id,'6816004b-dc95-48c9-be52-9bd4131d157e');
  assert.ok(settings.bindings.some(b => b.name === 'BETTER_AUTH_SECRET' && b.type === 'secret_text'));
  assert.equal(settings.bindings.find(b => b.name === 'PUBLIC_API_URL')?.text,API);
  assert.deepEqual(settings.bindings.map(b => b.name).sort(),['BETTER_AUTH_SECRET','DB','PUBLIC_API_URL']);
  assert.equal(settings.compatibility_date,'2026-09-24');
  assert.deepEqual(settings.compatibility_flags,['nodejs_compat']);
  console.log('Verified target zone, existing Worker configuration, unchanged D1 binding and authentication secret presence.');
}

async function getProject() {
  const project = await cf(PROJECT_PATH);
  assert.equal(project.name,PROJECT);
  assert.equal(project.subdomain,'petruandines-site.pages.dev');
  assert.equal(project.production_branch,'main');
  return project;
}

async function publicFetch(url, options={}) {
  return fetch(url,{...options,signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache',...options.headers}});
}

async function verifySite(base) {
  for (const [path,marker] of [
    ['/','https://petruandines.com/'], ['/portal/','Portal clienți'],
    ['/portal/app.js','portal_origin='], ['/catalog/','<html'],
    ['/oferte/','<html'], ['/sitemap.xml','https://petruandines.com/'],
  ]) {
    const response = await publicFetch(base + path);
    assert.equal(response.status,200,base + path);
    const text = await response.text();
    assert.ok(text.includes(marker),'Content marker missing: ' + path);
    if (path === '/' || path === '/sitemap.xml') assert.ok(!text.includes('petruandines.github.io/cleaning-services'));
    if (path === '/portal/') assert.match(response.headers.get('cache-control') || '',/no-store/);
  }
  const missing = await publicFetch(base + '/migration-missing-page-check');
  assert.equal(missing.status,404,'Missing routes must not serve a login or home page');
  console.log('Public site verified:',base,'including portal assets, catalog, offer, sitemap and 404.');
}

async function verifyPortal() {
  for (const origin of ['https://petruandines.github.io','https://petruandines.com',PREVIEW]) {
    const response = await publicFetch(API + '/api/me',{headers:{Origin:origin}});
    assert.equal(response.status,401,'Anonymous portal must stay closed');
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
    const preflight = await publicFetch(API + '/api/me',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
    const login = await publicFetch(API + '/api/auth/sign-in/email',{method:'OPTIONS',headers:{Origin:origin}});
    assert.equal(login.status,403,'Credentials must remain in the login popup');
  }
  const foreign = await publicFetch(API + '/api/me',{headers:{Origin:'https://attacker.example'}});
  assert.equal(foreign.status,403);
  for (const file of ['login.js','account.js']) {
    const response = await publicFetch(API + '/' + file);
    assert.equal(response.status,200);
    const text = await response.text();
    assert.ok(text.includes('validPortalOrigin') && text.includes('https://petruandines.com'));
  }
  console.log('Live portal verified: custom/legacy origin support, popup origin validation and anonymous access denied.');
}

async function retry(check, attempts=8) {
  for (let attempt=1; attempt<=attempts; attempt++) {
    try { return await check(); }
    catch (error) {
      if (attempt === attempts) throw error;
      console.log('Waiting for deployment propagation:',error.message);
      await new Promise(resolve => setTimeout(resolve,5000));
    }
  }
}

async function connectDomains() {
  const project = await getProject();
  const existing = await cf(PROJECT_PATH + '/domains');
  for (const name of [DOMAIN,'www.' + DOMAIN]) {
    const recordsPath = '/zones/' + ZONE + '/dns_records';
    const records = await cf(recordsPath + '?name=' + name);
    const web = records.filter(r => ['CNAME','A','AAAA'].includes(r.type));
    assert.ok(web.length === 0 || (web.length === 1 && web[0].type === 'CNAME' && web[0].content === project.subdomain), 'Refusing to replace conflicting web DNS for ' + name);
    if (!existing.some(d => d.name === name)) {
      const domain = await cf(PROJECT_PATH + '/domains','POST',{name});
      console.log('Attached custom domain:',domain.name,domain.status);
    }
    const current = await cf(recordsPath + '?name=' + name + '&type=CNAME');
    if (!current.length) {
      await cf(recordsPath,'POST',{type:'CNAME',name,content:project.subdomain,proxied:true,ttl:1});
      console.log('Created DNS CNAME:',name,'->',project.subdomain);
    } else assert.equal(current[0].content,project.subdomain);
  }
  console.log('Custom domain states:',JSON.stringify((await cf(PROJECT_PATH + '/domains')).map(d => ({name:d.name,status:d.status}))));
}

async function verifyAliasRedirect(origin) {
  const path = '/portal/?view=calendar';
  const response = await publicFetch(origin + path,{redirect:'manual'});
  const expected = 'https://' + DOMAIN + path;
  assert.equal(response.status,301,'Alias must redirect with permanent 301');
  assert.equal(response.headers.get('location'),expected);
}

const operation = process.argv[2];
if (operation === 'inspect') {
  await inspect();
  await getProject();
} else if (operation === 'prepare') {
  await inspect();
  const projects = await cf(`/accounts/${ACCOUNT}/pages/projects`);
  if (!projects.some(p => p.name === PROJECT)) {
    await cf(`/accounts/${ACCOUNT}/pages/projects`,'POST',{name:PROJECT,production_branch:'main'});
    console.log('Created Pages project:',PROJECT);
  }
  await getProject();
} else if (operation === 'verify-preview') {
  await retry(() => verifySite(PREVIEW));
  await retry(verifyPortal);
  await inspect();
} else if (operation === 'connect') {
  await verifySite(PREVIEW);
  await verifyPortal();
  await connectDomains();
} else if (operation === 'verify-domain') {
  await retry(async () => {
    await verifySite('https://' + DOMAIN);
    for (const origin of ['https://www.' + DOMAIN,PREVIEW]) await verifyAliasRedirect(origin);
  },18);
  await verifyPortal();
} else throw new Error('Unknown migration operation');
