-- A payment keeps one total; selected locations are ownership-scoped links.
CREATE UNIQUE INDEX payments_id_client_unique ON payments(id, client_id);
CREATE TABLE payment_locations (
  payment_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  PRIMARY KEY (payment_id, location_id),
  FOREIGN KEY (payment_id, client_id) REFERENCES payments(id, client_id),
  FOREIGN KEY (location_id, client_id) REFERENCES locations(id, client_id)
);
CREATE INDEX payment_locations_client_location ON payment_locations(client_id, location_id);
-- Include archived history. Payments without an appointment keep no inferred location.
INSERT INTO payment_locations (payment_id, client_id, location_id)
SELECT p.id, p.client_id, a.location_id
FROM payments p JOIN jobs j ON j.id = p.job_id AND j.client_id = p.client_id
JOIN appointments a ON a.id = j.appointment_id AND a.client_id = p.client_id;
