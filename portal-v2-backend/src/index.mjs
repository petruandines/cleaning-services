import { betterAuth } from 'better-auth';
import { handleApi } from './api.mjs';
import { isPortalOrigin, corsOrigin } from './origins.mjs';
import { authOptions } from './auth-options.mjs';
import { handleOneTime } from './one-time.mjs';

const CANONICAL_PORTAL_ORIGIN = 'https://petruandines.com';
const CANONICAL_PORTAL_AUTH_PATHS = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/two-factor/verify-totp',
  '/api/auth/two-factor/enable',
  '/api/auth/sign-out',
]);

function cors(response, request) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', corsOrigin(request));
  headers.set('access-control-expose-headers', 'set-auth-token, x-retry-after');
  headers.set('access-control-allow-credentials', 'true');
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
    // Browser traffic is accepted only from the explicit portal origins or
    // from the API's own origin. The canonical portal may submit the small,
    // audited authentication surface directly so Safari/iPadOS does not have
    // to preserve a cross-origin window.opener reference.
    if (origin && !isPortalOrigin(origin) && origin !== url.origin) return new Response('Forbidden', { status: 403 });
    if (url.pathname.startsWith('/api/one-time/')) {
      return handleOneTime(request, { db: env.DB, auth: createAuth(env) });
    }
    if (url.pathname.startsWith('/api/auth/')) {
      // Account creation/roles go through the audited portal endpoint only.
      if (url.pathname.startsWith('/api/auth/admin/')) return new Response('Not found', { status: 404 });
      if (isPortalOrigin(origin)) {
        const canonicalPortalAuth = origin === CANONICAL_PORTAL_ORIGIN && CANONICAL_PORTAL_AUTH_PATHS.has(url.pathname);
        const signOut = url.pathname === '/api/auth/sign-out';
        if (!canonicalPortalAuth && !signOut) return new Response('Forbidden', { status: 403 });
      }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': corsOrigin(request),
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'Authorization, Content-Type',
        'access-control-allow-credentials': 'true',
        'access-control-max-age': '600', 'vary': 'Origin',
      }});
      return cors(await createAuth(env).handler(request), request);
    }
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, { db: env.DB, auth: createAuth(env) });
    }
    return new Response('Not found', { status: 404 });
  },
};
