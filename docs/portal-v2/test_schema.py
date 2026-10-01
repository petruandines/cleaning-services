"""Run with: python3 docs/portal-v2/test_schema.py"""
from pathlib import Path
import sqlite3

schema = Path(__file__).with_name("0001_app_schema.sql").read_text()
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
db.executescript(schema)
now = "2026-09-24T10:00:00Z"

for client in ("a", "b"):
    db.execute(
        "INSERT INTO clients(id, kind, display_name, created_at, updated_at) VALUES(?,?,?,?,?)",
        (client, "PF", client, now, now),
    )
    db.execute(
        "INSERT INTO locations(id, client_id, label, address, city, county, created_at, updated_at) "
        "VALUES(?,?,?,?,?,?,?,?)",
        (f"loc_{client}", client, client, "Strada Test 1", "Bucuresti", "Bucuresti", now, now),
    )

db.execute(
    "INSERT INTO appointments(id, client_id, location_id, starts_at, ends_at, status, created_at, updated_at) "
    "VALUES(?,?,?,?,?,?,?,?)",
    ("ap_a", "a", "loc_a", now, "2026-09-24T11:00:00Z", "confirmed", now, now),
)
db.execute(
    "INSERT INTO jobs(id, client_id, appointment_id, service_name, status, price_bani, created_at, updated_at) "
    "VALUES(?,?,?,?,?,?,?,?)",
    ("job_a", "a", "ap_a", "Curatenie", "completed", 70000, now, now),
)


def rejects(sql, values):
    try:
        db.execute(sql, values)
    except sqlite3.IntegrityError:
        return
    raise AssertionError(f"Expected database constraint to reject: {values[0]}")


rejects(
    "INSERT INTO appointments(id, client_id, location_id, starts_at, ends_at, status, created_at, updated_at) "
    "VALUES(?,?,?,?,?,?,?,?)",
    ("bad_appointment", "b", "loc_a", now, "2026-09-24T11:00:00Z", "confirmed", now, now),
)
rejects(
    "INSERT INTO jobs(id, client_id, appointment_id, service_name, status, created_at, updated_at) "
    "VALUES(?,?,?,?,?,?,?)",
    ("bad_job", "b", "ap_a", "X", "planned", now, now),
)
rejects(
    "INSERT INTO payments(id, client_id, job_id, amount_bani, status, created_at) VALUES(?,?,?,?,?,?)",
    ("bad_payment", "b", "job_a", 100, "confirmed", now),
)
rejects(
    "INSERT INTO payments(id, client_id, job_id, amount_bani, status, created_at) VALUES(?,?,?,?,?,?)",
    ("negative_payment", "a", "job_a", -100, "confirmed", now),
)
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
print("Schema valid; cross-client links and negative payment rejected.")
