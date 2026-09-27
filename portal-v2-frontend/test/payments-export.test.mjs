import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentsWorkbook, paymentsInPeriod } from '../payments-export.mjs';

const rows = [
  { id: 'pending', created_at: '2026-09-30T22:30:00Z', recorded_at: null,
    amount_bani: 45000, status: 'pending', note: '=HYPERLINK("unsafe")', location_name: 'Acasă' },
  { id: 'confirmed', created_at: '2026-09-20T11:00:00Z', recorded_at: '2026-09-27T09:00:00Z',
    amount_bani: 12345, status: 'confirmed', note: 'Serviciu <bun> & sigur' },
];

test('payment period uses recorded date or creation date, inclusive in Bucharest', () => {
  assert.deepEqual(paymentsInPeriod(rows, '2026-10-01', '2026-10-01').map(row => row.id), ['pending']);
  assert.deepEqual(paymentsInPeriod(rows, '2026-09-27', '2026-09-30').map(row => row.id), ['confirmed']);
  assert.equal(paymentsInPeriod(rows).length, 2);
  assert.throws(() => paymentsInPeriod(rows, '2026-10-02', '2026-10-01'), /interval/);
  assert.throws(() => paymentsInPeriod([...rows, { recorded_at: '2026-09-27T09:00:00Z' }]),
    /actualizarea Workerului/);
});

test('workbook is a ZIP package with amounts as numbers and notes as escaped text', () => {
  const bytes = createPaymentsWorkbook(rows);
  const decoder = new TextDecoder();
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(bytes.buffer).getUint32(bytes.length - 22, true), 0x06054b50);
  const file = decoder.decode(bytes);
  assert.match(file, /<c r="D2" s="1"><v>450<\/v><\/c>/);
  assert.match(file, /<c r="D3" s="1"><v>123\.45<\/v><\/c>/);
  assert.match(file, /<t xml:space="preserve">=HYPERLINK\(&quot;unsafe&quot;\)<\/t>/);
  assert.match(file, /Serviciu &lt;bun&gt; &amp; sigur/);
  assert.doesNotMatch(file, /<f>/);
  assert.throws(() => createPaymentsWorkbook([{ ...rows[0], amount_bani: 12.5 }]), /sumă invalidă/);
});
