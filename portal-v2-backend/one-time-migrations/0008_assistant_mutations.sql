-- Durable request IDs for scoped maintenance; no client details or credentials.
CREATE TABLE IF NOT EXISTS one_time_assistant_mutations (
 request_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, operation TEXT NOT NULL CHECK(operation IN ('edit','delete')), created_at TEXT NOT NULL
);
