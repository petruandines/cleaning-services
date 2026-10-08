// Better Auth verifies the current password, hashes the new password, rate limits
// attempts and rotates/revokes sessions. This guard limits access to enrolled admins.
export async function guardAdminPassword(request, auth) {
  const fail = (status, error) => Response.json({ error }, { status });
  if (request.method !== 'POST') return fail(405, 'method_not_allowed');
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return fail(401, 'unauthorized');
  if (session.user.role !== 'admin' || session.user.twoFactorEnabled !== true)
    return fail(403, 'forbidden');
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return fail(415, 'json_required');
  const raw = await request.clone().text();
  if (raw.length > 4000) return fail(413, 'payload_too_large');
  let data;
  try { data = JSON.parse(raw); } catch { return fail(400, 'invalid_json'); }
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some(key => !['currentPassword', 'newPassword', 'revokeOtherSessions'].includes(key)) ||
      typeof data.currentPassword !== 'string' || !data.currentPassword || data.currentPassword.length > 128 ||
      typeof data.newPassword !== 'string' || data.newPassword.length < 12 || data.newPassword.length > 128 ||
      data.newPassword === data.currentPassword || data.revokeOtherSessions !== true)
    return fail(400, 'invalid_password');
  return null;
}
