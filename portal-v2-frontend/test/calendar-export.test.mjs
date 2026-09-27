import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages, selectCalendarRows, createCalendar } from '../calendar-export.mjs';

test('export fetches every authenticated page and keeps the selected client scope', async () => {
  const calls = [];
  const rows = await fetchAllPages(async path => {
    const url = new URL(path, 'https://example.org');
    calls.push(url.searchParams.toString());
    return url.searchParams.get('offset') === '0' ?
      { rows: [{ id: 'first' }], nextOffset: 30 } :
      { rows: [{ id: 'last' }], nextOffset: null };
  }, 'appointments', 'client123');
  assert.deepEqual(rows.map(row => row.id), ['first', 'last']);
  assert.deepEqual(calls, ['offset=0&client_id=client123', 'offset=30&client_id=client123']);
  await assert.rejects(fetchAllPages(async () => ({ rows: [{ id: '1' }], nextOffset: 0 }),
    'appointments'), /Paginarea/);
});

test('calendar selection handles future dates, location, completed and cancelled appointments', () => {
  const rows = [
    { location_id: 'a', starts_at: '2026-10-01T10:00:00Z', status: 'confirmed' },
    { location_id: 'a', starts_at: '2026-10-01T10:00:00Z', status: 'cancelled' },
    { location_id: 'a', starts_at: '2026-09-01T10:00:00Z', status: 'completed' },
    { location_id: 'b', starts_at: '2026-10-01T10:00:00Z', status: 'requested' },
  ];
  const now = new Date('2026-09-27T10:00:00Z');
  assert.equal(selectCalendarRows(rows, { locationId: 'a', futureOnly: true, now }).length, 1);
  assert.equal(selectCalendarRows(rows, { locationId: 'a', now }).length, 3);
  assert.equal(selectCalendarRows(rows, { futureOnly: true, now }).length, 2);
});

test('iCalendar uses UTC, escapes user text and folds long UTF-8 lines', () => {
  const event = { id: 'a-1', starts_at: '2026-09-28T06:00:00Z',
    ends_at: '2026-09-28T08:00:00Z', status: 'requested',
    location_name: 'Șoseaua ' + 'ț'.repeat(90), location_address: 'A, B; C',
    client_note: 'linie 1\nlinie 2\\x' };
  const output = createCalendar([event], new Date('2026-09-27T20:00:00Z'));
  assert.match(output, /DTSTART:20260928T060000Z\r\n/);
  assert.match(output, /STATUS:TENTATIVE\r\n/);
  assert.match(output, /DESCRIPTION:linie 1\\nlinie 2\\\\x\r\n/);
  assert.match(output, /LOCATION:Șoseaua/);
  assert.equal(output.endsWith('END:VCALENDAR\r\n'), true);
  const encoder = new TextEncoder();
  for (const line of output.split('\r\n')) assert.ok(encoder.encode(line).length <= 75);
  assert.match(output.replace(/\r\n /g, ''), /A\\, B\\; C/);
});
