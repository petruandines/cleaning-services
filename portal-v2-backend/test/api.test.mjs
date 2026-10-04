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
const invoiceSchema = readFileSync(new URL('../../docs/portal-v2/0006_invoice_client_notes.sql', import.meta.url), 'utf8');
const contractSchema = readFileSync(new URL('../../docs/portal-v2/0007_client_contract.sql', import.meta.url), 'utf8');
const now = '2026-09-24T10:00:00Z';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(schema);
  sqlite.exec(authSchema);
  sqlite.exec(accountSchema);
  sqlite.exec(contactSchema);
  sqlite.exec(archiveSchema);
  sqlite.exec(invoiceSchema);
  sqlite.exec(contractSchema);
  sqlite.exec('BEGIN');
  sqlite.exec(readFileSync(new URL('../../docs/portal-v2/0008_appointment_draft.sql', import.meta.url), 'utf8'));
  sqlite.exec('COMMIT');
  sqlite.exec(readFileSync(new URL('../../docs/portal-v2/0009_payment_locations.sql', import.meta.url), 'utf8'));
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

test('optional contract fields remain scoped and hidden until at least one is set', async () => {
  const { call, sqlite } = setup();
  const patch = (id, data, token = 'admin') => call('clients/' + id, token, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.deepEqual((await (await call('contracts', 'a')).json()).rows, []);
  assert.equal((await call('contracts?client_id=a', 'a')).status, 400);
  assert.equal((await call('contracts', 'admin')).status, 400);
  assert.equal((await patch('a', { manager_email: 'manager@example.test' }, 'a')).status, 403);
  assert.equal((await patch('a', { manager_email: 'not-an-email' })).status, 400);
  assert.equal((await patch('a', { contract_rate_bani: 40000 })).status, 400);
  assert.equal((await patch('a', { billing_type: 'fixed' })).status, 400);
  assert.equal((await patch('a', { billing_type: 'hourly', contract_rate_bani: 45000,
    manager_email: 'manager@example.test', contract_details: 'Intervenții lunare' })).status, 200);
  const own = (await (await call('contracts', 'a')).json()).rows;
  assert.equal(own.length, 1);
  assert.equal(own[0].contract_rate_bani, 45000);
  assert.equal(own[0].manager_email, 'manager@example.test');
  assert.equal(own[0].contract_details, 'Intervenții lunare');
  assert.equal('internal_note' in own[0], false);
  assert.deepEqual((await (await call('contracts', 'b')).json(), []));
  assert.deepEqual((await (await call('contracts?client_id=b', 'admin')).json()).rows[0].manager_email, null);
  assert.equal((await patch('a', { billing_type: 'fixed' })).status, 400);
  assert.equal((await patch('a', { billing_type: 'fixed', contract_rate_bani: null })).status, 200);
  assert.equal((await patch('a', { billing_type: null, contract_rate_bani: null,
    manager_email: null, contract_details: null })).status, 200);
  assert.deepEqual((await (await call('contracts', 'a')).json()).rows, []);
  assert.equal(sqlite.prepare('SELECT billing_type FROM clients WHERE id = ?').get('a').billing_type, null);
  sqlite.close();
});

test('admin records a payment directly against a scoped appointment without a separate job step', async () => {
  const { call, sqlite } = setup();
  const post = data => call('payments', 'admin', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await post({ client_id: 'a', appointment_id: 'ap_b', amount_bani: 35000 })).status, 400);
  assert.equal((await post({ client_id: 'a', appointment_id: 'ap_a', job_id: 'other', amount_bani: 35000 })).status, 400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 0);
  const response = await post({ client_id: 'a', appointment_id: 'ap_a', amount_bani: 35000,
    invoice_url: 'https://example.test/factura.pdf' });
  assert.equal(response.status, 201);
  const paymentId = (await response.json()).id;
  const job = sqlite.prepare('SELECT j.id, j.appointment_id, j.client_id FROM jobs j JOIN payments p ON p.job_id = j.id WHERE p.id = ?').get(paymentId);
  assert.equal(job.appointment_id, 'ap_a');
  assert.equal(job.client_id, 'a');
  const own = (await (await call('payments', 'a')).json()).rows;
  assert.equal(own[0].appointment_starts_at, now);
  assert.equal(own[0].location_name, 'Locație');
  assert.equal(own[0].recorded_at, null);
  assert.equal(own[0].created_at, sqlite.prepare('SELECT created_at FROM payments WHERE id = ?').get(paymentId).created_at);
  assert.equal((await (await call('payments', 'b')).json()).rows.length, 0);
  assert.deepEqual((await (await call('payments?client_id=b', 'admin')).json()).rows, []);
  assert.equal((await call('payments/' + paymentId, 'admin', { method: 'DELETE' })).status, 200);
  assert.ok(sqlite.prepare('SELECT deleted_at FROM jobs WHERE id = ?').get(job.id).deleted_at);
  assert.equal((await call('appointments/ap_a', 'admin', { method: 'DELETE' })).status, 200);
  sqlite.close();
});

test('failed payment audit rolls back its automatically created job', async () => {
  const { call, sqlite } = setup();
  sqlite.exec("CREATE TRIGGER reject_payment_audit BEFORE INSERT ON audit_events WHEN NEW.entity_type = 'payments' BEGIN SELECT RAISE(ABORT, 'audit rejected'); END");
  await assert.rejects(call('payments', 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'a', appointment_id: 'ap_a', amount_bani: 10000 }) }));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM payments').get().count, 0);
  sqlite.close();
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

test('live message search matches literal text but never crosses client accounts', async () => {
  const { call, sqlite } = setup();
  for (const [id, client, body] of [['one', 'a', 'Canapea verde 50%'],
    ['two', 'a', 'Curățenie generală'], ['three', 'b', 'Canapea verde 50%']]) {
    sqlite.prepare('INSERT INTO messages (id,client_id,sender_user_id,body,created_at) VALUES (?,?,?,?,?)')
      .run(id, client, 'user_' + client, body, now);
  }
  assert.deepEqual((await (await call('messages?search=Canapea', 'a')).json()).rows.map(row => row.id), ['one']);
  assert.deepEqual((await (await call('messages?search=50%25', 'a')).json()).rows.map(row => row.id), ['one']);
  assert.deepEqual((await (await call('messages?search=Canapea&client_id=b', 'admin')).json()).rows.map(row => row.id), ['three']);
  assert.deepEqual((await (await call('messages', 'admin')).json()).rows, []);
  assert.equal((await call('messages?search=Canapea&client_id=b', 'a')).status, 400);
  assert.equal((await call('payments?search=Canapea', 'admin')).status, 400);
  sqlite.close();
});

test('in-app alerts count only inbound messages and show only the client upcoming location', async () => {
  const { call, sqlite } = setup();
  for (const [id, role] of [['owner', 'admin'], ['user_a', 'user'], ['user_b', 'user']]) {
    sqlite.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt,role) VALUES (?,?,?,?,?,?,?)')
      .run(id, id, id + '@example.test', 1, now, now, role);
  }
  for (const [id, client, sender] of [['ma', 'a', 'user_a'], ['ma2', 'a', 'user_a'], ['mb', 'b', 'user_b'], ['staff_a', 'a', 'owner']]) {
    sqlite.prepare('INSERT INTO messages (id,client_id,sender_user_id,body,created_at) VALUES (?,?,?,?,?)')
      .run(id, client, sender, 'Test notificare', now);
  }
  const future = new Date(Date.now() + 86400000).toISOString();
  sqlite.prepare('UPDATE appointments SET starts_at = ?, ends_at = ? WHERE id = ?')
    .run(future, new Date(Date.now() + 90000000).toISOString(), 'ap_a');
  assert.equal((await call('overview', 'admin_pending')).status, 403);
  const staff = await (await call('overview', 'admin')).json();
  const client = await (await call('overview', 'a')).json();
  assert.equal(staff.unreadMessages, 3);
  assert.equal(staff.nextAppointment, null);
  assert.equal(client.unreadMessages, 1);
  assert.equal(client.nextAppointment.location_name, 'Locație');
  assert.equal((await call('overview', 'b').then(response => response.json())).nextAppointment, null);
  const read = payload => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal((await call('notifications/read', 'admin', read({ client_id: 'a' }))).status, 400);
  assert.equal((await call('notifications/read', 'admin', read({ client_id: 'a', ids: ['ma', 'ma'] }))).status, 400);
  assert.equal((await call('notifications/read', 'admin', read({ client_id: 'a', ids: ['mb'] }))).status, 200);
  assert.equal((await (await call('overview', 'admin')).json()).unreadMessages, 3);
  assert.equal((await call('notifications/read', 'admin', read({ client_id: 'a', ids: ['ma'] }))).status, 200);
  assert.equal((await (await call('overview', 'admin')).json()).unreadMessages, 2);
  assert.equal((await (await call('overview', 'a')).json()).unreadMessages, 1);
  assert.equal((await call('notifications/read', 'a', read({ client_id: 'b', ids: ['staff_a'] }))).status, 403);
  assert.equal((await call('notifications/read', 'a', read({ ids: ['mb'] }))).status, 200);
  assert.equal((await (await call('overview', 'a')).json()).unreadMessages, 1);
  assert.equal((await call('notifications/read', 'a', read({ ids: ['staff_a'] }))).status, 200);
  assert.equal((await (await call('overview', 'a')).json()).unreadMessages, 0);
  sqlite.close();
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

test('staff-only client notes and HTTPS invoice links respect account isolation', async () => {
  const { call, sqlite } = setup();
  const post = (name, data) => call(name, 'admin', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const patch = (name, data) => call(name, 'admin', { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await patch('clients/a', { internal_note: 'Cheia se ia de la recepție' })).status, 200);
  assert.equal((await (await call('clients', 'admin')).json()).rows.find(row => row.id === 'a').internal_note,
    'Cheia se ia de la recepție');
  assert.equal((await call('clients', 'a')).status, 403);
  assert.equal((await post('clients', { kind: 'PF', display_name: 'Altul', internal_note: 'x'.repeat(4001) })).status, 400);
  const job = (await (await post('jobs', { client_id: 'a', service_name: 'Curățenie' })).json()).id;
  const draft = { client_id: 'a', job_id: job, amount_bani: 50000 };
  assert.equal((await post('payments', { ...draft, invoice_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await post('payments', { ...draft, invoice_url: 'http://example.test/factura' })).status, 400);
  const link = 'https://example.test/factura/123';
  const payment = (await (await post('payments', { ...draft, invoice_url: link })).json()).id;
  assert.equal((await (await call('payments', 'a')).json()).rows[0].invoice_url, link);
  assert.equal((await (await call('payments', 'b')).json()).rows.length, 0);
  assert.equal((await patch('payments/' + payment, { invoice_url: 'data:text/html,unsafe' })).status, 400);
  assert.equal((await patch('payments/' + payment, { invoice_url: null })).status, 200);
  assert.equal((await (await call('payments', 'a')).json()).rows[0].invoice_url, null);
  sqlite.close();
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

test('archive cascades linked records, preserves history and revokes client access', async () => {
  const { call, sqlite } = setup();
  const archive = path => call(path, 'admin', { method: 'DELETE' });
  assert.equal((await archive('clients/a')).status, 200);
  assert.ok(sqlite.prepare('SELECT deleted_at FROM clients WHERE id = ?').get('a').deleted_at);
  assert.ok(sqlite.prepare('SELECT deleted_at FROM locations WHERE id = ?').get('loc_a').deleted_at);
  assert.ok(sqlite.prepare('SELECT deleted_at FROM appointments WHERE id = ?').get('ap_a').deleted_at);
  assert.equal((await archive('clients/a')).status, 404);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM client_users WHERE client_id = ?').get('a').n, 0);
  assert.equal((await (await call('clients', 'admin')).json()).rows.some(row => row.id === 'a'), false);
  assert.equal((await call('locations', 'a')).status, 401);
  assert.equal((await call('me', 'a')).status, 401);
  assert.equal((await call('messages', 'a', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'Acum?' }) })).status, 401);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'delete'").get().n, 1);
});

test('financial records and messages can be changed and cascade-archived with audit', async () => {
  const { call, sqlite } = setup();
  const post = (name, data) => call(name, 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data) });
  const patch = (path, data) => call(path, 'admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const job = (await (await post('jobs', { client_id: 'a', service_name: 'Curățenie' })).json()).id;
  const payment = (await (await post('payments', { client_id: 'a', job_id: job, amount_bani: 10000 })).json()).id;
  const message = (await (await post('messages', { client_id: 'a', body: 'Salut' })).json()).id;
  assert.equal((await patch('payments/' + payment, { amount_bani: 25000, note: 'Transfer bancar' })).status, 200);
  assert.equal((await patch('payments/' + payment, { job_id: 'job_b' })).status, 400);
  assert.equal((await patch('messages/' + message, { body: 'Bună ziua!' })).status, 200);
  assert.equal((await call('jobs/' + job, 'admin', { method: 'DELETE' })).status, 200);
  assert.equal((await call('payments/' + payment, 'admin', { method: 'DELETE' })).status, 404);
  assert.equal((await call('jobs/' + job, 'admin', { method: 'DELETE' })).status, 404);
  assert.equal((await call('messages/' + message, 'admin', { method: 'DELETE' })).status, 200);
  assert.equal((await (await call('payments', 'a')).json()).rows.length, 0);
  assert.equal((await (await call('messages', 'a')).json()).rows.length, 0);
  assert.equal(sqlite.prepare('SELECT amount_bani FROM payments WHERE id = ?').get(payment).amount_bani, 25000);
  assert.ok(sqlite.prepare('SELECT deleted_at FROM payments WHERE id = ?').get(payment).deleted_at);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('update','delete')").get().n, 4);
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

test('staff can create and edit Draft; clients cannot write or access another client draft', async () => {
 const {call, sqlite}=setup();
 const init=data=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 const data={client_id:'a',location_id:'loc_a',starts_at:'2030-10-02T10:00:00.000Z',ends_at:'2030-10-02T11:00:00.000Z',status:'draft'};
 assert.equal((await call('appointments','a',init(data))).status,403);
 const response=await call('appointments','admin',init(data)); assert.equal(response.status,201);
 const {id}=await response.json();
 assert.equal((await (await call('appointments','a')).json()).rows.find(r=>r.id===id).status,'draft');
 assert.equal((await (await call('appointments','b')).json()).rows.some(r=>r.id===id),false);
 const update={...init({status:'confirmed'}),method:'PATCH'};
 assert.equal((await call('appointments/'+id,'admin',update)).status,200);
 assert.equal(sqlite.prepare('SELECT status FROM appointments WHERE id=?').get(id).status,'confirmed');
 update.body=JSON.stringify({status:'draft'});
 assert.equal((await call('appointments/'+id,'admin',update)).status,200);
 assert.equal(sqlite.prepare('SELECT status FROM appointments WHERE id=?').get(id).status,'draft');
});

test('multi-location payment has one total, scoped links, editable selection and no duplicate history', async () => {
 const {call,sqlite}=setup();
 sqlite.exec("INSERT INTO locations(id,client_id,label,address,city,county,created_at,updated_at) VALUES('loc_a2','a','Sediu 2','A','B','IF','n','n')");
 const write=(path,data,method='POST',token='admin')=>call(path,token,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 for(const ids of [[],['loc_a','loc_a'],['loc_b'],['missing'],null]) {
   assert.equal((await write('payments',{client_id:'a',location_ids:ids,amount_bani:12345})).status,400);
 }
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,0);
 assert.equal((await write('payments',{client_id:'a',location_ids:['loc_a'],amount_bani:12345},'POST','a')).status,403);
 const response=await write('payments',{client_id:'a',location_ids:['loc_a','loc_a2'],amount_bani:12345});
 assert.equal(response.status,201); const {id}=await response.json();
 const rows=(await (await call('payments','a')).json()).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].amount_bani,12345);
 assert.deepEqual(rows[0].location_ids,['loc_a','loc_a2']);
 assert.match(rows[0].location_name,/Sediu 2/);
 assert.equal((await (await call('payments','b')).json()).rows.length,0);
 assert.equal(sqlite.prepare('SELECT SUM(amount_bani) AS n FROM payments').get().n,12345);
 assert.equal((await write('payments/'+id,{location_ids:['loc_b']},'PATCH')).status,400);
 assert.deepEqual((await (await call('payments','a')).json()).rows[0].location_ids,['loc_a','loc_a2']);
 sqlite.exec("CREATE TRIGGER fail_multi_audit BEFORE INSERT ON audit_events WHEN NEW.action='update' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
 await assert.rejects(()=>write('payments/'+id,{location_ids:['loc_a2'],amount_bani:99999},'PATCH'));
 assert.equal(sqlite.prepare('SELECT amount_bani FROM payments WHERE id=?').get(id).amount_bani,12345);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_locations WHERE payment_id=?').get(id).n,2);
 sqlite.exec('DROP TRIGGER fail_multi_audit');
 assert.equal((await write('payments/'+id,{location_ids:['loc_a2']},'PATCH')).status,200);
 sqlite.exec("UPDATE locations SET deleted_at='archived',active=0 WHERE id='loc_a2'");
 assert.equal((await write('payments/'+id,{location_ids:['loc_a2'],note:'Istoric păstrat'},'PATCH')).status,200);
 assert.equal((await write('payments',{client_id:'a',location_ids:['loc_a2'],amount_bani:100})).status,400);
 assert.throws(()=>sqlite.exec(`INSERT INTO payment_locations VALUES('${id}','b','loc_b')`),/FOREIGN KEY/);
 assert.equal((await call('payments/'+id,'admin',{method:'DELETE'})).status,200);
 assert.equal((await (await call('payments','a')).json()).rows.length,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_locations WHERE payment_id=?').get(id).n,0);
 assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('legacy appointment payment automatically gets its location and failed create is atomic', async()=>{
 const {call,sqlite}=setup();
 const post=()=>call('payments','admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:'a',appointment_id:'ap_a',amount_bani:8000})});
 const {id}=await (await post()).json();
 assert.deepEqual((await (await call('payments','a')).json()).rows[0].location_ids,['loc_a']);
 sqlite.exec("CREATE TRIGGER fail_multi_create BEFORE INSERT ON audit_events WHEN NEW.action='create' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
 await assert.rejects(()=>post());
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_locations').get().n,1);
});

test('selecting all 100 locations stays within D1 parameter limits and one payment row',async()=>{
 const {call,sqlite}=setup();const ids=['loc_a'];
 for(let i=1;i<100;i++){
  const id='loc_all_'+i;ids.push(id);
  sqlite.prepare('INSERT INTO locations(id,client_id,label,address,city,county,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,'a',id,'A','B','IF','n','n');
 }
 const response=await call('payments','admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:'a',location_ids:ids,amount_bani:10000})});
 assert.equal(response.status,201);
 const rows=(await (await call('payments','a')).json()).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].location_ids.length,100);assert.equal(rows[0].amount_bani,10000);
});
