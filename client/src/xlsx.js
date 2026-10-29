// Minimal .xlsx reader for stock imports — the first sheet's cell text, no library. An .xlsx is a zip of XML
// files; the browser's own DecompressionStream inflates it and DOMParser reads the XML. Returns rows of strings.
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function unzip(buf) {
  const b = new Uint8Array(buf);
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i -= 1) if (u32(b, i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('That isn\'t an Excel (.xlsx) file.');
  const count = u16(b, end + 10);
  let p = u32(b, end + 16);
  const files = new Map();
  for (let n = 0; n < count; n += 1) {
    if (u32(b, p) !== 0x02014b50) throw new Error('This Excel file looks damaged.');
    const method = u16(b, p + 10); const size = u32(b, p + 20);
    const nameLen = u16(b, p + 28); const extra = u16(b, p + 30); const comment = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method, size, local });
    p += 46 + nameLen + extra + comment;
  }
  return async (name) => {
    const f = files.get(name);
    if (!f) return null;
    const start = f.local + 30 + u16(b, f.local + 26) + u16(b, f.local + 28);
    const data = b.subarray(start, start + f.size);
    if (f.method === 0) return new TextDecoder().decode(data);
    if (f.method !== 8) throw new Error('This Excel file uses a format we can\'t read — save it as CSV instead.');
    const out = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(out).text();
  };
}

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const colIndex = (ref) => { let n = 0; for (const ch of String(ref).replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const text = (el) => [...el.getElementsByTagName('t')].map((t) => t.textContent).join('');

export async function readXlsx(file, maxRows = 5000) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can\'t open Excel files — save it as CSV instead.');
  const get = await unzip(await file.arrayBuffer());
  // First sheet in workbook order → its file via the workbook's relationships.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await get('xl/workbook.xml'); const rels = await get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = xml(wb).getElementsByTagName('sheet')[0];
    const rid = first?.getAttribute('r:id') || first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = [...xml(rels).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const shared = await get('xl/sharedStrings.xml');
  const strings = shared ? [...xml(shared).getElementsByTagName('si')].map(text) : [];
  const sheet = await get(sheetPath);
  if (!sheet) throw new Error('No sheet found in this Excel file.');
  const rows = [];
  for (const row of xml(sheet).getElementsByTagName('row')) {
    if (rows.length >= maxRows) break;
    const cells = [];
    for (const c of row.getElementsByTagName('c')) {
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const val = t === 's' ? strings[Number(v)] ?? '' : t === 'inlineStr' ? text(c) : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
      cells[colIndex(c.getAttribute('r'))] = String(val).replace(/[\t\r\n]+/g, ' ').trim();
    }
    if (cells.some(Boolean)) rows.push(Array.from(cells, (x) => x ?? ''));
  }
  return rows;
}

// Excel keeps dates as day numbers (1 = 1900-01-01, with Excel's 1900 leap-year bug) → YYYY-MM-DD.
export function excelSerialDate(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(n)) * 86400000);
  return d.toISOString().slice(0, 10);
}
