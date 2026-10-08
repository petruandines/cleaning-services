CREATE TABLE IF NOT EXISTS one_time_project_reports (
 project_id TEXT PRIMARY KEY,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 status TEXT NOT NULL DEFAULT 'none' CHECK(status IN ('none','pending','saving','ready','deleting','deleted','failed')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 document_version INTEGER NOT NULL DEFAULT 0,
 ticket TEXT,
 storage_key TEXT,
 snapshot_json TEXT,
 recipe_json TEXT,
 completed_snapshot_json TEXT,
 generated_at TEXT,
 size_bytes INTEGER,
 sha256 TEXT,
 deleted_at TEXT,
 last_error TEXT
);
CREATE TABLE IF NOT EXISTS one_time_project_report_files (
 storage_key TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 ticket TEXT NOT NULL,
 delete_requested INTEGER NOT NULL DEFAULT 0 CHECK(delete_requested IN (0,1)),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_report_files_project ON one_time_project_report_files(project_id,delete_requested);
