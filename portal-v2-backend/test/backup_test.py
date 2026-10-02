import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import subprocess
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'd1_vault.py'
spec = importlib.util.spec_from_file_location('d1_vault', SCRIPT)
vault = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vault)


class BackupTest(unittest.TestCase):
    def test_export_diagnostic_is_useful_without_disclosing_signed_url(self):
        self.assertIn('authorization', vault.classify_export_error('Error 403: permission denied'))
        self.assertIn('network', vault.classify_export_error('fetch failed'))
        sample = 'Downloading SQL to /tmp/backup\nhttps://private.example/?signature=very-secret'
        self.assertIn('download', vault.classify_export_error(sample))
        self.assertNotIn('very-secret', vault.classify_export_error(sample))

    def test_schema_first_preserves_quoted_semicolons_and_records(self):
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder) / 'source.sql', Path(folder) / 'ordered.sql'
            source.write_text("""PRAGMA defer_foreign_keys=ON;
CREATE TABLE child(id TEXT, parent_id TEXT REFERENCES parent(id));
INSERT INTO child VALUES('quoted;value','parent');
CREATE TABLE parent(id TEXT);
INSERT INTO parent VALUES('parent');
CREATE UNIQUE INDEX parent_id_unique ON parent(id);
""")
            vault.schema_first_sql(source, target)
            ordered = target.read_text()
            self.assertLess(ordered.index('CREATE TABLE parent'), ordered.index('INSERT INTO child'))
            self.assertLess(ordered.index('CREATE UNIQUE INDEX'), ordered.index('INSERT INTO child'))
            with sqlite3.connect(':memory:') as db:
                db.execute('PRAGMA foreign_keys=ON')
                db.execute('BEGIN')
                for statement in ordered.splitlines():
                    db.execute(statement)
                db.commit()
                self.assertEqual(db.execute('SELECT id FROM child').fetchone()[0], 'quoted;value')
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_fixed_failure_categories_never_include_private_sql(self):
        sample = "FOREIGN KEY constraint failed; INSERT secret; https://private/?sig=token"
        error = subprocess.CalledProcessError(1, ['wrangler'], output=sample)
        self.assertEqual(vault.safe_failure(error, 'restore-local-test'),
                         'Local D1 import failed foreign-key validation')
        self.assertEqual(vault.safe_failure(ValueError('secret-token'), 'export'), 'ValueError')
        self.assertEqual(vault.safe_failure(ValueError('Unknown backup format'), 'verify'), 'Unknown backup format')

    def test_streamed_encryption_authentication_and_no_plaintext_on_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            sql = root / 'source.sql'
            sql.write_bytes(b'CREATE TABLE demo (message TEXT);\n' + b"INSERT INTO demo VALUES ('private');\n" * 50000)
            key = root / 'key'
            wrong = root / 'wrong'
            vault.keygen(key)
            vault.keygen(wrong)
            encrypted = root / 'backup.enc'
            vault.encrypt(sql, encrypted, vault.read_key(key))
            self.assertNotIn(b'private', encrypted.read_bytes())
            vault.decrypt(encrypted, vault.read_key(key))
            restored = root / 'restored.sql'
            vault.decrypt(encrypted, vault.read_key(key), restored)
            self.assertEqual(restored.read_bytes(), sql.read_bytes())
            with self.assertRaises(Exception):
                vault.decrypt(encrypted, vault.read_key(wrong), root / 'wrong.sql')
            self.assertFalse((root / 'wrong.sql').exists())
            data = bytearray(encrypted.read_bytes())
            data[len(vault.MAGIC) + vault.NONCE_SIZE + 99] ^= 0x80
            encrypted.write_bytes(data)
            with self.assertRaises(Exception):
                vault.decrypt(encrypted, vault.read_key(key), root / 'tampered.sql')
            self.assertFalse((root / 'tampered.sql').exists())

    def test_refuses_files_inside_repository_and_weak_key_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            key = Path(folder) / 'key'
            vault.keygen(key)
            key.chmod(0o644)
            with self.assertRaises(ValueError):
                vault.read_key(key)
            with self.assertRaises(ValueError):
                vault.outside_repo(vault.ROOT / 'accidental-backup.enc')

    def test_isolated_d1_export_preserves_related_records(self):
        # A distinct Wrangler working directory keeps both the source and the
        # restored database away from the developer's local portal database.
        with tempfile.TemporaryDirectory(prefix='pi-d1-seeded-test-') as folder:
            root = Path(folder)
            source_dir = root / 'source'
            source_dir.mkdir()
            config = source_dir / 'wrangler.jsonc'
            database = 'pi-d1-seeded-source'
            config.write_text(json.dumps({
                'name': 'pi-d1-seeded-source',
                'main': str(vault.ROOT / 'src' / 'index.mjs'),
                'compatibility_date': '2026-09-24',
                'd1_databases': [{'binding': 'DB', 'database_name': database,
                                  'database_id': '00000000-0000-4000-8000-000000000002'}],
            }))
            migrations = vault.ROOT.parent / 'docs' / 'portal-v2'
            for name in ('0001_app_schema.sql', '0002_auth.sql', '0003_portal_accounts.sql'):
                vault.run_wrangler('d1', 'execute', database, '--local', '--cwd',
                                   str(source_dir), '--config', str(config),
                                   '--file', str(migrations / name), capture=True)
            seed = source_dir / 'seed.sql'
            seed.write_text("""
CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO clients (id,kind,display_name,created_at,updated_at)
VALUES ('fixture-client','PF','Client fictiv','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO locations (id,client_id,label,address,city,county,created_at,updated_at)
VALUES ('fixture-location','fixture-client','Test','Strada Fictivă 1','București','București','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO appointments (id,client_id,location_id,starts_at,ends_at,status,created_at,updated_at)
VALUES ('fixture-appointment','fixture-client','fixture-location','2026-01-02T09:00:00Z','2026-01-02T10:00:00Z','confirmed','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO jobs (id,client_id,appointment_id,service_name,status,price_bani,created_at,updated_at)
VALUES ('fixture-job','fixture-client','fixture-appointment','Serviciu fictiv','completed',12345,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO payments (id,client_id,job_id,amount_bani,status,created_at)
VALUES ('fixture-payment','fixture-client','fixture-job',12345,'confirmed','2026-01-01T00:00:00Z');
""")
            vault.run_wrangler('d1', 'execute', database, '--local', '--cwd',
                               str(source_dir), '--config', str(config),
                               '--file', str(seed), capture=True)
            # Schema 0009 must restore populated payments and location links.
            for name in ('0004_location_contact.sql', '0005_soft_delete.sql',
                         '0006_invoice_client_notes.sql', '0007_client_contract.sql',
                         '0008_appointment_draft.sql', '0009_payment_locations.sql'):
                vault.run_wrangler('d1', 'execute', database, '--local', '--cwd',
                                   str(source_dir), '--config', str(config),
                                   '--file', str(migrations / name), capture=True)
            exported = root / 'source.sql'
            vault.run_wrangler('d1', 'export', database, '--local', '--cwd',
                               str(source_dir), '--config', str(config),
                               '--output', str(exported), capture=True)
            key_file = root / 'key'
            vault.keygen(key_file)
            archive = root / 'source.pi-d1'
            vault.encrypt(exported, archive, vault.read_key(key_file))
            vault.restore_local_test(archive, vault.read_key(key_file), 'fixture-client')
            with self.assertRaises(ValueError):
                vault.restore_local_test(archive, vault.read_key(key_file), 'missing-client')
            restored_sql = root / 'restored.sql'
            vault.decrypt(archive, vault.read_key(key_file), restored_sql)
            counts = vault.sql_counts(restored_sql)
            self.assertEqual(counts['clients'], 1)
            self.assertEqual(counts['payments'], 1)
            self.assertEqual(counts['payment_locations'], 1)
            self.assertEqual(counts['d1_migrations'], 0)
            restored_db = root / 'inspected.sqlite'
            with sqlite3.connect(restored_db) as db:
                db.executescript(restored_sql.read_text())
                self.assertEqual(db.execute(
                    'SELECT price_bani, amount_bani FROM jobs JOIN payments ON payments.job_id = jobs.id'
                ).fetchone(), (12345, 12345))
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_sql_counts_refuse_incomplete_schema(self):
        with tempfile.TemporaryDirectory() as folder:
            sql = Path(folder) / 'incomplete.sql'
            sql.write_text('CREATE TABLE clients (id TEXT);')
            with self.assertRaises(ValueError):
                vault.sql_counts(sql)


if __name__ == '__main__':
    unittest.main()
