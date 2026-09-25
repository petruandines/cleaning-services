import { commitRecord, createStaffRecord } from './writes.mjs';
import { changeInitialPassword, createClientUser, mustChangePassword } from './accounts.mjs';
import { changeStaffRecord } from './mutations.mjs';
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
  return !origin || origin === ORIGIN || origin === new URL(request.url).origin;
}

const lists = Object.freeze({
  locations: 'id, client_id, label, address, city, county, contact_name, contact_phone, contact_email, active, created_at',
  appointments: 'a.id, a.client_id, a.location_id, a.starts_at, a.ends_at, a.status, a.client_note, a.estimated_cost_bani, c.display_name AS client_name, l.label AS location_name, l.address AS location_address',
  jobs: 'id, client_id, appointment_id, service_name, description, status, price_bani, completed_at',
  payments: 'id, client_id, job_id, amount_bani, status, recorded_at, note',
  messages: 'm.id, m.client_id, m.sender_user_id, m.body, m.created_at, m.read_at, c.display_name AS client_name, u.name AS sender_name',
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
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-max-age': '600', 'vary': 'Origin',
    }});
  }
  const url = new URL(request.url);
  const [, name, recordId] = /^\/api\/([a-z]+)(?:\/([\w-]{1,100}))?$/.exec(url.pathname) || [];
  if (!name) return error(404, 'not_found');
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return error(401, 'unauthorized');
  const userId = session.user.id;
  const staff = session.user.role === 'admin';
  const initialPassword = staff ? false : await mustChangePassword(db, userId);
  if (!staff) {
    const access = await db.prepare("SELECT cu.client_id FROM client_users cu JOIN clients c ON c.id = cu.client_id WHERE cu.user_id = ? AND c.deleted_at IS NULL AND c.status = 'active' LIMIT 1")
      .bind(userId).all();
    if (!access.results.length) return error(401, 'no_active_client');
  }

  if (name === 'me' && request.method === 'GET') {
    return json({ id: userId, name: session.user.name, role: staff ? 'staff' : 'client',
      twoFactorRequired: staff && session.user.twoFactorEnabled !== true, mustChangePassword: initialPassword });
  }
  if (staff && session.user.twoFactorEnabled !== true) return error(403, 'two_factor_required');
  if (initialPassword && name !== 'password') return error(403, 'initial_password_required');
  if (!['clients', 'users', 'password'].includes(name) && !Object.hasOwn(lists, name)) return error(404, 'not_found');
  if (recordId && (request.method === 'PATCH' || request.method === 'DELETE')) {
    if (!staff || (name !== 'clients' && !Object.hasOwn(lists, name))) return error(403, 'forbidden');
    if (request.method === 'DELETE') {
      const result = await changeStaffRecord(db, name, recordId, null, userId);
      return result.error ? error(result.status, result.error) : json({ deleted: true });
    }
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return error(415, 'json_required');
    const raw = await request.text();
    if (raw.length > 6000) return error(413, 'payload_too_large');
    let data;
    try { data = JSON.parse(raw); } catch { return error(400, 'invalid_json'); }
    const result = await changeStaffRecord(db, name, recordId, data, userId);
    return result.error ? error(result.status, result.error) : json({ id: result.id });
  }
  if (recordId) return error(405, 'method_not_allowed');

  if (name === 'users' && request.method === 'GET') {
    if (!staff) return error(403, 'forbidden');
    const clientId = url.searchParams.get('client_id');
    if (!clientId || !/^[a-zA-Z0-9_-]{1,100}$/.test(clientId)) return error(400, 'invalid_client_id');
    const result = await db.prepare('SELECT u.id, u.name, u.email FROM client_users cu JOIN "user" u ON u.id = cu.user_id WHERE cu.client_id = ? ORDER BY cu.created_at DESC LIMIT ?')
      .bind(clientId, LIMIT).all();
    return json({ rows: result.results });
  }

  if (request.method === 'GET') {
    if (name === 'password' || name === 'users') return error(405, 'method_not_allowed');
    if (name === 'clients' && !staff) return error(403, 'forbidden');
    const offsetValue = url.searchParams.get('offset') || '0';
    if (!/^\d{1,6}$/.test(offsetValue)) return error(400, 'invalid_offset');
    const offset = Number(offsetValue);
    const search = url.searchParams.get('search');
    const clientId = url.searchParams.get('client_id');
    if (search !== null && (name !== 'clients' || search.trim().length > 120)) return error(400, 'invalid_search');
    if (clientId !== null && (!staff || name === 'clients' || !/^[a-zA-Z0-9_-]{1,100}$/.test(clientId))) return error(400, 'invalid_filter');
    // Only constant SQL fragments are interpolated. IDs never become SQL source.
    let sql, params;
    if (name === 'clients') {
      sql = 'SELECT id, kind, display_name, email, phone, company_name, cui, status FROM clients WHERE deleted_at IS NULL';
      params = [];
      if (search?.trim()) { sql += ' AND instr(lower(display_name), lower(?)) > 0'; params.push(search.trim()); }
      sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
    } else {
      const joined = name === 'appointments' ?
        'appointments a JOIN clients c ON c.id = a.client_id JOIN locations l ON l.id = a.location_id AND l.client_id = a.client_id' :
        name === 'messages' ?
          'messages m JOIN clients c ON c.id = m.client_id LEFT JOIN "user" u ON u.id = m.sender_user_id' : name;
      const prefix = name === 'appointments' ? 'a.' : name === 'messages' ? 'm.' : '';
      sql = `SELECT ${lists[name]} FROM ${joined} WHERE ${prefix}deleted_at IS NULL`;
      params = [];
      if (staff && clientId) { sql += ` AND ${prefix}client_id = ?`; params.push(clientId); }
      if (!staff) {
        sql += ` AND ${prefix}client_id IN (SELECT cu.client_id FROM client_users cu JOIN clients c ON c.id = cu.client_id WHERE cu.user_id = ? AND c.deleted_at IS NULL AND c.status = 'active')`;
        params.push(userId);
      }
      sql += ` ORDER BY ${prefix}${order[name]}, ${prefix}id DESC LIMIT ? OFFSET ?`;
    }
    const result = await db.prepare(sql).bind(...params, LIMIT + 1, offset).all();
    return json({ rows: result.results.slice(0, LIMIT), nextOffset: result.results.length > LIMIT ? offset + LIMIT : null });
  }

  if (request.method === 'POST') {
    if (name === 'users' && !staff) return error(403, 'forbidden');
    if (!staff && !['messages', 'password'].includes(name)) return error(403, 'forbidden');
    if (name === 'password' && (staff || request.headers.get('Origin') !== url.origin)) return error(403, 'forbidden');
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return error(415, 'json_required');
    const raw = await request.text();
    if (raw.length > 6000) return error(413, 'payload_too_large');
    let data;
    try { data = JSON.parse(raw); } catch { return error(400, 'invalid_json'); }
    if (name === 'password') {
      const result = await changeInitialPassword({ db, auth, headers: request.headers, userId, data });
      return result.error ? error(result.status, result.error) : json({ token: result.token }, 200);
    }
    if (name === 'users') {
      const result = await createClientUser({ db, auth, headers: request.headers, actor: userId, data });
      return result.error ? error(result.status, result.error) : json({ id: result.id }, result.status);
    }
    if (staff) {
      const result = await createStaffRecord(db, name, data, userId);
      return result.error ? error(result.status, result.error) : json({ id: result.id }, result.status);
    }
    const body = data?.body;
    if (typeof body !== 'string' || !body.trim() || body.trim().length > 4000) return error(400, 'invalid_message');
    // A client with access to several companies must choose one later. We
    // reject this ambiguous write instead of trusting a client_id in JSON.
    const access = await db.prepare("SELECT cu.client_id FROM client_users cu JOIN clients c ON c.id = cu.client_id WHERE cu.user_id = ? AND c.deleted_at IS NULL AND c.status = 'active' LIMIT 2").bind(userId).all();
    if (access.results.length !== 1) return error(403, 'client_scope_required');
    const id = crypto.randomUUID();
    const at = new Date().toISOString();
    await commitRecord(db, {
      sql: 'INSERT INTO messages (id, client_id, sender_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      values: [id, access.results[0].client_id, userId, body.trim(), at],
      actor: userId, clientId: access.results[0].client_id, entity: 'messages', id, at,
    });
    return json({ id }, 201);
  }
  return error(405, 'method_not_allowed');
}

export { ORIGIN };
