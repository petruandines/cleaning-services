import { commitRecord, createStaffRecord } from './writes.mjs';
import { changeInitialPassword, createClientUser, mustChangePassword } from './accounts.mjs';
import { changeStaffRecord } from './mutations.mjs';
import { ORIGIN, isPortalOrigin, corsOrigin } from './origins.mjs';
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
  return !origin || isPortalOrigin(origin) || origin === new URL(request.url).origin;
}

const lists = Object.freeze({
  locations: 'id, client_id, label, address, city, county, contact_name, contact_phone, contact_email, active, created_at',
  appointments: 'a.id, a.client_id, a.location_id, a.starts_at, a.ends_at, a.status, a.client_note, a.estimated_cost_bani, c.display_name AS client_name, l.label AS location_name, l.address AS location_address',
  jobs: 'id, client_id, appointment_id, service_name, description, status, price_bani, completed_at',
  payments: 'p.id, p.client_id, p.job_id, p.amount_bani, p.status, p.recorded_at, p.created_at, p.note, p.invoice_url, a.starts_at AS appointment_starts_at, l.label AS location_name, j.service_name',
  messages: 'm.id, m.client_id, m.sender_user_id, m.body, m.created_at, m.read_at, c.display_name AS client_name, u.name AS sender_name',
});

const order = Object.freeze({
  locations: 'created_at DESC', appointments: 'starts_at DESC', jobs: 'created_at DESC',
  payments: 'created_at DESC', messages: 'created_at DESC',
});

// This module is intentionally independent of the authentication library.
// Authentication is verified on the Worker before any D1 query is run.
export async function handleApi(request, context) {
  const response = await dispatchApi(request, context);
  const headers = new Headers(response.headers);
  if (allowedOrigin(request)) headers.set('access-control-allow-origin', corsOrigin(request));
  else headers.delete('access-control-allow-origin');
  return new Response(response.body, { status: response.status, headers });
}

async function dispatchApi(request, { db, auth }) {
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

  if (name === 'overview' && !recordId && request.method === 'GET') {
    if (staff && session.user.twoFactorEnabled !== true) return error(403, 'two_factor_required');
    if (initialPassword) return error(403, 'initial_password_required');
    const inboundRole = staff ? 'user' : 'admin';
    const scope = staff ? '' : ` AND m.client_id IN (
      SELECT cu.client_id FROM client_users cu JOIN clients c ON c.id = cu.client_id
      WHERE cu.user_id = ? AND c.deleted_at IS NULL AND c.status = 'active')`;
    const unread = await db.prepare(`SELECT COUNT(*) AS total FROM messages m
      JOIN clients c ON c.id = m.client_id AND c.deleted_at IS NULL AND c.status = 'active'
      JOIN "user" u ON u.id = m.sender_user_id
      WHERE m.deleted_at IS NULL AND m.read_at IS NULL AND u.role = ?${scope}`)
      .bind(...(staff ? [inboundRole] : [inboundRole, userId])).all();
    let appointment = null;
    if (!staff) {
      const result = await db.prepare(`SELECT a.starts_at, l.label AS location_name, l.address AS location_address
        FROM appointments a JOIN locations l ON l.id = a.location_id AND l.client_id = a.client_id
        JOIN clients c ON c.id = a.client_id
        WHERE a.deleted_at IS NULL AND l.deleted_at IS NULL AND c.deleted_at IS NULL
          AND c.status = 'active' AND a.status IN ('requested', 'confirmed', 'in_progress')
          AND a.ends_at >= ?
          AND a.client_id IN (SELECT client_id FROM client_users WHERE user_id = ?)
        ORDER BY a.starts_at ASC LIMIT 1`).bind(new Date().toISOString(), userId).all();
      appointment = result.results[0] || null;
    }
    return json({ unreadMessages: unread.results[0]?.total || 0, nextAppointment: appointment });
  }
  if (name === 'notifications' && recordId === 'read' && request.method === 'POST') {
    if (staff && session.user.twoFactorEnabled !== true) return error(403, 'two_factor_required');
    if (initialPassword) return error(403, 'initial_password_required');
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return error(415, 'json_required');
    let clientId;
    let body;
    const raw = await request.text();
    if (raw.length > 4000) return error(413, 'payload_too_large');
    try { body = JSON.parse(raw); } catch { return error(400, 'invalid_json'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error(400, 'invalid_json');
    const ids = body.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 30 ||
        ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) ||
        new Set(ids).size !== ids.length) return error(400, 'invalid_message_ids');
    if (staff) {
      if (Object.keys(body).length !== 2 || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.client_id))
        return error(400, 'invalid_client_id');
      clientId = body.client_id;
      const exists = await db.prepare("SELECT id FROM clients WHERE id = ? AND deleted_at IS NULL AND status = 'active' LIMIT 1").bind(clientId).all();
      if (!exists.results.length) return error(404, 'client_not_found');
    }
    else if (Object.keys(body).length !== 1) return error(403, 'forbidden');
    const restriction = staff ? 'AND m.client_id = ?' : `AND m.client_id IN (
      SELECT cu.client_id FROM client_users cu JOIN clients c ON c.id = cu.client_id
      WHERE cu.user_id = ? AND c.deleted_at IS NULL AND c.status = 'active')`;
    const placeholders = ids.map(() => '?').join(', ');
    await db.prepare(`UPDATE messages SET read_at = ? WHERE id IN (
      SELECT m.id FROM messages m JOIN "user" u ON u.id = m.sender_user_id
      WHERE m.read_at IS NULL AND m.deleted_at IS NULL AND u.role = ? ${restriction}
      AND m.id IN (${placeholders}))`)
      .bind(new Date().toISOString(), staff ? 'user' : 'admin', staff ? clientId : userId, ...ids).run();
    return json({ read: true });
  }

  if (name === 'me' && request.method === 'GET') {
    return json({ id: userId, name: session.user.name, role: staff ? 'staff' : 'client',
      twoFactorRequired: staff && session.user.twoFactorEnabled !== true, mustChangePassword: initialPassword });
  }
  if (staff && session.user.twoFactorEnabled !== true) return error(403, 'two_factor_required');
  if (initialPassword && name !== 'password') return error(403, 'initial_password_required');
  if (name === 'contracts' && !recordId && request.method === 'GET') {
    const clientId = url.searchParams.get('client_id');
    if ((staff && (!clientId || !/^[a-zA-Z0-9_-]{1,100}$/.test(clientId))) ||
        (!staff && clientId !== null)) return error(400, 'invalid_filter');
    const columns = `c.id AS client_id, c.display_name AS client_name, c.billing_type,
      c.contract_rate_bani, c.manager_name, c.manager_email, c.manager_phone,
      c.contract_reference, c.contract_details`;
    const sql = staff ? `SELECT ${columns} FROM clients c WHERE c.id = ? AND c.deleted_at IS NULL` :
      `SELECT ${columns} FROM clients c JOIN client_users cu ON cu.client_id = c.id
       WHERE cu.user_id = ? AND c.deleted_at IS NULL AND c.status = 'active'
         AND (c.billing_type IS NOT NULL OR c.contract_rate_bani IS NOT NULL
           OR c.manager_name IS NOT NULL OR c.manager_email IS NOT NULL
           OR c.manager_phone IS NOT NULL OR c.contract_reference IS NOT NULL
           OR c.contract_details IS NOT NULL) ORDER BY c.display_name, c.id`;
    const result = await db.prepare(sql).bind(staff ? clientId : userId).all();
    return json({ rows: result.results });
  }
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
    if (search !== null && (!['clients', 'messages'].includes(name) || search.trim().length > 120)) return error(400, 'invalid_search');
    if (clientId !== null && (!staff || name === 'clients' || !/^[a-zA-Z0-9_-]{1,100}$/.test(clientId))) return error(400, 'invalid_filter');
    if (staff && name === 'messages' && !clientId) return json({ rows: [], nextOffset: null });
    // Only constant SQL fragments are interpolated. IDs never become SQL source.
    let sql, params;
    if (name === 'clients') {
      sql = 'SELECT id, kind, display_name, email, phone, company_name, cui, status, internal_note FROM clients WHERE deleted_at IS NULL';
      params = [];
      if (search?.trim()) { sql += ' AND instr(lower(display_name), lower(?)) > 0'; params.push(search.trim()); }
      sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
    } else {
      const joined = name === 'appointments' ?
        'appointments a JOIN clients c ON c.id = a.client_id JOIN locations l ON l.id = a.location_id AND l.client_id = a.client_id' :
        name === 'payments' ?
          'payments p JOIN jobs j ON j.id = p.job_id AND j.client_id = p.client_id LEFT JOIN appointments a ON a.id = j.appointment_id AND a.client_id = p.client_id LEFT JOIN locations l ON l.id = a.location_id AND l.client_id = p.client_id' :
        name === 'messages' ?
          'messages m JOIN clients c ON c.id = m.client_id LEFT JOIN "user" u ON u.id = m.sender_user_id' : name;
      const prefix = name === 'appointments' ? 'a.' : name === 'payments' ? 'p.' : name === 'messages' ? 'm.' : '';
      sql = `SELECT ${lists[name]} FROM ${joined} WHERE ${prefix}deleted_at IS NULL`;
      params = [];
      if (staff && clientId) { sql += ` AND ${prefix}client_id = ?`; params.push(clientId); }
      if (!staff) {
        sql += ` AND ${prefix}client_id IN (SELECT cu.client_id FROM client_users cu JOIN clients c ON c.id = cu.client_id WHERE cu.user_id = ? AND c.deleted_at IS NULL AND c.status = 'active')`;
        params.push(userId);
      }
      if (name === 'messages' && search?.trim()) {
        sql += ' AND instr(lower(m.body), lower(?)) > 0';
        params.push(search.trim());
      }
      sql += ` ORDER BY ${prefix}${order[name]}, ${prefix}id DESC LIMIT ? OFFSET ?`;
    }
    const result = await db.prepare(sql).bind(...params, LIMIT + 1, offset).all();
    const rows = result.results.slice(0, LIMIT);
    if (name === 'payments' && rows.length) {
      // One scoped enrichment query; a payment remains one pagination/export row.
      const links = await db.prepare(`SELECT pl.payment_id, pl.client_id, l.id, l.label FROM payment_locations pl JOIN locations l ON l.id = pl.location_id AND l.client_id = pl.client_id WHERE pl.payment_id IN (${rows.map(() => '?').join(',')}) ORDER BY l.label, l.id`)
        .bind(...rows.map(row => row.id)).all();
      for (const row of rows) {
        const locations = links.results.filter(link => link.payment_id === row.id && link.client_id === row.client_id);
        row.location_ids = locations.map(location => location.id);
        row.location_details = locations.map(({ id, label }) => ({ id, label }));
        row.location_name = locations.map(location => location.label).join(' · ') || row.location_name;
      }
    }
    return json({ rows, nextOffset: result.results.length > LIMIT ? offset + LIMIT : null });
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
