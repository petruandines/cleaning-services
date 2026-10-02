const zone = 'Europe/Bucharest';
const dayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: zone,
  year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('ro-RO', { timeZone: zone,
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function groupAppointments(rows) {
  const groups = [];
  const ordered = [...rows].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  for (const row of ordered) {
    const date = new Date(row.starts_at);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? dayKey.format(date) : 'unknown';
    if (groups.at(-1)?.key !== key) {
      const label = valid ? dayLabel.format(date) : 'Dată neprecizată';
      groups.push({ key, label: label.charAt(0).toLocaleUpperCase('ro-RO') + label.slice(1), rows: [] });
    }
    groups.at(-1).rows.push(row);
  }
  return groups;
}

const tones = {
  appointments: { draft: 'violet', requested: 'amber', confirmed: 'green', in_progress: 'blue',
    completed: 'slate', cancelled: 'rose' },
  payments: { pending: 'amber', confirmed: 'slate', reversed: 'rose' },
};

export function statusTone(section, status) {
  return tones[section]?.[status] || '';
}

export function isMuted(section, status) {
  return (section === 'appointments' && status === 'completed') ||
    (section === 'payments' && status === 'confirmed');
}
