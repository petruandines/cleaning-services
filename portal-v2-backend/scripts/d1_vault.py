#!/usr/bin/env python3
"""Private D1 SQL exports: AES-256-GCM streaming, with a separate offline key.

The key and encrypted output must live outside this public repository.
No decrypted content is released until the authentication tag is verified.
"""
import argparse
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import subprocess
import tempfile

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

ROOT = Path(__file__).resolve().parents[1]
WRANGLER = ROOT / "node_modules" / ".bin" / "wrangler"
MAGIC = b"PI-D1-AES256-GCM-1\n"
NONCE_SIZE = 12
TAG_SIZE = 16
CHUNK_SIZE = 1024 * 1024
PORTAL_TABLES = ("account", "appointments", "audit_events", "client_users", "clients",
                 "d1_migrations", "jobs", "locations", "messages", "payments",
                 "portal_accounts", "rateLimit", "session", "twoFactor", "user", "verification")


def outside_repo(path):
    target = Path(path).expanduser().resolve()
    if target.is_relative_to(ROOT.parent):
        raise ValueError("The key and backup files must be outside the public repository")
    return target


def read_key(path):
    target = outside_repo(path)
    info = target.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
        raise ValueError("The key must be a regular file readable only by its owner (chmod 600)")
    key = target.read_bytes()
    if len(key) != 32:
        raise ValueError("Expected a 32-byte key created with keygen")
    return key


def exclusive_output(target, writer):
    target = outside_repo(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    # A private temporary file prevents a partial/tampered output from being
    # mistaken for a completed backup. Linking refuses to overwrite an output.
    fd, temporary = tempfile.mkstemp(prefix=".pi-d1-", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as result:
            writer(result)
            result.flush()
            os.fsync(result.fileno())
        os.link(temporary, target)
        return target
    finally:
        os.unlink(temporary)


def keygen(target):
    exclusive_output(target, lambda result: result.write(os.urandom(32)))
    print("Key created. Store a separate offline copy; losing it makes backups unreadable.")


def encrypt(source, target, key):
    nonce = os.urandom(NONCE_SIZE)
    header = MAGIC + nonce
    cipher = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
    cipher.authenticate_additional_data(header)

    def write(result):
        result.write(header)
        with open(source, "rb") as original:
            while chunk := original.read(CHUNK_SIZE):
                result.write(cipher.update(chunk))
        result.write(cipher.finalize())
        result.write(cipher.tag)

    exclusive_output(target, write)


def decrypt(source, key, output=None):
    source = Path(source)
    size = source.stat().st_size
    header_size = len(MAGIC) + NONCE_SIZE
    if size < header_size + TAG_SIZE:
        raise ValueError("Backup file is incomplete")
    with source.open("rb") as original:
        header = original.read(header_size)
        if not header.startswith(MAGIC):
            raise ValueError("Unknown backup format")
        original.seek(-TAG_SIZE, os.SEEK_END)
        tag = original.read(TAG_SIZE)
        original.seek(header_size)
        remaining = size - header_size - TAG_SIZE
        cipher = Cipher(algorithms.AES(key), modes.GCM(header[-NONCE_SIZE:], tag)).decryptor()
        cipher.authenticate_additional_data(header)

        def write(result):
            nonlocal remaining
            while remaining:
                chunk = original.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    raise ValueError("Backup truncated")
                remaining -= len(chunk)
                plaintext = cipher.update(chunk)
                if result is not None:
                    result.write(plaintext)
            final = cipher.finalize()  # Raises InvalidTag on wrong key/corruption.
            if result is not None:
                result.write(final)

        if output is None:
            write(None)
        else:
            exclusive_output(output, write)


def run_wrangler(*args, capture=False):
    if not WRANGLER.is_file():
        raise ValueError("Run npm ci in portal-v2-backend first")
    try:
        return subprocess.run([str(WRANGLER), *args], cwd=ROOT, check=True,
                              text=True, stdout=subprocess.PIPE if capture else None,
                              stderr=subprocess.STDOUT if capture else None)
    except subprocess.CalledProcessError as error:
        if capture and args[:2] == ("d1", "export"):
            raise ExportDiagnostic(classify_export_error(error.stdout or "")) from None
        raise


class ExportDiagnostic(ValueError):
    """A fixed diagnostic category safe to display in GitHub Actions logs."""


def classify_export_error(output):
    """Report a useful category without logging signed download URLs or secrets."""
    if re.search(r"\b(?:403|10000|10001)\b|permission|forbidden|not authorized|authentication error", output, re.I):
        return "Cloudflare rejected D1 export authorization; check token's D1 export permission"
    if re.search(r"\b(?:fetch failed|network error|timed out|ECONNRESET|ETIMEDOUT)\b", output, re.I):
        return "D1 export failed due to a network or timeout error"
    if "Downloading SQL to" in output or "download from the presigned URL" in output:
        return "Cloudflare completed export, but the runner could not download its temporary SQL URL"
    if "Creating export" in output or "Executing on remote database" in output:
        return "Cloudflare rejected or interrupted the D1 export request"
    return "Wrangler D1 export failed before completion; no encrypted artifact was uploaded"


def export_database(name, scope, target, key):
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", name):
        raise ValueError("Invalid D1 database name")
    if scope == "remote" and "REPLACE_WITH_D1_DATABASE_ID" in (ROOT / "wrangler.jsonc").read_text():
        raise ValueError("Configure the intended EU D1 binding before remote export")
    outside_repo(target)
    if Path(target).expanduser().exists():
        raise FileExistsError("Refusing to overwrite a backup")
    with tempfile.TemporaryDirectory(prefix="pi-d1-export-") as directory:
        plaintext = Path(directory) / "export.sql"
        run_wrangler("d1", "export", name, "--" + scope, "--output", str(plaintext), capture=True)
        encrypt(plaintext, target, key)
    print("Encrypted export saved. Verify it with 'verify' and keep the key separately.")


def schema_first_sql(source, target):
    """Create all exported tables before inserting dependent records.

    ALTER TABLE rebuilds change sqlite_schema order. D1 exports can therefore
    insert jobs before CREATE TABLE appointments, even with deferred keys.
    Only table/index declaration order changes, in a private recovery copy.
    """
    statements, pending = [], []
    for char in Path(source).read_text():
        pending.append(char)
        if char == ';' and sqlite3.complete_statement(''.join(pending)):
            statements.append(''.join(pending))
            pending = []
    if ''.join(pending).strip():
        statements.append(''.join(pending))
    tables, indexes, rest = [], [], []
    for statement in statements:
        # D1 exports contain SQL statements without leading comments.
        if re.match(r'\s*CREATE\s+TABLE\b', statement, re.I):
            tables.append(statement)
        elif re.match(r'\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b', statement, re.I):
            indexes.append(statement)
        else:
            rest.append(statement)
    Path(target).write_text('PRAGMA defer_foreign_keys = ON;\n' + '\n'.join(tables + indexes + rest))


def expected_tables(names):
    base = set(PORTAL_TABLES)
    if names not in (base, base | {"payment_locations"}):
        raise ValueError("Backup schema does not match the expected portal tables")
    return sorted(names)


def restore_local_test(source, key, expect_client_id=None):
    with tempfile.TemporaryDirectory(prefix="pi-d1-restore-") as directory:
        temp = Path(directory)
        plaintext = temp / "export.sql"
        decrypt(source, key, plaintext)
        ordered = temp / "recovery.sql"
        schema_first_sql(plaintext, ordered)
        expected = sql_counts(plaintext)
        config = temp / "wrangler.jsonc"
        config.write_text(json.dumps({
            "name": "pi-d1-restore-test", "main": str(ROOT / "src" / "index.mjs"),
            "compatibility_date": "2026-09-24",
            "d1_databases": [{"binding": "DB", "database_name": "pi-d1-restore-test",
                              "database_id": "00000000-0000-4000-8000-000000000001"}],
        }))
        persist = temp / "d1-state"
        run_wrangler("d1", "execute", "pi-d1-restore-test", "--local",
                     "--config", str(config), "--persist-to", str(persist),
                     "--file", str(ordered), capture=True)
        # Wrangler also stores its own metadata.sqlite alongside the actual
        # D1 database. Never mistake this metadata for restored client data.
        files = [file for file in persist.rglob("*.sqlite")
                 if file.name != "metadata.sqlite"]
        if len(files) != 1:
            raise ValueError("Could not locate the isolated local D1 database")
        with sqlite3.connect(f"file:{files[0]}?mode=ro", uri=True) as restored:
            if restored.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Restored database failed SQLite integrity check")
            if restored.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise ValueError("Restored database has broken foreign-key references")
            tables = {name for (name,) in restored.execute(
                "SELECT name FROM sqlite_schema WHERE type = 'table'")}
            if not {"clients", "portal_accounts", "user", "audit_events"}.issubset(tables):
                raise ValueError("Restored database is missing portal tables")
            restored_names = {name for name in tables if not name.startswith("sqlite_")
                              and name not in ("_cf_KV", "_cf_METADATA")}
            if restored_names != set(expected):
                raise ValueError("Restored database is missing portal tables")
            for table, count in expected.items():
                if restored.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0] != count:
                    raise ValueError("Restored database row counts differ from backup")
            if expect_client_id is not None:
                count = restored.execute(
                    "SELECT count(*) FROM clients WHERE id = ?", (expect_client_id,)
                ).fetchone()[0]
                if count != 1:
                    raise ValueError("Expected client was not restored")
    print("Encrypted backup restored into an isolated local D1; integrity and foreign keys verified.")


def sql_counts(source):
    """Expected row counts from an authenticated, decrypted SQL backup; no rows in logs."""
    with sqlite3.connect(":memory:") as database:
        database.executescript(Path(source).read_text())
        names = {name for (name,) in database.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ) if name not in ("_cf_KV", "_cf_METADATA")}
        allowed = expected_tables(names)
        if database.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Backup SQL failed integrity check")
        if database.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise ValueError("Backup SQL has broken foreign keys")
        return {name: database.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0]
                for name in allowed}


def safe_failure(error, action):
    """Only fixed diagnostics; never include SQL, paths, keys or signed URLs."""
    known = (
        "The key and backup files must be outside the public repository",
        "The key must be a regular file readable only by its owner (chmod 600)",
        "Expected a 32-byte key created with keygen", "Backup file is incomplete",
        "Unknown backup format", "Refusing to overwrite a backup",
        "Could not locate the isolated local D1 database",
        "Restored database failed SQLite integrity check",
        "Restored database has broken foreign-key references",
        "Restored database is missing portal tables",
        "Restored database row counts differ from backup",
    )
    if isinstance(error, ValueError) and str(error) in known:
        return str(error)
    if isinstance(error, subprocess.CalledProcessError) and action == "restore-local-test":
        output = error.stdout or ""
        if "FOREIGN KEY constraint failed" in output:
            return "Local D1 import failed foreign-key validation"
        if re.search(r"SQLITE_ERROR|syntax error|no such table|already exists", output, re.I):
            return "Local D1 import failed SQL validation"
        return "Local D1 import failed before completion"
    return type(error).__name__


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    actions.add_parser("keygen").add_argument("--out", required=True)
    for action in ("encrypt", "decrypt"):
        command = actions.add_parser(action)
        command.add_argument("--input", required=True)
        command.add_argument("--out", required=True)
        command.add_argument("--key", required=True)
    for action in ("verify", "restore-local-test"):
        command = actions.add_parser(action)
        command.add_argument("--input", required=True)
        command.add_argument("--key", required=True)
        if action == "restore-local-test":
            command.add_argument("--expect-client-id")
    command = actions.add_parser("export")
    command.add_argument("--database", required=True)
    command.add_argument("--scope", choices=("local", "remote"), required=True)
    command.add_argument("--out", required=True)
    command.add_argument("--key", required=True)
    actions.add_parser("counts").add_argument("--input", required=True)
    args = parser.parse_args()
    try:
        if args.action == "keygen":
            keygen(args.out)
        elif args.action == "encrypt":
            encrypt(args.input, args.out, read_key(args.key))
        elif args.action == "decrypt":
            decrypt(args.input, read_key(args.key), args.out)
        elif args.action == "verify":
            decrypt(args.input, read_key(args.key))
            print("Encrypted backup authentication succeeded.")
        elif args.action == "restore-local-test":
            restore_local_test(args.input, read_key(args.key), args.expect_client_id)
        elif args.action == "counts":
            print(json.dumps(sql_counts(args.input), sort_keys=True))
        else:
            export_database(args.database, args.scope, args.out, read_key(args.key))
    except ExportDiagnostic as error:
        parser.exit(1, f"Backup operation failed: {error}\n")
    except (ValueError, InvalidTag, FileExistsError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Backup operation failed: {safe_failure(error, args.action)}\n")


if __name__ == "__main__":
    main()
