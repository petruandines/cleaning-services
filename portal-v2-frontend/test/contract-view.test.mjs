import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleContractDetails } from '../contract-view.mjs';

test('only populated optional client-visible contract fields are shown', () => {
  assert.deepEqual(visibleContractDetails({}), []);
  assert.deepEqual(visibleContractDetails({ billing_type: null, manager_email: 'a@example.test',
    manager_phone: '', contract_details: null, internal_note: 'secret' }), [
    { key: 'manager_email', label: 'E-mail manager', value: 'a@example.test' },
  ]);
  assert.deepEqual(visibleContractDetails({ billing_type: 'hourly', contract_rate_bani: 45000 })
    .map(item => item.label), ['Tip tarif', 'Tarif pe oră']);
});
