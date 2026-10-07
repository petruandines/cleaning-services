-- Independent presentation options; existing projects retain their invoice visibility.
CREATE TABLE IF NOT EXISTS one_time_project_display_options (
 project_id TEXT PRIMARY KEY REFERENCES one_time_projects(id),
 invoice_enabled INTEGER NOT NULL DEFAULT 1 CHECK(invoice_enabled IN (0,1)),
 invoice_label TEXT NOT NULL DEFAULT 'Descarcă factura' CHECK(length(invoice_label) BETWEEN 1 AND 100),
 show_access_policy INTEGER NOT NULL DEFAULT 0 CHECK(show_access_policy IN (0,1)),
 show_terms INTEGER NOT NULL DEFAULT 0 CHECK(show_terms IN (0,1)),
 show_supplier INTEGER NOT NULL DEFAULT 0 CHECK(show_supplier IN (0,1))
);
