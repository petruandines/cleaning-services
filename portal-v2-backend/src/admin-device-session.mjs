const COOKIE = '__Host-pi-admin-device';
const AGE = 30 * 24 * 60 * 60;
const TAB_AGE = 8 * 60 * 60;
const PREFIX = 'pi-device:';

function deviceToken(request) {
  const match = (request.headers.get('cookie') || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(COOKIE + '='));
  const token = match?.slice(COOKIE.length + 1);
  return typeof token === 'string' && /^[a-zA-Z0-9_-]{20,100}$/.test(token) ? token : null;
}
function reply(value, status = 200, cookie) {
  return Response.json(value, { status, headers: {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    ...(cookie ? { 'set-cookie': cookie } : {}),
  }});
}
function cookie(token = '', age = 0) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
}
function admin(session) {
  return session?.user?.id && session.user.role === 'admin' && session.user.twoFactorEnabled === true &&
    !session.user.banned && !session.session.impersonatedBy;
}
async function readDevice(request, auth) {
  const token = deviceToken(request);
  if (!token) return null;
  const session = await auth.api.getSession({
    headers: new Headers({ authorization: 'Bearer ' + token }), query: { disableRefresh: true },
  });
  return admin(session) ? session : null;
}
async function revokeDevice(request, auth, adapter) {
  const session = await readDevice(request, auth);
  if (!session) return;
  const children = await adapter.listSessions(session.user.id);
  for (const child of children) {
    if (child.userAgent === PREFIX + session.session.id) await adapter.deleteSession(child.token);
  }
  await adapter.deleteSession(session.session.token);
}

export async function handleAdminDeviceSession(request, auth) {
  // Cookie credentials are accepted only from the actual production portal/API.
  const origin = request.headers.get('Origin');
  if (!['https://petruandines.com', new URL(request.url).origin].includes(origin))
    return reply({ error: 'forbidden' }, 403);
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return reply({ error: 'method_not_allowed' }, 405);
  const { internalAdapter: adapter } = await auth.$context;
  if (request.method === 'DELETE') {
    await revokeDevice(request, auth, adapter);
    return reply({ remembered: false }, 200, cookie());
  }
  if (request.method === 'POST') {
    const session = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } });
    if (!session) return reply({ error: 'unauthorized' }, 401);
    if (!admin(session)) return reply({ error: 'forbidden' }, 403);
    // Remembering a device is an explicit choice made immediately after login.
    const loginTime = new Date(session.session.createdAt).getTime();
    if (!Number.isFinite(loginTime) || Date.now() - loginTime > 15 * 60 * 1000 ||
        session.session.userAgent?.startsWith(PREFIX))
      return reply({ error: 'fresh_login_required' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
      return reply({ error: 'json_required' }, 415);
    const raw = await request.text();
    if (raw !== '{}') return reply({ error: 'invalid_fields' }, 400);
    await revokeDevice(request, auth, adapter);
    const expiresAt = new Date(Date.now() + AGE * 1000);
    const device = await adapter.createSession(session.user.id, false, {
      expiresAt, ipAddress: request.headers.get('cf-connecting-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    }, true);
    if (!device?.token) return reply({ error: 'session_failed' }, 500);
    // The long lived credential never enters JavaScript or browser storage.
    return reply({ remembered: true, expiresAt: expiresAt.toISOString() }, 200, cookie(device.token, AGE));
  }
  const session = await readDevice(request, auth);
  if (!session) return reply({ error: 'unauthorized' }, 401, cookie());
  const children = await adapter.listSessions(session.user.id);
  const existing = children.find(child => child.userAgent === PREFIX + session.session.id &&
    new Date(child.expiresAt).getTime() > Date.now() + 60000);
  if (existing) return reply({ token: existing.token });
  const expiresAt = new Date(Math.min(new Date(session.session.expiresAt).getTime(), Date.now() + TAB_AGE * 1000));
  const tab = await adapter.createSession(session.user.id, false, {
    expiresAt, userAgent: PREFIX + session.session.id,
    ipAddress: request.headers.get('cf-connecting-ip') || '',
  }, true);
  if (!tab?.token) return reply({ error: 'session_failed' }, 500);
  return reply({ token: tab.token });
}
