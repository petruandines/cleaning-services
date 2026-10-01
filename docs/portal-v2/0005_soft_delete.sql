-- Reversible data retention: keep rows for audit and relationship integrity.
-- The API hides archived rows; staff may archive only after active dependents are handled.
ALTER TABLE clients ADD COLUMN deleted_at TEXT;
ALTER TABLE locations ADD COLUMN deleted_at TEXT;
ALTER TABLE appointments ADD COLUMN deleted_at TEXT;
ALTER TABLE jobs ADD COLUMN deleted_at TEXT;
ALTER TABLE payments ADD COLUMN deleted_at TEXT;
ALTER TABLE messages ADD COLUMN deleted_at TEXT;
