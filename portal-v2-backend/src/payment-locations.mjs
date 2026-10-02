// Validate a snapshot of selected locations within the payment owner.
// Chunk bind parameters so selection also works within D1's query limits.
export async function validateLocations(db, ids, clientId, paymentId = null) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 ||
      ids.some(id => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) ||
      new Set(ids).size !== ids.length) return false;
  for (let start = 0; start < ids.length; start += 50) {
    const chunk = ids.slice(start, start + 50);
    const rows = await db.prepare(`SELECT l.id FROM locations l WHERE l.client_id = ? AND l.id IN (${chunk.map(() => '?').join(',')}) AND ((l.deleted_at IS NULL AND l.active = 1) OR EXISTS (SELECT 1 FROM payment_locations pl WHERE pl.payment_id = ? AND pl.client_id = l.client_id AND pl.location_id = l.id))`)
      .bind(clientId, ...chunk, paymentId).all();
    if (rows.results.length !== chunk.length) return false;
  }
  return true;
}
export function locationInserts(db, paymentId, clientId, ids) {
  const statements = [];
  for (let start = 0; start < ids.length; start += 30) {
    const chunk = ids.slice(start, start + 30);
    statements.push(db.prepare(`INSERT INTO payment_locations (payment_id, client_id, location_id) VALUES ${chunk.map(() => '(?, ?, ?)').join(',')}`)
      .bind(...chunk.flatMap(id => [paymentId, clientId, id])));
  }
  return statements;
}
export async function jobLocations(db, jobId, clientId) {
  const rows = await db.prepare('SELECT a.location_id FROM jobs j JOIN appointments a ON a.id = j.appointment_id AND a.client_id = j.client_id WHERE j.id = ? AND j.client_id = ?')
    .bind(jobId, clientId).all();
  return rows.results.map(row => row.location_id);
}
