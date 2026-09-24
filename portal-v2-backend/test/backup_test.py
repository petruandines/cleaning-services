import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'd1_vault.py'
spec = importlib.util.spec_from_file_location('d1_vault', SCRIPT)
vault = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vault)


class BackupTest(unittest.TestCase):
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
            restored_db = root / 'inspected.sqlite'
            with sqlite3.connect(restored_db) as db:
                db.executescript(restored_sql.read_text())
                self.assertEqual(db.execute(
                    'SELECT price_bani, amount_bani FROM jobs JOIN payments ON payments.job_id = jobs.id'
                ).fetchone(), (12345, 12345))
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])


if __name__ == '__main__':
    unittest.main()
