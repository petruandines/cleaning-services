// Export only records returned by the authenticated API. Never export just the visible page.
export async function fetchAllPages(api, name, clientId = '', maxRows = 10000) {
  const rows = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({ offset: String(offset) });
    if (clientId) params.set('client_id', clientId);
    const result = await api(`/api/${name}?${params}`);
    if (!Array.isArray(result.rows)) throw new Error('Răspuns invalid la export.');
    rows.push(...result.rows);
    if (rows.length > maxRows) throw new Error('Exportul este prea mare. Contactează echipa pentru ajutor.');
    if (result.nextOffset === null) return rows;
    if (!Number.isSafeInteger(result.nextOffset) || result.nextOffset <= offset ||
        result.rows.length === 0) throw new Error('Paginarea exportului este invalidă.');
    offset = result.nextOffset;
  }
}

export function selectCalendarRows(rows, { locationId = '', futureOnly = false, now = new Date() } = {}) {
  const threshold = now.getTime();
  return rows.filter(row => (!locationId || row.location_id === locationId) &&
    (!futureOnly || (Date.parse(row.starts_at) >= threshold &&
      !['cancelled', 'completed'].includes(row.status))));
}

function escapeText(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function utc(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('O programare are o dată invalidă.');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Calendar lines are limited to 75 UTF-8 octets, without splitting a character.
function fold(line) {
  const encoder = new TextEncoder();
  const segments = [''];
  let length = 0;
  for (const character of line) {
    const width = encoder.encode(character).length;
    if (length + width > 75) { segments.push(' '); length = 1; }
    segments[segments.length - 1] += character;
    length += width;
  }
  return segments.join('\r\n');
}

export function createCalendar(rows, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Petru & Ines//Portal programari//RO',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Programări Petru & Inés',
  ];
  const stamp = utc(now);
  for (const row of rows) {
    if (!row.id || !row.starts_at || !row.ends_at) throw new Error('O programare nu poate fi exportată.');
    const location = [row.location_name, row.location_address].filter(Boolean).join(' · ');
    const summary = ['Intervenție Petru & Inés', row.client_name, row.location_name].filter(Boolean).join(' · ');
    const status = row.status === 'cancelled' ? 'CANCELLED' :
      ['requested', 'draft'].includes(row.status) ? 'TENTATIVE' : 'CONFIRMED';
    lines.push('BEGIN:VEVENT', `UID:${escapeText(row.id)}@petruandines.github.io`,
      `DTSTAMP:${stamp}`, `DTSTART:${utc(row.starts_at)}`, `DTEND:${utc(row.ends_at)}`,
      `SUMMARY:${escapeText(summary)}`, `STATUS:${status}`);
    if (location) lines.push(`LOCATION:${escapeText(location)}`);
    if (row.client_note) lines.push(`DESCRIPTION:${escapeText(row.client_note)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
