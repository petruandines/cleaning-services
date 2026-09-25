import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleApi, ORIGIN } from '../src/api.mjs';

const schema = readFileSync(new URL('../../docs/portal-v2/0001_app_schema.sql', import.meta.url), 'utf8');
const authSchema = readFileSync(new URL('../../docs/portal-v2/0002_auth.sql', import.meta.url), 'utf8');
const accountSchema = readFileSync(new URL('../../docs/portal-v2/0003_portal_accounts.sql', import.meta.url), 'utf8');
const contactSchema = readFileSync(new URL('../../docs/portal-v2/0004_location_contact.sql', import.meta.url), 'utf8');
const archiveSchema = readFileSync(new URL('../../docs/portal-v2/0005_soft_delete.sql', import.meta.url), 'utf8');
const now = '2026-09-24T10:00:00Z';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(schema);
  sqlite.exec(authSchema);
  sqlite.exec(accountSchema);
  sqlite.exec(contactSchema);
  sqlite.exec(archiveSchema);
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
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const auth = { api: { async getSession({ headers }) {
    const token = headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!['a', 'b', 'admin', 'admin_pending'].includes(token)) return null;
    const staff = token.startsWith('admin');
    return { user: { id: staff ? 'owner' : 'user_' + token,
      name: token, role: staff ? 'admin' : 'user', twoFactorEnabled: token === 'admin' } };
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
  assert.equal(a.rows[0].client_name, 'a');
  assert.equal(a.rows[0].location_name, 'Locație');
  assert.equal(a.rows[0].location_address, 'Strada Test');
  assert.equal(b.rows[0].client_name, 'b');
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
  const ownMessages = await (await call('messages', 'a')).json();
  const otherMessages = await (await call('messages', 'b')).json();
  assert.equal(ownMessages.rows[0].client_name, 'a');
  assert.equal(otherMessages.rows.length, 0);
  assert.equal(sqlite.prepare('SELECT client_id, actor_user_id FROM audit_events').get().actor_user_id, 'user_a');
  assert.equal((await call('messages', 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"body":"salut"}' })).status, 400);
});

test('staff data stays closed until TOTP is enabled', async () => {
  const { call } = setup();
  assert.equal((await call('clients', 'admin_pending')).status, 403);
  const me = await (await call('me', 'admin_pending')).json();
  assert.equal(me.twoFactorRequired, true);
});

test('staff creates a complete client history with atomic audit; client isolation stays intact', async () => {
  const { call, sqlite } = setup();
  const post = async (table, data, token = 'admin') => call(table, token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const created = await post('clients', { kind: 'PJ', display_name: 'Firma Exemplu', email: 'office@example.test' });
  assert.equal(created.status, 201);
  const client = (await created.json()).id;
  const location = await post('locations', { client_id: client, label: 'Sediu', address: 'Str. Exemplu 1', city: 'București', county: 'București' });
  assert.equal(location.status, 201);
  const locationId = (await location.json()).id;
  const appointment = await post('appointments', {
    client_id: client, location_id: locationId, starts_at: '2026-10-01T08:00:00.000Z', ends_at: '2026-10-01T10:00:00.000Z',
    estimated_cost_bani: 70000,
  });
  assert.equal(appointment.status, 201);
  const job = await post('jobs', {
    client_id: client, appointment_id: (await appointment.json()).id, service_name: 'Curățenie', price_bani: 70000,
  });
  assert.equal(job.status, 201);
  const payment = await post('payments', {
    client_id: client, job_id: (await job.json()).id, amount_bani: 70000, status: 'confirmed',
  });
  assert.equal(payment.status, 201);
  const message = await post('messages', { client_id: client, body: 'Bună ziua!' });
  assert.equal(message.status, 201);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE client_id = ?').get(client).n, 6);
  assert.equal(sqlite.prepare('SELECT recorded_at FROM payments WHERE id = ?').get((await payment.json()).id).recorded_at !== null, true);
  assert.equal((await (await call('payments', 'a')).json()).rows.length, 0);
  assert.equal((await (await call('clients', 'a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"kind":"PF"}' })).status), 403);
});

test('cross-client references and invalid money cannot be written', async () => {
  const { call, sqlite } = setup();
  const post = (table, data, token = 'admin') => call(table, token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const start = '2026-10-01T08:00:00.000Z', end = '2026-10-01T10:00:00.000Z';
  assert.equal((await post('appointments', { client_id: 'a', location_id: 'loc_b', starts_at: start, ends_at: end })).status, 400);
  assert.equal((await post('jobs', { client_id: 'a', appointment_id: 'ap_b', service_name: 'Curățenie' })).status, 400);
  const job = await post('jobs', { client_id: 'b', service_name: 'Curățenie' });
  assert.equal(job.status, 201);
  const jobId = (await job.json()).id;
  assert.equal((await post('payments', { client_id: 'a', job_id: jobId, amount_bani: 50000 })).status, 400);
  assert.equal((await post('payments', { client_id: 'b', job_id: jobId, amount_bani: -1 })).status, 400);
  assert.equal((await post('clients', { kind: 'PF', display_name: 'Test', role: 'admin' })).status, 400);
  assert.equal((await post('locations', { client_id: 'a', label: 'x', address: 'y', city: 'z', county: 'q' }, 'admin_pending')).status, 403);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 0);
});

test('location contact is optional, validated and visible only within client scope', async () => {
  const { call } = setup();
  const create = data => call('locations', 'admin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const base = { client_id: 'a', label: 'Sediu', address: 'Strada A', city: 'București', county: 'București' };
  const empty = await create(base);
  assert.equal(empty.status, 201);
  const withContact = await create({ ...base, contact_name: 'Ana', contact_phone: '0700000000', contact_email: 'ana@example.test' });
  assert.equal(withContact.status, 201);
  assert.equal((await create({ ...base, contact_email: 'greșit' })).status, 400);
  const own = await (await call('locations', 'a')).json();
  const other = await (await call('locations', 'b')).json();
  const emptyId = (await empty.json()).id;
  const contactId = (await withContact.json()).id;
  assert.equal(own.rows.find(row => row.id === emptyId).contact_name, null);
  assert.equal(own.rows.find(row => row.id === contactId).contact_email, 'ana@example.test');
  assert.equal(other.rows.some(row => row.contact_email === 'ana@example.test'), false);
});

test('failed audit rolls back the business record', async () => {
  const { call, sqlite } = setup();
  sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'audit failed'); END");
  await assert.rejects(() => call('clients', 'admin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'PF', display_name: 'Nu rămâne în bază' }),
  }));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM clients').get().n, 2);
});

test('staff can page through clients and search by a literal name', async () => {
  const { call, sqlite } = setup();
  for (let i = 0; i < 32; i++) {
    sqlite.prepare('INSERT INTO clients (id, kind, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('extra_' + i, 'PF', i === 0 ? 'Ana_Exemplu' : 'Client ' + i, now, now);
  }
  const first = await (await call('clients', 'admin')).json();
  assert.equal(first.rows.length, 30);
  assert.equal(first.nextOffset, 30);
  const second = await (await call('clients?offset=30', 'admin')).json();
  assert.equal(second.rows.length, 4);
  assert.equal(second.nextOffset, null);
  assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 34);
  const search = await (await call('clients?search=ana_exemplu', 'admin')).json();
  assert.deepEqual(search.rows.map(row => row.display_name), ['Ana_Exemplu']);
  assert.equal((await call('clients?offset=-1', 'admin')).status, 400);
});

test('staff client filter works but cannot alter client account isolation', async () => {
  const { call } = setup();
  const staff = await (await call('appointments?client_id=b', 'admin')).json();
  assert.deepEqual(staff.rows.map(row => row.id), ['ap_b']);
  assert.equal((await call('appointments?client_id=b', 'a')).status, 400);
  assert.deepEqual((await (await call('appointments', 'a')).json()).rows.map(row => row.id), ['ap_a']);
});

test('staff edits scoped records; a client cannot edit or archive anything', async () => {
  const { call, sqlite } = setup();
  const patch = (path, token, data) => call(path, token, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await patch('appointments/ap_a', 'a', { status: 'cancelled' })).status, 403);
  assert.equal((await call('appointments/ap_a', 'a', { method: 'DELETE' })).status, 403);
  assert.equal((await patch('appointments/ap_a', 'admin_pending', { status: 'cancelled' })).status, 403);
  assert.equal((await patch('appointments/ap_a', 'admin', { client_id: 'b' })).status, 400);
  assert.equal((await patch('appointments/ap_a', 'admin', { location_id: 'loc_b' })).status, 400);
  assert.equal((await patch('appointments/ap_a', 'admin', { ends_at: '2026-09-24T09:00:00.000Z' })).status, 400);
  assert.equal((await patch('appointments/ap_a', 'admin', { status: 'cancelled', client_note: 'Reprogramăm' })).status, 200);
  const a = await (await call('appointments', 'a')).json();
  assert.equal(a.rows[0].status, 'cancelled');
  assert.equal(a.rows[0].client_note, 'Reprogramăm');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'update'").get().n, 1);
});

test('archive preserves history, prevents linked deletion and revokes client access', async () => {
  const { call, sqlite } = setup();
  const archive = path => call(path, 'admin', { method: 'DELETE' });
  assert.equal((await archive('clients/a')).status, 409);
  assert.equal((await archive('locations/loc_a')).status, 409);
  assert.equal((await archive('appointments/ap_a')).status, 200);
  assert.equal((await (await call('appointments', 'a')).json()).rows.length, 0);
  assert.equal(sqlite.prepare('SELECT id FROM appointments WHERE id = ?').get('ap_a').id, 'ap_a');
  assert.equal((await archive('appointments/ap_a')).status, 404);
  assert.equal((await archive('locations/loc_a')).status, 200);
  assert.equal((await archive('clients/a')).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM client_users WHERE client_id = ?').get('a').n, 0);
  assert.equal((await (await call('clients', 'admin')).json()).rows.some(row => row.id === 'a'), false);
  assert.equal((await call('locations', 'a')).status, 401);
  assert.equal((await call('me', 'a')).status, 401);
  assert.equal((await call('messages', 'a', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'Acum?' }) })).status, 401);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'delete'").get().n, 3);
});

test('financial records and messages can be changed and archived with audit', async () => {
  const { call, sqlite } = setup();
  const post = (name, data) => call(name, 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data) });
  const patch = (path, data) => call(path, 'admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const job = (await (await post('jobs', { client_id: 'a', service_name: 'Curățenie' })).json()).id;
  const payment = (await (await post('payments', { client_id: 'a', job_id: job, amount_bani: 10000 })).json()).id;
  const message = (await (await post('messages', { client_id: 'a', body: 'Salut' })).json()).id;
  assert.equal((await call('jobs/' + job, 'admin', { method: 'DELETE' })).status, 409);
  assert.equal((await patch('payments/' + payment, { amount_bani: 25000, note: 'Transfer bancar' })).status, 200);
  assert.equal((await patch('payments/' + payment, { job_id: 'job_b' })).status, 400);
  assert.equal((await patch('messages/' + message, { body: 'Bună ziua!' })).status, 200);
  assert.equal((await call('payments/' + payment, 'admin', { method: 'DELETE' })).status, 200);
  assert.equal((await call('jobs/' + job, 'admin', { method: 'DELETE' })).status, 200);
  assert.equal((await call('messages/' + message, 'admin', { method: 'DELETE' })).status, 200);
  assert.equal((await (await call('payments', 'a')).json()).rows.length, 0);
  assert.equal((await (await call('messages', 'a')).json()).rows.length, 0);
  assert.equal(sqlite.prepare('SELECT amount_bani FROM payments WHERE id = ?').get(payment).amount_bani, 25000);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('update','delete')").get().n, 5);
});

test('a failed audit rolls back an archive; inactive clients lose access', async () => {
  const { call, sqlite } = setup();
  sqlite.exec("CREATE TRIGGER fail_archival_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'delete' BEGIN SELECT RAISE(ABORT, 'audit failed'); END");
  await assert.rejects(() => call('appointments/ap_a', 'admin', { method: 'DELETE' }));
  assert.equal(sqlite.prepare('SELECT deleted_at FROM appointments WHERE id = ?').get('ap_a').deleted_at, null);
  assert.equal((await (await call('appointments', 'a')).json()).rows.length, 1);
  const patch = await call('clients/a', 'admin', { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'inactive' }) });
  assert.equal(patch.status, 200);
  assert.equal((await call('me', 'a')).status, 401);
});
