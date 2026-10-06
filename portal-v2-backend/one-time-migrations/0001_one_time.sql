-- Additive, isolated schema. No references to recurrent clients or auth users.
CREATE TABLE IF NOT EXISTS one_time_projects (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, client_name TEXT NOT NULL,
 phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', location TEXT NOT NULL,
 show_location INTEGER NOT NULL DEFAULT 1, scheduled_at TEXT NOT NULL,
 price_bani INTEGER NOT NULL CHECK(price_bani >= 0), description TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','confirmed','in_progress','completed','cancelled','closed')),
 invoice_url TEXT NOT NULL DEFAULT '', expiry_days INTEGER,
 started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE TABLE IF NOT EXISTS one_time_project_tasks (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES one_time_projects(id),
 title TEXT NOT NULL, position INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS otp_tasks_project ON one_time_project_tasks(project_id, position);
CREATE TABLE IF NOT EXISTS one_time_project_access (
 project_id TEXT PRIMARY KEY REFERENCES one_time_projects(id), token TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 generation INTEGER NOT NULL DEFAULT 1, expires_at TEXT, expired_logged_at TEXT,
 last_login_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS one_time_project_sessions (
 hash TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES one_time_projects(id),
 generation INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_sessions_project ON one_time_project_sessions(project_id);
CREATE TABLE IF NOT EXISTS one_time_project_activity (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES one_time_projects(id),
 type TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_activity_project ON one_time_project_activity(project_id, created_at);
CREATE TABLE IF NOT EXISTS one_time_project_rate_limits (
 key TEXT PRIMARY KEY, hits INTEGER NOT NULL, resets_at INTEGER NOT NULL
);
