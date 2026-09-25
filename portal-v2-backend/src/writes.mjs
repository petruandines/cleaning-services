// All columns and SQL statements are fixed here. The browser supplies values,
// never SQL fragments or record IDs. D1 batch commits record + audit atomically.
const bad = code => ({ status: 400, error: code });
const text = (value, max, required = true) => {
  if (value === undefined || value === null || value === '') return required ? undefined : null;
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max) return undefined;
  return value.trim();
};
const money = (value, required = false, positive = false) => {
  if ((value === undefined || value === null) && !required) return null;
  return Number.isSafeInteger(value) && value >= (positive ? 1 : 0) && value <= 1000000000 ? value : undefined;
};
const time = value => typeof value === 'string' && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value ? value : undefined;
const choice = (value, allowed, fallback) => value === undefined && fallback ? fallback : allowed.includes(value) ? value : undefined;
const clean = (data, allowed) => data && typeof data === 'object' && !Array.isArray(data) &&
  Object.keys(data).every(key => allowed.includes(key));
const exists = async (db, table, id, clientId) => {
  // `table` is chosen solely from literal call sites below.
  const sql = `SELECT id FROM ${table} WHERE id = ?${clientId ? ' AND client_id = ?' : ''} LIMIT 1`;
  return !!(await db.prepare(sql).bind(...(clientId ? [id, clientId] : [id])).all()).results.length;
};

export async function commitRecord(db, { sql, values, actor, clientId, entity, id, at }) {
  await db.batch([
    db.prepare(sql).bind(...values),
    db.prepare('INSERT INTO audit_events (id, actor_user_id, client_id, action, entity_type, entity_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), actor, clientId, 'create', entity, id, at),
  ]);
}

export async function createStaffRecord(db, name, data, actor) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  let sql, values, clientId;
  if (name === 'clients') {
    if (!clean(data, ['kind', 'display_name', 'email', 'phone', 'company_name', 'cui'])) return bad('invalid_fields');
    const kind = choice(data.kind, ['PF', 'PJ']);
    const display = text(data.display_name, 160);
    const email = text(data.email, 254, false);
    const phone = text(data.phone, 40, false);
    const company = text(data.company_name, 160, false);
    const cui = text(data.cui, 30, false);
    if (!kind || !display || [email, phone, company, cui].includes(undefined) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return bad('invalid_client');
    clientId = id;
    sql = 'INSERT INTO clients (id, kind, display_name, email, phone, company_name, cui, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    values = [id, kind, display, email, phone, company, cui, now, now];
  } else {
    const allowed = {
      locations: ['client_id', 'label', 'address', 'city', 'county', 'contact_name', 'contact_phone', 'contact_email'],
      appointments: ['client_id', 'location_id', 'starts_at', 'ends_at', 'status', 'client_note', 'estimated_cost_bani'],
      jobs: ['client_id', 'appointment_id', 'service_name', 'description', 'status', 'price_bani'],
      payments: ['client_id', 'job_id', 'amount_bani', 'status', 'recorded_at', 'note'],
      messages: ['client_id', 'body'],
    };
    if (!Object.hasOwn(allowed, name) || !clean(data, allowed[name])) return bad('invalid_fields');
    clientId = text(data.client_id, 100);
    if (!clientId) return bad('invalid_client_id');
    if (!await exists(db, 'clients', clientId)) return { status: 404, error: 'client_not_found' };

    if (name === 'locations') {
      const label = text(data.label, 160), address = text(data.address, 300);
      const city = text(data.city, 120), county = text(data.county, 120);
      const contactName = text(data.contact_name, 160, false);
      const contactPhone = text(data.contact_phone, 40, false);
      const contactEmail = text(data.contact_email, 254, false);
      if ([label, address, city, county, contactName, contactPhone, contactEmail].includes(undefined) ||
        (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) return bad('invalid_location');
      sql = 'INSERT INTO locations (id, client_id, label, address, city, county, contact_name, contact_phone, contact_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
      values = [id, clientId, label, address, city, county, contactName, contactPhone, contactEmail, now, now];
    } else if (name === 'appointments') {
      const location = text(data.location_id, 100);
      const start = time(data.starts_at), end = time(data.ends_at);
      const status = choice(data.status, ['requested', 'confirmed', 'in_progress', 'completed', 'cancelled'], 'confirmed');
      const note = text(data.client_note, 2000, false);
      const cost = money(data.estimated_cost_bani);
      if (!location || !start || !end || end <= start || !status || note === undefined || cost === undefined) return bad('invalid_appointment');
      if (!await exists(db, 'locations', location, clientId)) return { status: 400, error: 'location_client_mismatch' };
      sql = 'INSERT INTO appointments (id, client_id, location_id, starts_at, ends_at, status, client_note, estimated_cost_bani, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
      values = [id, clientId, location, start, end, status, note, cost, now, now];
    } else if (name === 'jobs') {
      const appointment = data.appointment_id === undefined || data.appointment_id === null ? null : text(data.appointment_id, 100);
      const service = text(data.service_name, 160), description = text(data.description, 2000, false);
      const status = choice(data.status, ['planned', 'in_progress', 'completed', 'cancelled'], 'planned');
      const price = money(data.price_bani);
      if (appointment === undefined || !service || description === undefined || !status || price === undefined) return bad('invalid_job');
      if (appointment && !await exists(db, 'appointments', appointment, clientId)) return { status: 400, error: 'appointment_client_mismatch' };
      sql = 'INSERT INTO jobs (id, client_id, appointment_id, service_name, description, status, price_bani, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
      values = [id, clientId, appointment, service, description, status, price, now, now];
    } else if (name === 'payments') {
      const job = text(data.job_id, 100), amount = money(data.amount_bani, true, true);
      const status = choice(data.status, ['pending', 'confirmed', 'reversed'], 'pending');
      const recorded = data.recorded_at === undefined || data.recorded_at === null ?
        (status === 'confirmed' ? now : null) : time(data.recorded_at);
      const note = text(data.note, 1000, false);
      if (!job || amount === undefined || !status || recorded === undefined || note === undefined) return bad('invalid_payment');
      if (!await exists(db, 'jobs', job, clientId)) return { status: 400, error: 'job_client_mismatch' };
      sql = 'INSERT INTO payments (id, client_id, job_id, amount_bani, status, recorded_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
      values = [id, clientId, job, amount, status, recorded, note, now];
    } else {
      const body = text(data.body, 4000);
      if (!body) return bad('invalid_message');
      sql = 'INSERT INTO messages (id, client_id, sender_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)';
      values = [id, clientId, actor, body, now];
    }
  }
  await commitRecord(db, { sql, values, actor, clientId, entity: name, id, at: now });
  return { status: 201, id };
}
