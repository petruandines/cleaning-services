ALTER TABLE one_time_project_display_options ADD COLUMN show_review INTEGER NOT NULL DEFAULT 0 CHECK(show_review IN (0,1));
