export async function mustChangePassword(db, userId) {
  const result = await db.prepare('SELECT must_change_password FROM portal_accounts WHERE user_id = ? LIMIT 1').bind(userId).all();
  return result.results[0]?.must_change_password === 1;
}

export async function createClientUser({ db, auth, headers, actor, data }) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
    Object.keys(data).some(key => !['client_id', 'email', 'name', 'password', 'reactivate_existing'].includes(key)))
    return { status: 400, error: 'invalid_fields' };
  const clientId = data.client_id;
  const email = data.email?.trim().toLowerCase();
  const name = data.name?.trim();
  const password = data.password;
  if (typeof clientId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(clientId) ||
    typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof name !== 'string' || name.length < 1 || name.length > 160 ||
    typeof password !== 'string' || password.length < 12 || password.length > 128 ||
    (data.reactivate_existing !== undefined && data.reactivate_existing !== true))
    return { status: 400, error: 'invalid_account' };
  const client = await db.prepare("SELECT id FROM clients WHERE id = ? AND deleted_at IS NULL AND status = 'active' LIMIT 1").bind(clientId).all();
  if (!client.results.length) return { status: 404, error: 'client_not_found' };

  const matches = await db.prepare('SELECT id, role FROM "user" WHERE lower(email) = ? LIMIT 1').bind(email).all();
  const existing = matches.results[0];
  if (existing) {
    const linked = await db.prepare('SELECT client_id FROM client_users WHERE user_id = ? LIMIT 1').bind(existing.id).all();
    if (existing.role !== 'user' || linked.results.length) return { status: 409, error: 'account_already_linked' };
    if (!data.reactivate_existing) return { status: 409, error: 'archived_account_confirmation_required' };
    // An old session must not gain access to the new client. Revoke every
    // session before resetting the password and linking this orphaned user.
    try {
      await auth.api.revokeUserSessions({ headers, body: { userId: existing.id } });
      await auth.api.setUserPassword({ headers, body: { userId: existing.id, newPassword: password } });
    } catch { return { status: 500, error: 'account_reactivation_failed' }; }
    const at = new Date().toISOString();
    try {
      await db.batch([
        db.prepare('INSERT INTO client_users (user_id, client_id, created_at) VALUES (?, ?, ?)').bind(existing.id, clientId, at),
        db.prepare('INSERT INTO portal_accounts (user_id, must_change_password, created_at, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO UPDATE SET must_change_password = 1, updated_at = excluded.updated_at').bind(existing.id, at, at),
        db.prepare('UPDATE "user" SET name = ? WHERE id = ? AND role = ?').bind(name, existing.id, 'user'),
        db.prepare('INSERT INTO audit_events (id, actor_user_id, client_id, action, entity_type, entity_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), actor, clientId, 'reactivate', 'client_user', existing.id, at),
      ]);
    } catch { return { status: 500, error: 'account_link_failed' }; }
    return { status: 201, id: existing.id, reactivated: true };
  }
  if (data.reactivate_existing) return { status: 409, error: 'no_archived_account' };

  let userId;
  try {
    // The real admin session is passed explicitly; never call this plugin
    // without headers, because server-only calls can bypass user permissions.
    const created = await auth.api.createUser({
      headers, body: { email, name, password, role: 'user' },
    });
    userId = created.user.id;
  } catch (error) {
    if (error.status === 'BAD_REQUEST' || error.statusCode === 400) return { status: 409, error: 'account_exists_or_invalid' };
    throw error;
  }

  const at = new Date().toISOString();
  try {
    await db.batch([
      db.prepare('INSERT INTO client_users (user_id, client_id, created_at) VALUES (?, ?, ?)').bind(userId, clientId, at),
      db.prepare('INSERT INTO portal_accounts (user_id, must_change_password, created_at, updated_at) VALUES (?, 1, ?, ?)').bind(userId, at, at),
      db.prepare('INSERT INTO audit_events (id, actor_user_id, client_id, action, entity_type, entity_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), actor, clientId, 'create', 'client_user', userId, at),
    ]);
  } catch {
    // An auth account without a client link cannot read client records. Remove
    // it to allow a clean retry if the transactional association failed.
    try { await auth.api.removeUser({ headers, body: { userId } }); }
    catch { console.error('Client account cleanup failed after association error'); }
    return { status: 500, error: 'account_link_failed' };
  }
  return { status: 201, id: userId };
}

export async function changeInitialPassword({ db, auth, headers, userId, data }) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
    Object.keys(data).some(key => !['currentPassword', 'newPassword'].includes(key)))
    return { status: 400, error: 'invalid_fields' };
  if (typeof data.currentPassword !== 'string' || typeof data.newPassword !== 'string' ||
    data.newPassword.length < 12 || data.newPassword.length > 128 ||
    data.currentPassword === data.newPassword)
    return { status: 400, error: 'invalid_password' };
  if (!await mustChangePassword(db, userId)) return { status: 409, error: 'password_change_not_required' };
  let newToken;
  try {
    const response = await auth.api.changePassword({
      headers, body: { currentPassword: data.currentPassword, newPassword: data.newPassword,
        revokeOtherSessions: true }, asResponse: true,
    });
    if (!response.ok) return { status: 400, error: 'password_change_failed' };
    newToken = response.headers.get('set-auth-token');
    if (!newToken) throw new Error('No new bearer token after session rotation');
  } catch (error) {
    if (error.status === 'BAD_REQUEST' || error.statusCode === 400) return { status: 400, error: 'password_change_failed' };
    throw error;
  }
  const at = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE portal_accounts SET must_change_password = 0, updated_at = ? WHERE user_id = ?').bind(at, userId),
    db.prepare('INSERT INTO audit_events (id, actor_user_id, client_id, action, entity_type, entity_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, null, 'initial_password_changed', 'user', userId, at),
  ]);
  return { status: 200, token: newToken };
}
