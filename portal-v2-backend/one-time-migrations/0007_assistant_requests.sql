-- Durable idempotency records, independent of project deletion; no personal details or credentials.
CREATE TABLE IF NOT EXISTS one_time_assistant_requests (
 request_id TEXT PRIMARY KEY, project_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
