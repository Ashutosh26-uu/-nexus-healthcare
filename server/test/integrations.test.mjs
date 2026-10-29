// Software connectors (HMIS / LIS / billing keys, webhooks) and purchase orders sent to suppliers.
import http from 'node:http';
import crypto from 'node:crypto';
import * as lib from './lib.mjs';

const { check, demo } = lib;
const call = (m, p, t, b, key) => lib.call(m, p, t || key, b);
const HOOK = 4600 + Math.floor(Math.random() * 300);
const hookUrl = `http://localhost:${HOOK}/hook`;

// webhook receiver
const got = [];
const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { got.push({ h: req.headers, b }); res.end('ok'); }); }).listen(HOOK);

const hosp = await demo('hospital');
const lab = await demo('lab');
const path = await demo('pathologist');
const pharm = await demo('pharmacy');
const dist = await demo('distributor');
const doc = await demo('doctor');

// --- staff keys
let r = await call('POST', '/facility/integrations', hosp, { name: 'Test HMIS', webhookUrl: 'https://10.0.0.5/hook' });
check(r.s === 400 && /public/.test(r.j.error), 'webhook to a private address refused', r.j.error);
r = await call('POST', '/facility/integrations', hosp, { name: 'Test HMIS', webhookUrl: 'http://example.com/hook' });
check(r.s === 400, 'plain http webhook refused', r.j.error);
r = await call('POST', '/facility/integrations', hosp, { name: 'Test HMIS', webhookUrl: hookUrl });
check(r.s === 200 && /^sehatra_/.test(r.j.key) && r.j.webhookSecret, 'hospital creates an HMIS key (shown once)');
const hkey = r.j.key; const hid = r.j.id; const secret = r.j.webhookSecret;
r = await call('GET', '/facility/integrations', hosp);
check(r.s === 200 && r.j.kind === 'hmis' && !JSON.stringify(r.j).includes(hkey) && !JSON.stringify(r.j).includes('keyHash'), 'list never shows the key or its hash');
r = await call('POST', '/facility/integrations', lab, { name: 'LIS' });
check(r.s === 403, 'lab technician can’t connect software when the lab has a pathologist', r.j.error);
r = await call('POST', '/facility/integrations', path, { name: 'Analyser PC' });
check(r.s === 200, 'pathologist creates an LIS key');
const lkey = r.j.key;
r = await call('POST', '/facility/integrations', pharm, { name: 'Marg ERP' });
const bkey = r.j.key;
check(r.s === 200 && r.j.kind === 'billing', 'chemist creates a billing key');
r = await call('GET', '/facility/integrations', doc);
check(r.s === 403, 'doctors can’t');

// --- auth
r = await call('GET', '/integration/v1/me', null, null, 'sehatra_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
check(r.s === 401, 'made-up key refused');
r = await call('GET', '/integration/v1/beds', null, null, bkey);
check(r.s === 403, 'billing key can’t touch beds');
r = await call('GET', '/integration/v1/me', null, null, hkey);
check(r.s === 200 && r.j.kind === 'hmis', 'HMIS key works', r.j.facility?.name);

// --- HMIS
r = await call('GET', '/integration/v1/beds', null, null, hkey);
const bt = r.j.beds[0];
check(r.s === 200 && bt, 'beds pulled', `${r.j.beds.length} types`);
r = await call('PUT', '/integration/v1/beds', null, { beds: [{ type: bt.type, total: bt.total, occupied: Math.max(0, bt.total - 1) }, { type: 'spaceship', total: 3 }] }, hkey);
check(r.s === 200 && r.j.updated[0].free === 1 && r.j.errors.length === 1, 'beds synced; unknown type reported, not crashed');
const home = (await call('GET', '/hospital/home', hosp)).j;
check(home.beds.find((b) => b.type === bt.type).occupied === bt.total - 1, 'hospital portal shows the synced count');
r = await call('GET', '/integration/v1/referrals', null, null, hkey);
check(r.s === 200 && Array.isArray(r.j.referrals), 'referrals pulled', `${r.j.referrals.length}`);

// --- LIS
const lh = (await call('GET', '/lab/home', lab)).j;
const o = lh.orders.find((x) => ['collected', 'received', 'processing'].includes(x.status)) || lh.orders.find((x) => x.status === 'ordered');
r = await call('GET', '/integration/v1/lab-orders', null, null, lkey);
check(r.s === 200 && r.j.orders.length === lh.orders.length, 'LIS sees the same orders as the lab', `${r.j.orders.length}`);
if (o.status === 'ordered') {
  r = await call('POST', `/integration/v1/lab-orders/${o.id}/results`, null, { results: [{ name: 'Hb', value: '11' }] }, lkey);
  check(r.s === 409, 'results refused before collection');
  r = await call('PUT', `/integration/v1/lab-orders/${o.id}/status`, null, { status: 'collected' }, lkey);
  check(r.s === 200, 'LIS marks collected');
}
r = await call('PUT', `/integration/v1/lab-orders/${o.id}/status`, null, { status: 'ordered' }, lkey);
check(r.s === 409 || r.s === 400, 'status can’t go backwards');
const code = o.tests[0]?.code;
r = await call('POST', `/integration/v1/lab-orders/${o.id}/results`, null, { results: [{ code, value: '11.2', unit: 'g/dL', range: '12-15', flag: 'LOW' }] }, lkey);
check(r.s === 200 && r.j.status === 'review', 'results land in the pathologist queue', code);
const after = (await call('GET', '/lab/home', path)).j.orders.find((x) => x.id === o.id);
check(after.status === 'review' && after.draftReport.enteredBy.name.includes('software') && after.draftReport.results[0].flag === 'low', 'shown as entered by the software, unsigned');
r = await call('POST', `/lab-orders/${o.id}/approve`, null, { decision: 'approve' }, lkey);
check(r.s === 401, 'a software key can’t sign a report');

// --- billing
r = await call('PUT', '/integration/v1/stock', null, { mode: 'set', rows: [{ drug: 'Zinctest 20mg', batch: 'ZT1', expiry: '2028-01-31', qty: 50 }, { drug: 'x', qty: 1 }] }, bkey);
check(r.s === 200 && r.j.changed === 1 && r.j.errors.length === 1, 'stock row synced, bad row reported');
r = await call('PUT', '/integration/v1/stock', null, { mode: 'set', rows: [{ drug: 'Zinctest 20mg', batch: 'ZT1', expiry: '2028-01-31', qty: 40 }] }, bkey);
const zinc = async () => (await call('GET', '/integration/v1/stock', null, null, bkey)).j.stock.filter((i) => i.drug === 'Zinctest 20mg');
let st = await zinc();
check(st.length === 1 && st[0].qty === 40, 're-sync sets the quantity, never doubles it', `${st.map((s) => s.qty)}`);
const zincBefore = (await call('GET', '/integration/v1/stock', null, null, bkey)).j.stock.filter((i) => i.drug === 'Zinc 20mg').reduce((s, i) => s + i.qty, 0);
r = await call('POST', '/integration/v1/sales', null, { lines: [{ drug: 'Zinctest 20mg', qty: 15, batch: 'ZT1' }, { drug: 'Zinctest 20mg', qty: 100 }] }, bkey);
st = await zinc();
const zincAfter = (await call('GET', '/integration/v1/stock', null, null, bkey)).j.stock.filter((i) => i.drug === 'Zinc 20mg').reduce((s, i) => s + i.qty, 0);
check(r.s === 200 && st[0].qty === 0 && r.j.recorded[1].shortBy === 75, 'counter sales come off stock; shortfall reported', JSON.stringify(r.j.recorded));
check(zincBefore === zincAfter, 'a look-alike medicine (Zinc 20mg) keeps its stock', `${zincBefore} → ${zincAfter}`);
await call('POST', '/inventory/bulk', pharm, { mode: 'set', rows: [{ drug: 'Zinctest 20mg', batch: 'ZT1', expiry: '2028-01-31', qty: 33 }] });
await call('POST', '/inventory/bulk', pharm, { mode: 'set', rows: [{ drug: 'Zinctest 20mg', batch: 'ZT1', expiry: '2028-01-31', qty: 33 }] });
st = await zinc();
check(st[0].qty === 33, 'Marg CSV imported twice → still 33');

// --- webhooks
r = await call('POST', `/facility/integrations/${hid}/test`, hosp);
const ping = got.find((g) => JSON.parse(g.b).event === 'ping');
const sig = ping && crypto.createHmac('sha256', secret).update(`${ping.h['x-sehatra-timestamp']}.${ping.b}`).digest('hex');
check(r.j.ok && ping && ping.h['x-sehatra-signature'] === `sha256=${sig}`, 'test webhook delivered with a valid signature');
await new Promise((ok) => setTimeout(ok, 22000)); // one webhook sweep
check(!got.some((g) => JSON.parse(g.b).event === 'referral.created'), 'old referrals aren’t replayed to a new connection');
check(!got.some((g) => /Sunita|patientName|phone/.test(g.b)), 'no patient details in any webhook');

// --- revoke
await call('DELETE', `/facility/integrations/${hid}`, hosp);
r = await call('GET', '/integration/v1/me', null, null, hkey);
check(r.s === 401, 'switched-off key stops working at once');
r = await call('DELETE', `/facility/integrations/${hid}`, pharm);
check(r.s === 404, 'another facility can’t switch off someone else’s key');

// --- supplier purchase orders
r = await call('POST', '/distributor/purchase-orders', dist, { supplier: 'Test Pharma Ltd', supplierEmail: 'bad@', lines: [{ drug: 'ORS sachet', qty: 1000 }] });
check(r.s === 400, 'bad supplier email refused');
r = await call('POST', '/distributor/purchase-orders', dist, { supplier: 'Test Pharma Ltd', supplierEmail: 'orders@testpharma.test', supplierPhone: '9876543210', deliverBy: '2026-11-10', lines: [{ drug: 'ORS sachet', qty: 1000 }] });
const po = r.j;
check(r.s === 200 && po.supplierEmail === 'orders@testpharma.test', 'PO saved with supplier contact');
r = await call('POST', `/distributor/purchase-orders/${po.id}/send`, dist, {});
check(r.s === 200 && /\/po\//.test(r.j.url) && r.j.po.status === 'sent' && /wa\.me\/919876543210/.test(r.j.whatsapp), 'PO sent: link + WhatsApp');
const token = r.j.url.split('/po/')[1];
r = await call('GET', `/public/po/${token}`);
check(r.s === 200 && r.j.poNo === po.poNo && !JSON.stringify(r.j).includes('supplierLink') && !JSON.stringify(r.j).includes('createdBy') && r.h.get('cache-control') === 'no-store', 'supplier opens it without an account; no internal fields');
r = await call('POST', `/public/po/${token}/respond`, null, { action: 'accept' });
check(r.s === 400, 'accept needs a delivery date');
const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
r = await call('POST', `/public/po/${token}/respond`, null, { action: 'accept', date: soon, name: 'Ravi' });
check(r.s === 200 && r.j.status === 'accepted' && r.j.response.deliverOn === soon, 'supplier accepts with a date');
r = await call('POST', `/public/po/${token}/respond`, null, { action: 'accept', date: soon });
check(r.s === 409, 'can’t accept twice');
const notes = (await call('GET', '/notifications', dist)).j || [];
check(notes.some((n) => /accepted/.test(n.title)) && notes.some((n) => /opened/.test(n.title)), 'warehouse told it was opened and accepted');
r = await call('POST', `/public/po/${token}/respond`, null, { action: 'dispatch', date: soon });
check(r.s === 200 && r.j.status === 'dispatched', 'supplier marks dispatched');
r = await call('POST', `/distributor/purchase-orders/${po.id}/cancel`, dist);
check(r.s === 409, 'dispatched order can’t be cancelled');
r = await call('POST', `/distributor/purchase-orders/${po.id}/send`, dist, {});
check(r.s === 409, 'can’t resend a dispatched order');
r = await call('GET', '/public/po/AAAAAAAAAAAAAAAAAAAAAAAA');
check(r.s === 410, 'made-up PO link doesn’t open');
r = await call('POST', '/distributor/purchase-orders', dist, { supplier: 'Second Supplier', lines: [{ drug: 'Paracetamol 500mg', qty: 500 }] });
const p2 = r.j;
const t1 = (await call('POST', `/distributor/purchase-orders/${p2.id}/send`, dist, { phone: '9876500000' })).j.url.split('/po/')[1];
const t2 = (await call('POST', `/distributor/purchase-orders/${p2.id}/send`, dist, {})).j.url.split('/po/')[1];
check((await call('GET', `/public/po/${t1}`)).s === 410 && (await call('GET', `/public/po/${t2}`)).s === 200, 'resending replaces the old link');
await call('POST', `/distributor/purchase-orders/${p2.id}/cancel`, dist);
r = await call('POST', `/public/po/${t2}/respond`, null, { action: 'decline', note: 'no stock' });
check(r.s === 409 && (await call('GET', `/public/po/${t2}`)).j.status === 'cancelled', 'cancelled order can’t be answered and says cancelled');

srv.close();
lib.done();
