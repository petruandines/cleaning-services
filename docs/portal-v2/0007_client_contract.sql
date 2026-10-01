-- Optional, client-visible contractual details. Existing clients remain unchanged.
-- Amounts are integer bani; no billing choice or contact field is required.
ALTER TABLE clients ADD COLUMN billing_type TEXT CHECK(billing_type IN ('hourly', 'fixed'));
ALTER TABLE clients ADD COLUMN contract_rate_bani INTEGER CHECK(contract_rate_bani >= 0 AND contract_rate_bani <= 1000000000);
ALTER TABLE clients ADD COLUMN manager_name TEXT CHECK(length(manager_name) <= 160);
ALTER TABLE clients ADD COLUMN manager_email TEXT CHECK(length(manager_email) <= 254);
ALTER TABLE clients ADD COLUMN manager_phone TEXT CHECK(length(manager_phone) <= 40);
ALTER TABLE clients ADD COLUMN contract_reference TEXT CHECK(length(contract_reference) <= 160);
ALTER TABLE clients ADD COLUMN contract_details TEXT CHECK(length(contract_details) <= 2000);
