import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { changeStaffRecord } from '../src/mutations.mjs';

const migrations = [
  '0001_app_schema.sql', '0002_auth.sql', '0003_portal_accounts.sql', '0004_location_contact.sql',
  '0005_soft_delete.sql', '0006_invoice_client_notes.sql', '0007_client_contract.sql',
  '0008_appointment_draft.sql', '0009_payment_locations.sql',
];
const now = '2026-10-04T20:00:00.000Z';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of migrations) {
    sqlite.exec(readFileSync(new URL('../../docs/portal-v2/' + migration, import.meta.url), 'utf8'));
  }
  sqlite.prepare('INSERT INTO clients (id,kind,display_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run('client', 'PF', 'Client test', 'active', now, now);
  sqlite.prepare('INSERT INTO client_users (user_id,client_id,created_at) VALUES (?,?,?)')
    .run('user-client', 'client', now);
  for (const id of ['one', 'two']) {
    sqlite.prepare('INSERT INTO locations (id,client_id,label,address,city,county,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run('loc-' + id, 'client', 'Locație ' + id, 'Strada Test', 'București', 'București', now, now);
  }
  sqlite.prepare('INSERT INTO appointments (id,client_id,location_id,starts_at,ends_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('appointment', 'client', 'loc-one', now, '2026-10-04T21:00:00.000Z', 'draft', now, now);
  sqlite.prepare('INSERT INTO jobs (id,client_id,appointment_id,service_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run('job', 'client', 'appointment', 'Curățenie', 'planned', now, now);
  sqlite.prepare('INSERT INTO payments (id,client_id,job_id,amount_bani,status,created_at) VALUES (?,?,?,?,?,?)')
    .run('payment', 'client', 'job', 10000, 'pending', now);
  sqlite.prepare('INSERT INTO payment_locations (payment_id,client_id,location_id) VALUES (?,?,?)')
    .run('payment', 'client', 'loc-one');
  sqlite.prepare('INSERT INTO payment_locations (payment_id,client_id,location_id) VALUES (?,?,?)')
    .run('payment', 'client', 'loc-two');
  sqlite.prepare('INSERT INTO messages (id,client_id,sender_user_id,body,created_at) VALUES (?,?,?,?,?)')
    .run('message', 'client', 'user-client', 'Mesaj test', now);

  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          const statement = sqlite.prepare(sql);
          return {
            async all() { return { results: statement.all(...args) }; },
            async run() { return statement.run(...args); },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, db };
}

function archived(sqlite, table, id) {
  return !!sqlite.prepare(`SELECT deleted_at FROM ${table} WHERE id = ?`).get(id).deleted_at;
}

test('deleting an appointment archives its jobs and payments automatically', async () => {
  const { sqlite, db } = setup();
  assert.equal((await changeStaffRecord(db, 'appointments', 'appointment', null, 'owner')).status, 204);
  assert.equal(archived(sqlite, 'appointments', 'appointment'), true);
  assert.equal(archived(sqlite, 'jobs', 'job'), true);
  assert.equal(archived(sqlite, 'payments', 'payment'), true);
  assert.equal(archived(sqlite, 'locations', 'loc-one'), false);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_locations').get().n, 0);
  sqlite.close();
});

test('deleting a location archives appointments below it but leaves other locations active', async () => {
  const { sqlite, db } = setup();
  assert.equal((await changeStaffRecord(db, 'locations', 'loc-one', null, 'owner')).status, 204);
  assert.equal(archived(sqlite, 'locations', 'loc-one'), true);
  assert.equal(archived(sqlite, 'appointments', 'appointment'), true);
  assert.equal(archived(sqlite, 'jobs', 'job'), true);
  assert.equal(archived(sqlite, 'payments', 'payment'), true);
  assert.equal(archived(sqlite, 'locations', 'loc-two'), false);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_locations').get().n, 0);
  sqlite.close();
});

test('deleting a job archives its payments without deleting the appointment', async () => {
  const { sqlite, db } = setup();
  assert.equal((await changeStaffRecord(db, 'jobs', 'job', null, 'owner')).status, 204);
  assert.equal(archived(sqlite, 'jobs', 'job'), true);
  assert.equal(archived(sqlite, 'payments', 'payment'), true);
  assert.equal(archived(sqlite, 'appointments', 'appointment'), false);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_locations').get().n, 0);
  sqlite.close();
});

test('deleting a payment removes its location links without deleting its job', async () => {
  const { sqlite, db } = setup();
  assert.equal((await changeStaffRecord(db, 'payments', 'payment', null, 'owner')).status, 204);
  assert.equal(archived(sqlite, 'payments', 'payment'), true);
  assert.equal(archived(sqlite, 'jobs', 'job'), false);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_locations').get().n, 0);
  sqlite.close();
});

test('deleting a client archives all business records and revokes portal access', async () => {
  const { sqlite, db } = setup();
  assert.equal((await changeStaffRecord(db, 'clients', 'client', null, 'owner')).status, 204);
  for (const [table, id] of [['clients', 'client'], ['locations', 'loc-one'], ['locations', 'loc-two'],
    ['appointments', 'appointment'], ['jobs', 'job'], ['payments', 'payment'], ['messages', 'message']]) {
    assert.equal(archived(sqlite, table, id), true, table + ' should be archived');
  }
  assert.equal(sqlite.prepare('SELECT status FROM clients WHERE id = ?').get('client').status, 'inactive');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM client_users WHERE client_id = ?').get('client').n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_locations WHERE client_id = ?').get('client').n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'delete' AND entity_type = 'clients'").get().n, 1);
  sqlite.close();
});

test('a failed delete audit rolls back the entire cascade', async () => {
  const { sqlite, db } = setup();
  sqlite.exec("CREATE TRIGGER fail_delete_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'delete' BEGIN SELECT RAISE(ABORT, 'audit failed'); END");
  await assert.rejects(changeStaffRecord(db, 'clients', 'client', null, 'owner'));
  for (const [table, id] of [['clients', 'client'], ['locations', 'loc-one'], ['appointments', 'appointment'],
    ['jobs', 'job'], ['payments', 'payment'], ['messages', 'message']]) {
    assert.equal(archived(sqlite, table, id), false, table + ' should have rolled back');
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM client_users WHERE client_id = ?').get('client').n, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_locations WHERE client_id = ?').get('client').n, 2);
  sqlite.close();
});
