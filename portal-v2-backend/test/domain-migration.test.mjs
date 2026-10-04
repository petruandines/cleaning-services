import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import worker from '../src/index.mjs';
import { handleApi } from '../src/api.mjs';
import { PORTAL_ORIGINS } from '../src/origins.mjs';

const CANONICAL_PORTAL_ORIGIN = 'https://petruandines.com';

test('each exact portal origin has CORS while canonical portal auth is explicitly allowlisted', async () => {
  const base = 'https://api.petruandines.com';
  for (const origin of PORTAL_ORIGINS) {
    const request = path => new Request(base + path, {headers:{Origin:origin}});
    const anonymous = await handleApi(request('/api/me'), {auth:{api:{getSession:async () => null}},db:null});
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get('access-control-allow-origin'), origin);
    const preflight = await handleApi(new Request(base + '/api/me', {method:'OPTIONS',headers:{Origin:origin}}), {});
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    const login = await worker.fetch(new Request(base + '/api/auth/sign-in/email', {method:'OPTIONS',headers:{Origin:origin}}), {});
    if (origin === CANONICAL_PORTAL_ORIGIN) {
      assert.equal(login.status, 204);
      assert.equal(login.headers.get('access-control-allow-origin'), origin);
      assert.equal(login.headers.get('access-control-allow-credentials'), 'true');
    } else {
      assert.equal(login.status, 403);
    }
    const logout = await worker.fetch(new Request(base + '/api/auth/sign-out', {method:'OPTIONS',headers:{Origin:origin}}), {});
    assert.equal(logout.status, 204);
    assert.equal(logout.headers.get('access-control-allow-origin'), origin);
  }
});

test('lookalike and unrelated origins are rejected before auth or database access', async () => {
  for (const origin of ['https://petruandines.com.attacker.test','http://petruandines.com','null','https://attacker.test']) {
    const request = new Request('https://api.petruandines.com/api/me', {headers:{Origin:origin}});
    const response = await handleApi(request, {});
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal((await worker.fetch(request, {})).status, 403);
  }
});

function popup(file, origin) {
  const elements = new Map(), messages = [], handlers = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {hidden:false,addEventListener:(event, fn) => handlers.set(id + ':' + event, fn)});
    return elements.get(id);
  };
  const state = 'a'.repeat(32);
  const window = {opener:{postMessage:(data,target) => messages.push({data,target})},addEventListener(){},close(){}};
  const context = {URL,Response,location:{href:'https://api.example/login.html?state=' + state + (origin === undefined ? '' : '&portal_origin=' + encodeURIComponent(origin))},
    window,document:{getElementById:element},fetch:async url => url === '/api/me' ?
      new Response(JSON.stringify({id:'fixture',role:'client'}),{status:200}) :
      new Response('{}',{status:200,headers:{'set-auth-token':'fixture-session-token'}})};
  vm.runInNewContext(readFileSync(new URL('../public/' + file, import.meta.url),'utf8'),context);
  return {elements,messages,handlers,state};
}

test('legacy API-hosted login sends the session only to the selected allowlisted opener', async () => {
  for (const origin of [undefined,...PORTAL_ORIGINS]) {
    const p = popup('login.js',origin);
    const form = {elements:{trustDevice:{checked:false},email:{value:'fixture@example.test'},password:{value:'fixture-password'}},querySelector:() => ({disabled:false})};
    await p.handlers.get('password-form:submit')({preventDefault(){},currentTarget:form});
    assert.equal(p.messages.length,1);
    assert.equal(p.messages[0].target,origin || 'https://petruandines.github.io');
    assert.equal(p.messages[0].data.state,p.state);
    assert.equal(p.messages[0].data.token,'fixture-session-token');
  }
});

test('legacy login and account popups reject an untrusted return origin before accepting input', () => {
  for (const file of ['login.js','account.js']) {
    const p = popup(file,'https://attacker.test');
    assert.equal(p.messages.length,0);
    assert.equal(p.handlers.size,0);
    assert.equal(p.elements.get('error').hidden,false);
  }
});