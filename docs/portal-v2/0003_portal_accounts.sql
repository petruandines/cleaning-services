-- Accounts created for a client must replace the temporary password before
-- any client data is accessible. Better Auth user IDs are generated server-side.
CREATE TABLE portal_accounts (
 user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
