import test from 'node:test';
import assert from 'node:assert/strict';
import { groupAppointments, isMuted, statusTone } from '../appointment-view.mjs';

test('appointments group by Bucharest day in descending order, including near UTC midnight', () => {
  const rows = [
    { id: 'morning', starts_at: '2026-09-28T06:00:00Z' },
    { id: 'near-midnight', starts_at: '2026-09-27T22:30:00Z' },
    { id: 'older', starts_at: '2026-09-26T14:00:00Z' },
  ];
  const groups = groupAppointments(rows);
  assert.deepEqual(groups.map(group => group.key), ['2026-09-28', '2026-09-26']);
  assert.deepEqual(groups[0].rows.map(row => row.id), ['morning', 'near-midnight']);
  assert.match(groups[0].label.toLocaleLowerCase('ro-RO'), /luni.*28 septembrie/);
  assert.deepEqual(rows.map(row => row.id), ['morning', 'near-midnight', 'older']);
});

test('payment confirmation and completed appointments are visibly muted without muting pending records', () => {
  assert.equal(statusTone('appointments', 'requested'), 'amber');
  assert.equal(statusTone('appointments', 'in_progress'), 'blue');
  assert.equal(statusTone('payments', 'confirmed'), 'slate');
  assert.equal(isMuted('appointments', 'completed'), true);
  assert.equal(isMuted('payments', 'confirmed'), true);
  assert.equal(isMuted('payments', 'pending'), false);
  assert.equal(statusTone('payments', 'unrecognized'), '');
});
