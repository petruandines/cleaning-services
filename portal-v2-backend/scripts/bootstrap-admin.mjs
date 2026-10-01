import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { authOptions } from '../src/auth-options.mjs';

function option(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const email = option('--email')?.toLowerCase();
const name = option('--name');
const output = option('--out');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name?.trim() || !output ||
  process.stdin.isTTY) {
  process.stderr.write('Usage: read a password privately, pipe it to node scripts/bootstrap-admin.mjs --email EMAIL --name NAME --out /secure/path/admin.sql\n');
  process.exit(2);
}
let input = '';
for await (const part of process.stdin) {
  input += part;
  if (input.length > 129) throw new Error('Password too long');
}
const password = input.replace(/\r?\n$/, '');
if (password.length < 12 || password.length > 128) throw new Error('Password must have 12–128 characters');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../../docs/portal-v2/0002_auth.sql', import.meta.url), 'utf8'));
const auth = betterAuth(authOptions({ database: sqlite,
  secret: 'bootstrap-only-ephemeral-secret-not-used-in-password-hash',
  baseURL: 'https://bootstrap.invalid',
}));
// Server-only API: no HTTP endpoint or public signup is enabled. Better Auth
// creates and hashes the credential account with the pinned 1.7.5 version.
const created = await auth.api.createUser({ body: { email, name: name.trim(), password, role: 'admin' } });
const id = created.user.id;
const user = sqlite.prepare('SELECT * FROM "user" WHERE id = ?').get(id);
const account = sqlite.prepare('SELECT * FROM "account" WHERE userId = ? AND providerId = ?').get(id, 'credential');
if (!user || !account?.password || user.role !== 'admin') throw new Error('Bootstrap failed');

function quote(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return "'" + value.replace(/'/g, "''") + "'";
  if (value instanceof Uint8Array) return "X'" + Buffer.from(value).toString('hex') + "'";
  throw new Error('Unexpected database value');
}
function insert(table, row) {
  const columns = Object.keys(row);
  return `INSERT INTO "${table}" (${columns.map(key => '"' + key + '"').join(', ')}) VALUES (${columns.map(key => quote(row[key])).join(', ')});`;
}
const sql = ['BEGIN TRANSACTION;', insert('user', user), insert('account', account), 'COMMIT;', ''].join('\n');
writeFileSync(output, sql, { flag: 'wx', mode: 0o600 });
sqlite.close();
process.stdout.write('One-time admin import generated. Keep the SQL private and delete it after importing.\n');
