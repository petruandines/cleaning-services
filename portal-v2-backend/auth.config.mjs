// Only for generating SQL from the same options as the Worker. No live connection.
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { authOptions } from './src/auth-options.mjs';

if (!process.env.BETTER_AUTH_SECRET) throw new Error('Set an ephemeral BETTER_AUTH_SECRET for schema generation');
export const auth = betterAuth(authOptions({
  database: new DatabaseSync(':memory:'),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: 'http://localhost:8787',
}));
