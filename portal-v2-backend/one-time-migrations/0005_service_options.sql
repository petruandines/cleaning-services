-- Additive settings for one-time projects only. Missing rows mean fixed pricing.
CREATE TABLE IF NOT EXISTS one_time_project_service_options (
 project_id TEXT PRIMARY KEY REFERENCES one_time_projects(id),
 billing_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(billing_mode IN ('fixed','hourly')),
 minimum_bani INTEGER NOT NULL DEFAULT 10000 CHECK(minimum_bani BETWEEN 0 AND 1000000000),
 minimum_agreement TEXT NOT NULL DEFAULT '' CHECK(length(minimum_agreement)<=1000),
 en_route INTEGER NOT NULL DEFAULT 0 CHECK(en_route IN (0,1)),
 departed_at TEXT,
 stopped_at TEXT
);
