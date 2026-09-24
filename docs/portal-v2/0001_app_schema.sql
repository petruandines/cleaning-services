-- Portal v2 application tables; Better Auth schema is versioned separately.
-- Timestamps: UTC ISO-8601 text. Monetary amounts: integer bani.
CREATE TABLE clients (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('PF','PJ')),
 display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 160),
 email TEXT, phone TEXT, company_name TEXT, cui TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE client_users (
 user_id TEXT NOT NULL,
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,client_id)
);
CREATE INDEX idx_client_users_client ON client_users(client_id);
CREATE TABLE locations (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 label TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, county TEXT NOT NULL,
 access_notes TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(id,client_id)
);
CREATE INDEX idx_locations_client ON locations(client_id,active);
CREATE TABLE appointments (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 location_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('requested','confirmed','in_progress','completed','cancelled')),
 client_note TEXT, internal_note TEXT,
 estimated_cost_bani INTEGER CHECK(estimated_cost_bani >= 0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(ends_at > starts_at),
 FOREIGN KEY(location_id,client_id) REFERENCES locations(id,client_id) ON DELETE RESTRICT,
 UNIQUE(id,client_id)
);
CREATE INDEX idx_appointments_client_start ON appointments(client_id,starts_at);
CREATE INDEX idx_appointments_status_start ON appointments(status,starts_at);
CREATE TABLE jobs (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 appointment_id TEXT,
 service_name TEXT NOT NULL CHECK(length(trim(service_name)) BETWEEN 1 AND 160),
 description TEXT, status TEXT NOT NULL CHECK(status IN ('planned','in_progress','completed','cancelled')),
 price_bani INTEGER CHECK(price_bani >= 0), completed_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(appointment_id,client_id) REFERENCES appointments(id,client_id) ON DELETE RESTRICT,
 UNIQUE(id,client_id)
);
CREATE INDEX idx_jobs_client_created ON jobs(client_id,created_at);
CREATE INDEX idx_jobs_appointment ON jobs(appointment_id);
CREATE TABLE payments (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 job_id TEXT NOT NULL, amount_bani INTEGER NOT NULL CHECK(amount_bani > 0),
 status TEXT NOT NULL CHECK(status IN ('pending','confirmed','reversed')),
 recorded_at TEXT, note TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(job_id,client_id) REFERENCES jobs(id,client_id) ON DELETE RESTRICT
);
CREATE INDEX idx_payments_client_created ON payments(client_id,created_at);
CREATE INDEX idx_payments_job ON payments(job_id);
CREATE TABLE messages (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 sender_user_id TEXT NOT NULL,
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX idx_messages_client_created ON messages(client_id,created_at);
CREATE TABLE audit_events (
 id TEXT PRIMARY KEY,
 actor_user_id TEXT NOT NULL, client_id TEXT REFERENCES clients(id) ON DELETE RESTRICT,
 action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 occurred_at TEXT NOT NULL
);
CREATE INDEX idx_audit_client_time ON audit_events(client_id,occurred_at);
CREATE INDEX idx_audit_actor_time ON audit_events(actor_user_id,occurred_at);
