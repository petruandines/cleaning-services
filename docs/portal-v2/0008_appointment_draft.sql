-- Run atomically as a D1 migration. Preserve IDs, archived rows and incoming job links.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE appointments_draft_upgrade (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 location_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','requested','confirmed','in_progress','completed','cancelled')),
 client_note TEXT, internal_note TEXT,
 estimated_cost_bani INTEGER CHECK(estimated_cost_bani >= 0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
 CHECK(ends_at > starts_at),
 FOREIGN KEY(location_id,client_id) REFERENCES locations(id,client_id) ON DELETE RESTRICT,
 UNIQUE(id,client_id)
);
INSERT INTO appointments_draft_upgrade (id, client_id, location_id, starts_at, ends_at, status, client_note, internal_note, estimated_cost_bani, created_at, updated_at, deleted_at) SELECT id, client_id, location_id, starts_at, ends_at, status, client_note, internal_note, estimated_cost_bani, created_at, updated_at, deleted_at FROM appointments;
DROP TABLE appointments;
ALTER TABLE appointments_draft_upgrade RENAME TO appointments;
CREATE INDEX idx_appointments_client_start ON appointments(client_id,starts_at);
CREATE INDEX idx_appointments_status_start ON appointments(status,starts_at);
-- Abort the transaction if any relationship is invalid before clearing deferred counters.
CREATE TABLE _draft_fk_guard (violations INTEGER CHECK(violations = 0));
INSERT INTO _draft_fk_guard SELECT COUNT(*) FROM pragma_foreign_key_check;
DROP TABLE _draft_fk_guard;
PRAGMA defer_foreign_keys = OFF;
