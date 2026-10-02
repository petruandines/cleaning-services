const details = [
  ['billing_type', 'Tip tarif'],
  ['contract_rate_bani', 'Tarif'],
  ['manager_name', 'Administrator / manager'],
  ['manager_email', 'E-mail manager'],
  ['manager_phone', 'Telefon manager'],
  ['contract_reference', 'Referință contract'],
  ['contract_details', 'Alte informații contractuale'],
];

export function visibleContractDetails(row) {
  return details.filter(([key]) => row[key] !== null && row[key] !== undefined && row[key] !== '')
    .map(([key, label]) => ({ key, label: key === 'contract_rate_bani' ?
      row.billing_type === 'hourly' ? 'Tarif pe oră' : 'Tarif fix' : label, value: row[key] }));
}
