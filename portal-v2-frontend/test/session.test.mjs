import test from 'node:test';
import assert from 'node:assert/strict';
import { forgetTabSession, readTabSession, rememberTabSession } from '../session.mjs';

function browser() {
  const contents = new Map();
  return { sessionStorage: {
    getItem: key => contents.get(key) ?? null,
    setItem: (key, value) => contents.set(key, value),
    removeItem: key => contents.delete(key),
  }, contents };
}

test('remembered token survives page state reset, expires, and is removed by logout', () => {
  const tab = browser();
  tab.sessionStorage.setItem('other-project', 'keep me');
  const start = 1720000000000;
  assert.equal(rememberTabSession(tab, 'signed-session', start), true);
  assert.equal(readTabSession(tab, start + 60_000), 'signed-session');
  assert.equal(readTabSession(tab, start + 8 * 60 * 60 * 1000), null);
  assert.equal(tab.contents.size, 1);
  rememberTabSession(tab, 'new-session', start);
  forgetTabSession(tab);
  assert.equal(readTabSession(tab, start), null);
  assert.equal(tab.sessionStorage.getItem('other-project'), 'keep me');
});

test('invalid or unavailable tab storage cannot restore a session', () => {
  const tab = browser();
  assert.equal(rememberTabSession(tab, '', 1), false);
  tab.sessionStorage.setItem('petru-ines-portal-v2-session', '{broken');
  assert.equal(readTabSession(tab, 1), null);
  tab.sessionStorage.setItem('petru-ines-portal-v2-session', JSON.stringify({ token: 't', expiresAt: 99999999 }));
  assert.equal(readTabSession(tab, 1), null);
  const blocked = { get sessionStorage() { throw new Error('disabled'); } };
  assert.equal(rememberTabSession(blocked, 'token'), false);
  assert.equal(readTabSession(blocked), null);
  assert.doesNotThrow(() => forgetTabSession(blocked));
});
