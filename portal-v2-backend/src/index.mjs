import { betterAuth } from 'better-auth';
import { handleApi, ORIGIN } from './api.mjs';
import { authOptions } from './auth-options.mjs';

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', ORIGIN);
  headers.set('access-control-expose-headers', 'set-auth-token, x-retry-after');
  headers.set('cache-control', 'no-store');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

export function createAuth(env) {
  if (!env.DB || !env.BETTER_AUTH_SECRET || !env.PUBLIC_API_URL) throw new Error('Missing backend configuration');
  return betterAuth(authOptions({ database: env.DB, secret: env.BETTER_AUTH_SECRET, baseURL: env.PUBLIC_API_URL }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    // The login popup posts from this Worker's own origin. Portal requests
    // arrive from GitHub Pages; reject every other browser origin.
    if (origin && origin !== ORIGIN && origin !== url.origin) return new Response('Forbidden', { status: 403 });
    if (url.pathname.startsWith('/api/auth/')) {
      // Only the Worker's own login popup handles credentials. The Pages
      // frontend needs a cross-origin request solely to revoke its session.
      if (origin === ORIGIN && url.pathname !== '/api/auth/sign-out') return new Response('Forbidden', { status: 403 });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': ORIGIN,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'Authorization, Content-Type',
        'access-control-max-age': '600', 'vary': 'Origin',
      }});
      return cors(await createAuth(env).handler(request));
    }
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, { db: env.DB, auth: createAuth(env) });
    }
    return new Response('Not found', { status: 404 });
  },
};
