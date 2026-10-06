-- Additive encrypted copies; password authentication still uses the original hash.
CREATE TABLE IF NOT EXISTS one_time_project_passwords (
 project_id TEXT PRIMARY KEY REFERENCES one_time_projects(id),
 ciphertext TEXT NOT NULL
);
