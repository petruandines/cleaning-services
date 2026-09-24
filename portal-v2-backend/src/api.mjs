const ORIGIN = 'https://petruandines.github.io';
const LIMIT = 30;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'access-control-allow-origin': ORIGIN,
    'vary': 'Origin',
  }});
}

function error(status, code) { return json({ error: code }, status); }

function allowedOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === ORIGIN;
}

const lists = Object.freeze({
  locations: 'id, client_id, label, address, city, county, active, created_at',
  appointments: 'id, client_id, location_id, starts_at, ends_at, status, client_note, estimated_cost_bani',
  jobs: 'id, client_id, appointment_id, service_name, description, status, price_bani, completed_at',
  payments: 'id, client_id, job_id, amount_bani, status, recorded_at',
  messages: 'id, client_id, sender_user_id, body, created_at, read_at',
});

const order = Object.freeze({
  locations: 'created_at DESC', appointments: 'starts_at DESC', jobs: 'created_at DESC',
  payments: 'created_at DESC', messages: 'created_at DESC',
});

// This module is intentionally independent of the authentication library.
// Authentication is verified on the Worker before any D1 query is run.
export async function handleApi(request, { db, auth }) {
  if (!allowedOrigin(request)) return error(403, 'origin_forbidden');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': ORIGIN,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-max-age': '600', 'vary': 'Origin',
    }});
  }
  const url = new URL(request.url);
  const name = url.pathname.slice('/api/'.length);
  if (!/^[a-z]+$/.test(name)) return error(404, 'not_found');
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return error(401, 'unauthorized');
  const userId = session.user.id;
  const staff = session.user.role === 'admin';

  if (name === 'me' && request.method === 'GET') {
    return json({ id: userId, name: session.user.name, role: staff ? 'staff' : 'client', twoFactorRequired: staff && session.user.twoFactorEnabled !== true });
  }
  if (staff && session.user.twoFactorEnabled !== true) return error(403, 'two_factor_required');
  if (name === 'clients' && request.method === 'GET') {
    if (!staff) return error(403, 'forbidden');
    const result = await db.prepare('SELECT id, kind, display_name, email, phone, company_name, cui, status FROM clients ORDER BY created_at DESC LIMIT ?').bind(LIMIT).all();
    return json({ rows: result.results });
  }
  if (!Object.hasOwn(lists, name)) return error(404, 'not_found');

  if (request.method === 'GET') {
    // Only constant SQL fragments are interpolated. IDs never become SQL source.
    const sql = staff
      ? `SELECT ${lists[name]} FROM ${name} ORDER BY ${order[name]} LIMIT ?`
      : `SELECT ${lists[name]} FROM ${name} WHERE client_id IN (SELECT client_id FROM client_users WHERE user_id = ?) ORDER BY ${order[name]} LIMIT ?`;
    const query = db.prepare(sql);
    const result = await (staff ? query.bind(LIMIT) : query.bind(userId, LIMIT)).all();
    return json({ rows: result.results });
  }

  if (name === 'messages' && request.method === 'POST') {
    if (staff) return error(403, 'staff_message_endpoint_pending');
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return error(415, 'json_required');
    const raw = await request.text();
    if (raw.length > 5000) return error(413, 'message_too_long');
    let body;
    try { body = JSON.parse(raw)?.body; } catch { return error(400, 'invalid_json'); }
    if (typeof body !== 'string' || !body.trim() || body.length > 4000) return error(400, 'invalid_message');
    // A client with access to several companies must choose one later. We
    // reject this ambiguous write instead of trusting a client_id in JSON.
    const access = await db.prepare('SELECT client_id FROM client_users WHERE user_id = ? LIMIT 2').bind(userId).all();
    if (access.results.length !== 1) return error(403, 'client_scope_required');
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO messages (id, client_id, sender_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, access.results[0].client_id, userId, body.trim(), new Date().toISOString()).run();
    return json({ id }, 201);
  }
  return error(405, 'method_not_allowed');
}

export { ORIGIN };
