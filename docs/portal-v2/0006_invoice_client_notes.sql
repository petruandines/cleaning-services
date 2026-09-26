-- Nullable fields preserve existing client and payment records.
-- internal_note is returned to staff only; invoice_url is a client-facing HTTPS link.
ALTER TABLE clients ADD COLUMN internal_note TEXT;
ALTER TABLE payments ADD COLUMN invoice_url TEXT;
