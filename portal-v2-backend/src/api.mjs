import { commitRecord, createStaffRecord } from './writes.mjs';
import { changeInitialPassword, createClientUser, mustChangePassword } from './accounts.mjs';
import { changeStaffRecord } from './mutations.mjs';
export const ORIGIN = 'https://petruandines.com';
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
  payments: 'p.id, p.client_id, p.job_id, p.amount_bani, p.status, p.recorded_at, p.created_at, p.note, p.invoice_url, a.starts_at AS appointment_starts_at, l.label AS location_name, j.service_name',
  messages: 'm.id, m.client_id, m.sender_user_id, m.body, m.created_at, m.read_at, c.display_name AS client_name, u.name AS sender_name',
});
const staffLists = Object.freeze({
  clients: 'id, kind, display_name, email, phone, company_name, cui, status, created_at, internal_note, billing_type, contract_rate_bani, manager_name, manager_email, manager_phone, contract_reference, contract_details',
});
const searchColumns = Object.freeze({
  clients: ['display_name', 'email', 'phone', 'company_name', 'cui'],
  locations: ['label', 'address', 'city', 'county', 'contact_name', 'contact_email', 'contact_phone'],
  appointments: ['c.display_name', 'l.label', 'l.address', 'a.status'],
  jobs: ['service_name', 'description', 'status'],
  messages: ['m.body', 'c.display_name', 'u.name'],
});
const id = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value);
const escapeLike = value => value.replace(/[\\%_]/g, character => '\\' + character);
function parseRead(url, staff) {
  for (const key of url.searchParams.keys()) if (!['client_id', 'offset', 'search'].includes(key)) return null;
  const filter = url.searchParams.get('client_id');
  const rawOffset = url.searchParams.get('offset');
  const rawSearch = url.searchParams.get('search');
  if (filter && (!staff || !id(filter))) return null;
  if (rawOffset !== null && !/^(0|[1-9]\d{0,5})$/.test(rawOffset)) return null;
  if (rawSearch !== null && (!rawSearch.trim() || rawSearch.trim().length > 100)) return null;
  return { filter, offset: rawOffset === null ? 0 : Number(rawOffset), search: rawSearch?.trim() || null };
}

async function allowedClient(db, userId, clientId, staff) {
  if (staff) return true;
  const result = await db.prepare(`SELECT 1 FROM client_users cu JOIN clients c ON c.id = cu.client_id
    WHERE cu.user_id = ? AND cu.client_id = ? AND c.status = 'active' AND c.deleted_at IS NULL LIMIT 1`)
    .bind(userId, clientId).all();
  return result.results.length === 1;
}
async function clientForUser(db, userId) {
  const result = await db.prepare(`SELECT cu.client_id FROM client_users cu JOIN clients c ON c.id = cu.client_id
    WHERE cu.user_id = ? AND c.status = 'active' AND c.deleted_at IS NULL LIMIT 2`).bind(userId).all();
  return result.results.length === 1 ? result.results[0].client_id : null;
}

async function sessionFor(request, auth) {
  return auth.api.getSession({ headers: request.headers });
}
function isStaff(session) { return session.user.role === 'admin'; }
function staffReady(session) { return isStaff(session) && session.user.twoFactorEnabled === true; }

async function listRows(db, name, clientId, staff, read) {
  if (name === 'clients' && !staff) return null;
  const fields = staffLists[name] || lists[name];
  if (!fields) return null;
  const aliases = { appointments: 'a', payments: 'p', messages: 'm' };
  const alias = aliases[name] || name;
  let from = name;
  if (name === 'appointments') from = 'appointments a JOIN clients c ON c.id = a.client_id LEFT JOIN locations l ON l.id = a.location_id AND l.client_id = a.client_id';
  if (name === 'payments') from = `payments p LEFT JOIN jobs j ON j.id = p.job_id AND j.client_id = p.client_id
    LEFT JOIN appointments a ON a.id = j.appointment_id AND a.client_id = j.client_id
    LEFT JOIN locations l ON l.id = a.location_id AND l.client_id = a.client_id`;
  if (name === 'messages') from = 'messages m JOIN clients c ON c.id = m.client_id LEFT JOIN "user" u ON u.id = m.sender_user_id';
  const where = [`${alias}.deleted_at IS NULL`];
  const args = [];
  if (!staff || read.filter) { where.push(`${alias}.client_id = ?`); args.push(read.filter || clientId); }
  if (read.search) {
    const columns = searchColumns[name];
    if (!columns) return null;
    const pattern = `%${escapeLike(read.search)}%`;
    where.push('(' + columns.map(column => `${column} LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
    args.push(...columns.map(() => pattern));
  }
  const query = `SELECT ${fields} FROM ${from} WHERE ${where.join(' AND ')} ORDER BY ${alias}.created_at DESC LIMIT ? OFFSET ?`;
  const result = await db.prepare(query).bind(...args, LIMIT + 1, read.offset).all();
  const rows = result.results.slice(0, LIMIT);
  return { rows, nextOffset: result.results.length > LIMIT ? read.offset + LIMIT : null };
}

async function contracts(db, clientId, staff, read) {
  const target = staff ? read.filter : clientId;
  if (!target) return null;
  const result = await db.prepare(`SELECT id, kind, display_name, billing_type, contract_rate_bani,
      manager_name, manager_email, manager_phone, contract_reference, contract_details, updated_at
    FROM clients WHERE id = ? AND deleted_at IS NULL LIMIT 1`).bind(target).all();
  const row = result.results[0];
  if (!row) return { rows: [] };
  if (!row.billing_type && row.contract_rate_bani === null && !row.manager_name && !row.manager_email &&
      !row.manager_phone && !row.contract_reference && !row.contract_details) return { rows: [] };
  return { rows: [row] };
}

async function overview(db, session) {
  const staff = isStaff(session);
  const clientId = staff ? null : await clientForUser(db, session.user.id);
  if (!staff && !clientId) return null;
  let unread;
  if (staff) unread = await db.prepare(`SELECT COUNT(*) AS n FROM messages m LEFT JOIN "user" u ON u.id=m.sender_user_id
    WHERE m.deleted_at IS NULL AND m.read_at IS NULL AND COALESCE(u.role,'user') <> 'admin'`).all();
  else unread = await db.prepare(`SELECT COUNT(*) AS n FROM messages m JOIN "user" u ON u.id=m.sender_user_id
    WHERE m.client_id=? AND m.deleted_at IS NULL AND m.read_at IS NULL AND u.role='admin'`).bind(clientId).all();
  let nextAppointment = null;
  if (!staff) {
    const result = await db.prepare(`SELECT a.id,a.starts_at,a.ends_at,a.status,l.label AS location_name,l.address AS location_address
      FROM appointments a LEFT JOIN locations l ON l.id=a.location_id AND l.client_id=a.client_id
      WHERE a.client_id=? AND a.deleted_at IS NULL AND a.status NOT IN ('cancelled','completed') AND a.ends_at >= ?
      ORDER BY a.starts_at LIMIT 1`).bind(clientId, new Date().toISOString()).all();
    nextAppointment = result.results[0] || null;
  }
  return { unreadMessages: Number(unread.results[0]?.n || 0), nextAppointment };
}

async function markNotificationsRead(db, session, data) {
  const staff = isStaff(session);
  if (!data || !Array.isArray(data.ids) || !data.ids.length || data.ids.length > 100 || !data.ids.every(id)) return false;
  if (new Set(data.ids).size !== data.ids.length) return false;
  const clientId = staff ? (id(data.client_id) ? data.client_id : null) : await clientForUser(db, session.user.id);
  if (!clientId) return false;
  const placeholders = data.ids.map(() => '?').join(',');
  if (staff) {
    const result = await db.prepare(`UPDATE messages SET read_at = COALESCE(read_at,?) WHERE client_id=? AND id IN (${placeholders})
      AND deleted_at IS NULL AND sender_user_id IN (SELECT id FROM "user" WHERE role <> 'admin')`)
      .bind(new Date().toISOString(), clientId, ...data.ids).run();
    return true;
  }
  await db.prepare(`UPDATE messages SET read_at = COALESCE(read_at,?) WHERE client_id=? AND id IN (${placeholders})
    AND deleted_at IS NULL AND sender_user_id IN (SELECT id FROM "user" WHERE role='admin')`)
    .bind(new Date().toISOString(), clientId, ...data.ids).run();
  return true;
}

export async function handleApi(request, { db, auth }) {
  if (!allowedOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await sessionFor(request, auth);
  if (!session) return error(401, 'not_authenticated');
  const staff = isStaff(session);
  if (staff && !staffReady(session)) return error(403, 'two_factor_required');
  if (!staff && await mustChangePassword(db, session.user.id)) {
    if (new URL(request.url).pathname !== '/api/password') return error(403, 'password_change_required');
  }
  const url = new URL(request.url);
  const path = url.pathname.slice('/api/'.length).replace(/^\/+|\/+$/g, '');
  const [name, recordId] = path.split('/');

  if (request.method === 'GET' && name === 'me') {
    const clientId = staff ? null : await clientForUser(db, session.user.id);
    if (!staff && !clientId) return error(401, 'not_authenticated');
    return json({ user: { id: session.user.id, name: session.user.name, role: session.user.role },
      staff, twoFactorRequired: staff && !session.user.twoFactorEnabled, clientId });
  }
  if (request.method === 'GET' && name === 'overview') {
    const data = await overview(db, session);
    return data ? json(data) : error(401, 'not_authenticated');
  }
  if (request.method === 'POST' && name === 'notifications' && recordId === 'read') {
    const data = await request.json().catch(() => null);
    return await markNotificationsRead(db, session, data) ? json({ ok: true }) : error(staff ? 400 : 403, 'invalid_notification_scope');
  }
  if (request.method === 'GET' && name === 'contracts') {
    const read = parseRead(url, staff);
    if (!read) return error(400, 'invalid_filter');
    const clientId = staff ? null : await clientForUser(db, session.user.id);
    if (!staff && !clientId) return error(401, 'not_authenticated');
    const data = await contracts(db, clientId, staff, read);
    return data ? json(data) : error(400, 'client_required');
  }
  if (request.method === 'GET' && (Object.hasOwn(lists, name) || Object.hasOwn(staffLists, name))) {
    const read = parseRead(url, staff);
    if (!read) return error(400, 'invalid_filter');
    const clientId = staff ? null : await clientForUser(db, session.user.id);
    if (!staff && !clientId) return error(401, 'not_authenticated');
    const data = await listRows(db, name, clientId, staff, read);
    return data ? json(data) : error(403, 'staff_only');
  }
  if (request.method === 'POST' && name === 'password' && !recordId) {
    const data = await request.json().catch(() => null);
    const result = await changeInitialPassword(db, auth, session, data);
    return result.error ? error(result.status, result.error) : json({ ok: true }, result.status);
  }
  if (staff && request.method === 'POST' && name === 'accounts' && !recordId) {
    const data = await request.json().catch(() => null);
    const result = await createClientUser(db, auth, data, session.user.id);
    return result.error ? error(result.status, result.error) : json({ id: result.id }, result.status);
  }
  if (staff && request.method === 'POST' && Object.hasOwn(staffLists, name)) {
    const data = await request.json().catch(() => null);
    const result = await createStaffRecord(db, name, data, session.user.id);
    return result.error ? error(result.status, result.error) : json({ id: result.id }, result.status);
  }
  if (staff && request.method === 'POST' && Object.hasOwn(lists, name)) {
    const data = await request.json().catch(() => null);
    const result = await commitRecord(db, name, data, session.user.id);
    return result.error ? error(result.status, result.error) : json({ id: result.id }, result.status);
  }
  if (staff && recordId && ['PATCH', 'DELETE'].includes(request.method)) {
    const data = request.method === 'DELETE' ? null : await request.json().catch(() => undefined);
    const result = await changeStaffRecord(db, name, recordId, data, session.user.id);
    return result.error ? error(result.status, result.error) : result.status === 204 ? json({ ok: true }) : json({ id: result.id });
  }
  return error(staff ? 404 : 403, staff ? 'not_found' : 'staff_only');
}
