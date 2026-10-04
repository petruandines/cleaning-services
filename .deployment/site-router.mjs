const CANONICAL = 'https://petruandines.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const alias = url.hostname === 'www.petruandines.com' ||
      /(^|\.)petruandines-site\.pages\.dev$/.test(url.hostname);
    if (url.origin !== CANONICAL) {
      if (!alias && url.hostname !== 'petruandines.com') return new Response('Not found', {status:404});
      return Response.redirect(CANONICAL + url.pathname + url.search, 301);
    }
    for (const [prefix, target] of [['/cleaning-services',''],['/portal-v2-frontend','/portal']]) {
      if (url.pathname === prefix || url.pathname.startsWith(prefix + '/')) {
        return Response.redirect(CANONICAL + target + (url.pathname.slice(prefix.length) || '/') + url.search, 301);
      }
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    if (url.pathname === '/portal' || url.pathname.startsWith('/portal/')) {
      headers.set('Cache-Control','no-store');
      headers.set('X-Robots-Tag','noindex, nofollow');
      headers.set('X-Frame-Options','DENY');
    }
    return new Response(response.body, {status:response.status,headers});
  },
};
