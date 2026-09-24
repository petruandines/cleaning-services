import importlib.util
from pathlib import Path
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


if __name__ == '__main__':
    unittest.main()
