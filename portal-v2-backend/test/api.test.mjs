import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleApi, ORIGIN } from '../src/api.mjs';

const schema = readFileSync(new URL('../../docs/portal-v2/0001_app_schema.sql', import.meta.url), 'utf8');
const now = '2026-09-24T10:00:00Z';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(schema);
  for (const id of ['a', 'b']) {
    sqlite.prepare('INSERT INTO clients (id,kind,display_name,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run(id, 'PF', id, now, now);
    sqlite.prepare('INSERT INTO client_users (user_id,client_id,created_at) VALUES (?,?,?)')
      .run('user_' + id, id, now);
    sqlite.prepare('INSERT INTO locations (id,client_id,label,address,city,county,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run('loc_' + id, id, 'Locație', 'Strada Test', 'București', 'București', now, now);
    sqlite.prepare('INSERT INTO appointments (id,client_id,location_id,starts_at,ends_at,status,internal_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('ap_' + id, id, 'loc_' + id, now, '2026-09-24T11:00:00Z', 'confirmed', 'notă privată', now, now);
  }
  const db = {
    prepare(sql) {
      return { bind(...args) { const statement = sqlite.prepare(sql); return {
        async all() { return { results: statement.all(...args) }; },
        async run() { return statement.run(...args); },
      }; }};
    },
  };
  const auth = { api: { async getSession({ headers }) {
    const token = headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!['a', 'b', 'admin'].includes(token)) return null;
    return { user: { id: token === 'admin' ? 'owner' : 'user_' + token,
      name: token, role: token === 'admin' ? 'admin' : 'user' } };
  } } };
  async function call(path, token, init = {}) {
    const request = new Request('https://api.example.test/api/' + path, {
      ...init,
      headers: { Origin: ORIGIN, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(init.headers || {}) },
    });
    return handleApi(request, { db, auth });
  }
  return { call, sqlite };
}

test('anonymous and foreign origin cannot read records', async () => {
  const { call } = setup();
  assert.equal((await call('appointments')).status, 401);
  assert.equal((await call('appointments', 'a', { headers: { Origin: 'https://other.example' } })).status, 403);
});

test('client sees only own appointment and no internal note; staff sees both', async () => {
  const { call } = setup();
  const a = await (await call('appointments', 'a')).json();
  const b = await (await call('appointments', 'b')).json();
  const staff = await (await call('appointments', 'admin')).json();
  assert.deepEqual(a.rows.map(row => row.id), ['ap_a']);
  assert.deepEqual(b.rows.map(row => row.id), ['ap_b']);
  assert.deepEqual(staff.rows.map(row => row.id).sort(), ['ap_a', 'ap_b']);
  assert.equal('internal_note' in a.rows[0], false);
  assert.equal((await call('clients', 'a')).status, 403);
  assert.equal((await call('clients', 'admin')).status, 200);
});

test('message write derives company from session, ignores forged client ID', async () => {
  const { call, sqlite } = setup();
  const response = await call('messages', 'a', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'b', body: 'Bună ziua!' }),
  });
  assert.equal(response.status, 201);
  assert.equal(sqlite.prepare('SELECT client_id FROM messages').get().client_id, 'a');
  assert.equal((await call('messages', 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"body":"salut"}' })).status, 403);
});
