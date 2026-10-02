const encoder = new TextEncoder();
const bucharestDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest',
  year: 'numeric', month: '2-digit', day: '2-digit' });
const bucharestTime = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function paymentDate(row) {
  if (!row.created_at) throw new Error('Exportul plăților necesită actualizarea Workerului.');
  const date = new Date(row.recorded_at || row.created_at);
  if (Number.isNaN(date.getTime())) throw new Error('O plată are o dată invalidă.');
  return date;
}

export function paymentsInPeriod(rows, start = '', end = '') {
  if ((start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) ||
      (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) || (start && end && start > end))
    throw new Error('Alege un interval de date valid.');
  // Check *all* rows before filtering so an old API cannot silently omit undated payments.
  const dated = rows.map(row => ({ row, day: bucharestDay.format(paymentDate(row)) }));
  return dated.filter(({ day }) => (!start || day >= start) && (!end || day <= end))
    .map(({ row }) => row);
}

function xml(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function col(number) {
  let name = '';
  for (let index = number + 1; index; index = Math.floor((index - 1) / 26))
    name = String.fromCharCode(65 + (index - 1) % 26) + name;
  return name;
}

function stringCell(value, address) {
  // inlineStr keeps even user-supplied formulas as text, never executable formulas.
  return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function sheet(rows) {
  const titles = ['Data plății', 'Locație', 'Intervenție', 'Sumă (lei)', 'Stare',
    'Descriere', 'Serviciu', 'Link factură', 'ID plată'];
  const heading = '<row r="1">' + titles.map((title, i) => stringCell(title, col(i) + '1')).join('') + '</row>';
  const body = rows.map((row, index) => {
    const values = [bucharestTime.format(paymentDate(row)), row.location_name || '',
      row.appointment_starts_at ? bucharestTime.format(new Date(row.appointment_starts_at)) : '',
      Number(row.amount_bani) / 100,
      { pending: 'În așteptare', confirmed: 'Confirmată', reversed: 'Anulată' }[row.status] || row.status,
      row.note || '', row.service_name || '', row.invoice_url || '', row.id || ''];
    if (!Number.isSafeInteger(row.amount_bani) || !Number.isFinite(values[3]))
      throw new Error('O plată are o sumă invalidă.');
    const number = index + 2;
    return `<row r="${number}">` + values.map((value, i) => i === 3 ?
      `<c r="${col(i)}${number}" s="1"><v>${value}</v></c>` :
      stringCell(value, col(i) + number)).join('') + '</row>';
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:I${rows.length + 1}"/><sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews><cols>` +
    [22, 25, 22, 17, 18, 56, 26, 45, 39].map((width, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('') +
    `</cols><sheetData>${heading}${body}</sheetData><autoFilter ref="A1:I${rows.length + 1}"/></worksheet>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const chunks = [];
  const directory = [];
  let offset = 0;
  for (const [name, body] of entries) {
    const filename = encoder.encode(name);
    const data = encoder.encode(body);
    const crc = crc32(data);
    const local = new Uint8Array(30 + filename.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // UTF-8 names, stored without compression.
    l.setUint32(14, crc, true); l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true); l.setUint16(26, filename.length, true);
    local.set(filename, 30);
    chunks.push(local, data);
    const central = new Uint8Array(46 + filename.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true);
    c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true); c.setUint16(28, filename.length, true);
    c.setUint32(42, offset, true); central.set(filename, 46);
    directory.push(central);
    offset += local.length + data.length;
  }
  const centralSize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...chunks, ...directory, end]) { result.set(part, cursor); cursor += part.length; }
  return result;
}

export function createPaymentsWorkbook(rows) {
  const types = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Plăți" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;lei&quot;"/></numFmts>` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>` +
    `<cellXfs count="2"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0" applyNumberFormat="1"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;
  return zip([
    ['[Content_Types].xml', types], ['_rels/.rels', relationships],
    ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', workbookRels],
    ['xl/styles.xml', styles], ['xl/worksheets/sheet1.xml', sheet(rows)],
  ]);
}
