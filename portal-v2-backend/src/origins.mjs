export const ORIGIN = 'https://petruandines.github.io';
export const PORTAL_ORIGINS = Object.freeze([
  ORIGIN,
  'https://petruandines.com',
  'https://www.petruandines.com',
  'https://petruandines-site.pages.dev',
]);

export function isPortalOrigin(origin) {
  return PORTAL_ORIGINS.includes(origin);
}

export function corsOrigin(request) {
  const origin = request.headers.get('Origin');
  return isPortalOrigin(origin) ? origin : ORIGIN;
}
