import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const html = readFileSync(new URL('../../portal-v2-backend/public/account.html', import.meta.url), 'utf8');
const code = readFileSync(new URL('../../portal-v2-backend/public/account.js', import.meta.url), 'utf8');
function setup(account = null) {
  const state = 'a'.repeat(32), origin = 'https://petruandines.com';
  const dom = new JSDOM(html, { url: 'https://api.petruandines.com/account.html?state=' + state + '&portal_origin=' + origin,
    runScripts: 'outside-only' });
  const w = dom.window, messages = [], requests = [];
  const opener = { postMessage(data, target) { messages.push({ data, target }); } };
  Object.defineProperty(w, 'opener', { value: opener });
  w.fetch = async (url, init) => { requests.push({ url, ...init }); return { ok: true, json: async () => ({ id: 'u1' }) }; };
  w.eval(code);
  function start(from = origin, source = opener, value = state) {
    w.dispatchEvent(new w.MessageEvent('message', { origin: from, source,
      data: { type: 'portal-account-start', state: value, token: 'admin-token', clientId: 'c', clientLabel: 'Client', account } }));
  }
  return { w, d: w.document, start, messages, requests, close: () => w.close() };
}

test('popup rejects wrong origin, source and state before accepting an editable account', () => {
  const a = setup({ id: 'u1', name: 'Client', email: 'client@example.test' });
  try {
    a.start('https://untrusted.example'); a.start('https://petruandines.com', {}); a.start(undefined, undefined, 'b'.repeat(32));
    assert.equal(a.d.getElementById('ready').hidden, true);
    a.start(); assert.equal(a.d.getElementById('ready').hidden, false);
    assert.equal(a.d.getElementById('password-controls').hidden, true);
    assert.equal(a.d.getElementById('account-form').elements.password.required, false);
  } finally { a.close(); }
});

test('editing sends a scoped PATCH and no password until reset is selected', async () => {
  const a = setup({ id: 'u1', name: 'Client', email: 'client@example.test' });
  try {
    a.start(); const form = a.d.getElementById('account-form');
    form.elements.name.value = 'Edited'; form.elements.email.value = 'edited@example.test';
    assert.equal(form.checkValidity(), true);
    form.dispatchEvent(new a.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
    assert.equal(a.requests[0].url, '/api/users/u1'); assert.equal(a.requests[0].method, 'PATCH');
    assert.deepEqual(JSON.parse(a.requests[0].body), { client_id: 'c', name: 'Edited', email: 'edited@example.test' });
    assert.equal(a.messages.at(-1).data.type, 'portal-account-updated');
  } finally { a.close(); }
});

test('password reset requires saved temporary password and clears it after updating', async () => {
  const a = setup({ id: 'u2', name: 'Client', email: 'client@example.test', resetPassword: true });
  try {
    a.start(); const form = a.d.getElementById('account-form');
    assert.equal(a.d.getElementById('password-controls').hidden, false);
    assert.equal(form.elements.password.required, true); assert.equal(form.elements.saved.required, true);
    form.elements.password.value = 'temporary-new-password'; assert.equal(form.checkValidity(), false);
    form.elements.saved.checked = true; assert.equal(form.checkValidity(), true);
    form.dispatchEvent(new a.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
    assert.equal(a.requests[0].url, '/api/users/u2');
    assert.equal(JSON.parse(a.requests[0].body).password, 'temporary-new-password');
    assert.equal(form.elements.password.value, ''); assert.match(a.d.getElementById('done-hint').textContent, /parolă nouă/);
  } finally { a.close(); }
});

test('new account creation still sends POST with mandatory temporary password', async () => {
  const a = setup();
  try {
    a.start(); const form = a.d.getElementById('account-form');
    form.elements.name.value = 'New'; form.elements.email.value = 'new@example.test';
    form.elements.password.value = 'new-temporary-password'; form.elements.saved.checked = true;
    assert.equal(form.checkValidity(), true);
    form.dispatchEvent(new a.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
    assert.equal(a.requests[0].url, '/api/users'); assert.equal(a.requests[0].method, 'POST');
    assert.equal(a.messages.at(-1).data.type, 'portal-account-created');
  } finally { a.close(); }
});

test('duplicate email error keeps the edit form available for correction', async () => {
  const a = setup({ id: 'u1', name: 'Client', email: 'client@example.test' });
  try {
    a.w.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'email_in_use' }) });
    a.start(); const form = a.d.getElementById('account-form');
    form.dispatchEvent(new a.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
    assert.match(a.d.getElementById('error').textContent, /altui cont/);
    assert.equal(a.d.getElementById('ready').hidden, false);
    assert.equal(a.d.getElementById('submit-account').disabled, false);
  } finally { a.close(); }
});
