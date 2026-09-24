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
    return subprocess.run([str(WRANGLER), *args], cwd=ROOT, check=True,
                          text=True, stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.STDOUT if capture else None)


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


def restore_local_test(source, key):
    with tempfile.TemporaryDirectory(prefix="pi-d1-restore-") as directory:
        temp = Path(directory)
        plaintext = temp / "export.sql"
        decrypt(source, key, plaintext)
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
                     "--file", str(plaintext), capture=True)
        files = list(persist.rglob("*.sqlite"))
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
    print("Encrypted backup restored into an isolated local D1; integrity and foreign keys verified.")


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
    command = actions.add_parser("export")
    command.add_argument("--database", required=True)
    command.add_argument("--scope", choices=("local", "remote"), required=True)
    command.add_argument("--out", required=True)
    command.add_argument("--key", required=True)
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
            restore_local_test(args.input, read_key(args.key))
        else:
            export_database(args.database, args.scope, args.out, read_key(args.key))
    except (ValueError, InvalidTag, FileExistsError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Backup operation failed: {type(error).__name__}\n")


if __name__ == "__main__":
    main()
