// Staff-only changes. SQL identifiers come exclusively from literal maps below.
// The client_id of an existing record is immutable; links stay in that scope.
const definitions = Object.freeze({
  clients: ['kind', 'display_name', 'email', 'phone', 'company_name', 'cui', 'status'],
  locations: ['label', 'address', 'city', 'county', 'contact_name', 'contact_phone', 'contact_email'],
  appointments: ['location_id', 'starts_at', 'ends_at', 'status', 'client_note', 'estimated_cost_bani'],
  jobs: ['appointment_id', 'service_name', 'description', 'status', 'price_bani'],
  payments: ['job_id', 'amount_bani', 'status', 'recorded_at', 'note'],
  messages: ['body'],
});
const dependencies = Object.freeze({
  clients: [['locations', 'client_id'], ['appointments', 'client_id'], ['jobs', 'client_id'],
    ['payments', 'client_id'], ['messages', 'client_id']],
  locations: [['appointments', 'location_id']],
  appointments: [['jobs', 'appointment_id']],
  jobs: [['payments', 'job_id']], payments: [], messages: [],
});
const fail = (status, error) => ({ status, error });
const txt = (v, max, required = false) => {
  if (v === undefined || v === null || v === '') return required ? undefined : null;
  return typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : undefined;
};
const enumValue = (v, list) => list.includes(v) ? v : undefined;
const amount = (v, required = false) =>
  (v === undefined || v === null || v === '') && !required ? null :
    Number.isSafeInteger(v) && v >= (required ? 1 : 0) && v <= 1000000000 ? v : undefined;
const timestamp = v => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v ? v : undefined;
const email = v => v === null || (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));

async function exists(db, table, id, clientId) {
  return !!(await db.prepare(`SELECT id FROM ${table} WHERE id = ? AND client_id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(id, clientId).all()).results.length;
}

export async function changeStaffRecord(db, name, id, data, actor) {
  if (!Object.hasOwn(definitions, name) || !/^[\w-]{1,100}$/.test(id)) return fail(404, 'not_found');
  const rows = await db.prepare(`SELECT id, ${name === 'clients' ? 'id' : 'client_id'} AS client_id FROM ${name} WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(id).all();
  const record = rows.results[0];
  if (!record) return fail(404, 'not_found');
  const clientId = record.client_id;
  const now = new Date().toISOString();

  if (data === null) {
    for (const [dependent, column] of dependencies[name]) {
      const found = await db.prepare(`SELECT id FROM ${dependent} WHERE ${column} = ? AND deleted_at IS NULL LIMIT 1`).bind(id).all();
      if (found.results.length) return fail(409, 'has_related_records');
    }
    const stamp = ['clients', 'locations', 'appointments', 'jobs'].includes(name) ? ', updated_at = ?' : '';
    const operations = [db.prepare(`UPDATE ${name} SET deleted_at = ?${stamp}${name === 'clients' ? ', status = ?' :
      name === 'locations' ? ', active = 0' : ''} WHERE id = ? AND deleted_at IS NULL`)
      .bind(...(name === 'clients' ? [now, now, 'inactive', id] : stamp ? [now, now, id] : [now, id]))];
    if (name === 'clients') operations.push(db.prepare('DELETE FROM client_users WHERE client_id = ?').bind(id));
    operations.push(db.prepare('INSERT INTO audit_events (id, actor_user_id, client_id, action, entity_type, entity_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), actor, clientId, 'delete', name, id, now));
    await db.batch(operations);
    return { status: 204 };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length ||
    !Object.keys(data).every(key => definitions[name].includes(key))) return fail(400, 'invalid_fields');
  const values = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'kind') values[key] = enumValue(value, ['PF', 'PJ']);
    else if (key === 'status') values[key] = enumValue(value, name === 'clients' ? ['active', 'inactive'] :
      name === 'appointments' ? ['requested', 'confirmed', 'in_progress', 'completed', 'cancelled'] :
        name === 'jobs' ? ['planned', 'in_progress', 'completed', 'cancelled'] : ['pending', 'confirmed', 'reversed']);
    else if (key.endsWith('_bani')) values[key] = amount(value, key === 'amount_bani');
    else if (['starts_at', 'ends_at'].includes(key)) values[key] = timestamp(value);
    else if (key === 'recorded_at') values[key] = value ? timestamp(value) : null;
    else if (key.endsWith('_id')) values[key] = value === null || value === '' ? null : txt(value, 100, true);
    else values[key] = txt(value, ({ display_name: 160, label: 160, address: 300, city: 120,
      county: 120, contact_name: 160, contact_phone: 40, contact_email: 254, email: 254,
      phone: 40, company_name: 160, cui: 30, service_name: 160, description: 2000,
      client_note: 2000, note: 1000, body: 4000 })[key],
    ['display_name', 'label', 'address', 'city', 'county', 'service_name', 'body'].includes(key));
    if (values[key] === undefined) return fail(400, 'invalid_fields');
    if (['email', 'contact_email'].includes(key) && !email(values[key])) return fail(400, 'invalid_email');
  }
  if (name === 'appointments' && ((values.starts_at || values.ends_at) || values.location_id)) {
    const current = (await db.prepare('SELECT starts_at, ends_at, location_id FROM appointments WHERE id = ?').bind(id).all()).results[0];
    if ((values.ends_at || current.ends_at) <= (values.starts_at || current.starts_at)) return fail(400, 'invalid_dates');
  }
  const references = { appointments: ['locations', 'location_id'], jobs: ['appointments', 'appointment_id'],
    payments: ['jobs', 'job_id'] };
  if (Object.hasOwn(references, name)) {
    const [table, key] = references[name];
    if (Object.hasOwn(values, key) && (values[key] === null ? name !== 'jobs' :
      !await exists(db, table, values[key], clientId))) return fail(400, 'reference_client_mismatch');
  }
  const columns = Object.keys(values);
  const updated = name === 'payments' || name === 'messages' ? '' : ', updated_at = ?';
  const sql = `UPDATE ${name} SET ${columns.map(col => `${col} = ?`).join(', ')}${updated} WHERE id = ? AND deleted_at IS NULL`;
  const args = [...columns.map(col => values[col]), ...(updated ? [now] : []), id];
  await db.batch([
    db.prepare(sql).bind(...args),
    db.prepare('INSERT INTO audit_events (id, actor_user_id, client_id, action, entity_type, entity_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), actor, clientId, 'update', name, id, now),
  ]);
  return { status: 200, id };
}
