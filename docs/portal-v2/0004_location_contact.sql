-- Optional contact at a specific location. Existing rows keep NULL values.
ALTER TABLE locations ADD COLUMN contact_name TEXT;
ALTER TABLE locations ADD COLUMN contact_phone TEXT;
ALTER TABLE locations ADD COLUMN contact_email TEXT;
