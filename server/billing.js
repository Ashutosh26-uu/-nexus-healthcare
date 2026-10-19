// Billing for partners (pharmacy counter sales, warehouse B2B invoices, lab bills). Pure money maths — no I/O;
// index.js owns stock, numbering, storage and routes. All amounts are in rupees, rounded to paise.
//
// GST, the way each business actually prices:
//  • pharmacy  — retail at MRP, which already INCLUDES GST (taxable = amount / (1 + rate))
//  • warehouse — trade price is BEFORE GST; GST is added on top (B2B)
//  • lab       — diagnostic services are exempt: 0% GST, a "bill of supply"
// Intra-state supply splits GST into CGST + SGST; inter-state is IGST.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MODES = ['cash', 'upi', 'card', 'credit'];
const PRICING = { pharmacy: 'inclusive', warehouse: 'exclusive', lab: 'exempt' };
const PREFIX = { pharmacy: 'INV', warehouse: 'TI', lab: 'LB' };

// Indian financial year (April–March) of a date, e.g. "2026-27".
function fyOf(iso) {
  const d = new Date(iso);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

// One line → its money. `price` is per unit as the business quotes it (MRP-inclusive for a pharmacy, pre-GST for a
// warehouse, the test fee for a lab). `discountPct` 0–100 comes off before tax is worked out.
function lineMoney({ qty, price, discountPct = 0, gstRate = 0 }, pricing) {
  const q = Math.max(0, Number(qty) || 0);
  const gross = r2(q * (Number(price) || 0));
  const discount = r2(gross * Math.min(100, Math.max(0, Number(discountPct) || 0)) / 100);
  const net = r2(gross - discount);
  const rate = pricing === 'exempt' ? 0 : Math.max(0, Number(gstRate) || 0);
  if (pricing === 'exclusive') {
    const gst = r2(net * rate / 100);
    return { gross, discount, taxable: net, gstRate: rate, gst, amount: r2(net + gst) };
  }
  const taxable = rate ? r2(net / (1 + rate / 100)) : net;
  return { gross, discount, taxable, gstRate: rate, gst: r2(net - taxable), amount: net };
}

// Totals + GST by rate. `interState` → IGST; otherwise CGST and SGST are each half.
function totals(lines, { interState = false, roundOff = true } = {}) {
  const sum = (k) => r2(lines.reduce((s, l) => s + (l[k] || 0), 0));
  const bySlab = new Map();
  for (const l of lines) {
    const s = bySlab.get(l.gstRate) || { rate: l.gstRate, taxable: 0, gst: 0 };
    s.taxable = r2(s.taxable + l.taxable); s.gst = r2(s.gst + l.gst);
    bySlab.set(l.gstRate, s);
  }
  const slabs = [...bySlab.values()].sort((a, b) => a.rate - b.rate).map((s) => (interState
    ? { ...s, igst: s.gst, cgst: 0, sgst: 0 }
    : { ...s, igst: 0, cgst: r2(s.gst / 2), sgst: r2(s.gst - r2(s.gst / 2)) }));
  const exact = sum('amount');
  const total = roundOff ? Math.round(exact) : exact;
  return { gross: sum('gross'), discount: sum('discount'), taxable: sum('taxable'), gst: sum('gst'), roundOff: r2(total - exact), total: r2(total), slabs, interState };
}

// Where a bill stands after its payments.
function settle(total, payments) {
  const paid = r2((payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const due = r2(Math.max(0, total - paid));
  return { paid, due, status: due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' };
}

// Sales report over bills (already filtered to one facility and a date range): per day, per payment mode,
// GST by rate, top items, and what is still owed. Cancelled bills are listed but never counted.
function summary(bills, { dayOf }) {
  const live = bills.filter((b) => b.status !== 'cancelled');
  const days = new Map();
  const modes = Object.fromEntries(MODES.map((m) => [m, 0]));
  const slabs = new Map();
  const items = new Map();
  for (const b of live) {
    const day = dayOf(b.createdAt);
    const d = days.get(day) || { date: day, bills: 0, total: 0, gst: 0, collected: 0 };
    d.bills += 1; d.total = r2(d.total + b.totals.total); d.gst = r2(d.gst + b.totals.gst);
    days.set(day, d);
    for (const p of b.payments || []) { modes[p.mode] = r2((modes[p.mode] || 0) + p.amount); }
    for (const s of b.totals.slabs || []) {
      const x = slabs.get(s.rate) || { rate: s.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      x.taxable = r2(x.taxable + s.taxable); x.cgst = r2(x.cgst + s.cgst); x.sgst = r2(x.sgst + s.sgst); x.igst = r2(x.igst + s.igst);
      slabs.set(s.rate, x);
    }
    for (const l of b.lines) {
      const k = String(l.name).toLowerCase();
      const it = items.get(k) || { name: l.name, qty: 0, amount: 0 };
      it.qty += Number(l.qty) || 0; it.amount = r2(it.amount + l.amount);
      items.set(k, it);
    }
  }
  for (const b of live) for (const p of b.payments || []) { const d = days.get(dayOf(p.at)); if (d) d.collected = r2(d.collected + p.amount); }
  const dues = live.filter((b) => b.due > 0).map((b) => ({ id: b.id, billNo: b.billNo, customer: b.customer?.name || 'Walk-in', total: b.totals.total, due: b.due, dueDate: b.dueDate || null, createdAt: b.createdAt }))
    .sort((a, c) => (a.dueDate || a.createdAt).localeCompare(c.dueDate || c.createdAt));
  return {
    bills: live.length, cancelled: bills.length - live.length,
    sales: r2(live.reduce((s, b) => s + b.totals.total, 0)),
    taxable: r2(live.reduce((s, b) => s + b.totals.taxable, 0)),
    gst: r2(live.reduce((s, b) => s + b.totals.gst, 0)),
    collected: r2(Object.values(modes).reduce((s, v) => s + v, 0)),
    outstanding: r2(dues.reduce((s, x) => s + x.due, 0)),
    modes, days: [...days.values()].sort((a, c) => a.date.localeCompare(c.date)),
    slabs: [...slabs.values()].sort((a, c) => a.rate - c.rate),
    topItems: [...items.values()].sort((a, c) => c.amount - a.amount).slice(0, 10),
    dues,
  };
}

module.exports = { r2, MODES, PRICING, PREFIX, fyOf, lineMoney, totals, settle, summary };
