import { Link, useParams } from 'react-router-dom';
import { FileText, Download, Printer, ArrowLeft, CalendarClock, BedDouble, Activity, Package } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, Empty, useToast, fmtNum, fmtDate, fmtDateTime } from '../../components/ui';
import { useAuth } from '../../auth';
import { useGov, downloadCsv, alertTitle } from './shared';

const scopeName = (s) => (s.level === 'national' ? 'National' : s.level === 'state' ? `${s.state} state` : `${s.district} district`);
const stamp = () => new Date().toISOString().slice(0, 10);

const REPORTS = [
  {
    id: 'capacity',
    title: 'Capacity report',
    icon: BedDouble,
    audience: 'Ministry of Health · State NHM',
    desc: 'Beds, ICU and oxygen headroom for every network hospital, with occupancy.',
    rows: (d) => (d.capacity || []).map((h) => ({
      hospital: h.name, district: h.district, state: h.state, total_beds: h.totalBeds, free_beds: h.freeBeds,
      occupancy_pct: h.totalBeds ? Math.round(((h.totalBeds - h.freeBeds) / h.totalBeds) * 100) : 0,
      icu_total: h.icuTotal, icu_free: h.icuFree, oxygen_free: h.oxygenFree,
    })),
  },
  {
    id: 'outbreak',
    title: 'Outbreak bulletin',
    icon: Activity,
    audience: 'IDSP district & state cells',
    desc: 'Every disease signal with AI confidence, multiplier over baseline and the action taken.',
    rows: (d) => (d.alerts || []).filter((a) => a.type === 'outbreak').map((a) => ({
      alert_id: a.id, disease: a.disease, district: a.district, state: a.state, pincode: a.pincode, cases_7d: a.cases, baseline: a.baseline,
      multiplier: a.multiplier ?? '', ai_confidence_pct: a.confidence != null ? Math.round(a.confidence * 100) : '', status: a.status, raised_at: a.createdAt,
      last_action: a.actions?.at(-1)?.action || '',
    })),
  },
  {
    id: 'supply',
    title: 'Supply & shortage report',
    icon: Package,
    audience: 'State drug warehouse · procurement',
    desc: 'Medicines under 14 days of cover and every transfer currently on the road.',
    rows: (d) => [
      ...(d.shortages || []).map((s) => ({ kind: 'low_stock', drug: s.drug, facility: s.facility, qty: s.qty, days_left: s.daysLeft, route: '', status: '' })),
      ...(d.transfersInTransit || []).map((t) => ({ kind: 'transfer', drug: t.drug, facility: t.toName, qty: t.qty, days_left: '', route: `${t.fromName} -> ${t.toName}`, status: t.status })),
    ],
  },
];

export default function Reports() {
  const { data } = useGov();
  const toast = useToast();
  const download = (r) => {
    const rows = r.rows(data);
    if (!rows.length) { toast('Nothing to export for this report right now', 'error'); return; }
    downloadCsv(`nexus-healthcare-${r.id}-${scopeName(data.scope).toLowerCase().replace(/\s+/g, '-')}-${stamp()}.csv`, rows);
    toast(`${r.title} downloaded · ${rows.length} rows`);
  };

  return (
    <>
      <PageHeader eyebrow="Reports" title="Reports" subtitle={`Generated from live data for the ${scopeName(data.scope).toLowerCase()} view. Download as CSV or open a print-ready copy whenever you need one — nothing is sent automatically.`} />
      <div className="cc-reports">
        {REPORTS.map((r) => {
          const n = r.rows(data).length;
          return (
            <Card key={r.id} className="cc-report">
              <div className="row top" style={{ gap: 14 }}>
                <span className="cc-report-icon"><r.icon /></span>
                <div className="grow">
                  <h3 style={{ marginBottom: 4 }}>{r.title}</h3>
                  <p className="small muted mb-1">{r.desc}</p>
                  <div className="row wrap tiny muted" style={{ gap: 14 }}>
                    <span className="row" style={{ gap: 5 }}><CalendarClock size={14} /> On demand</span>
                    <span>Suggested for: {r.audience}</span>
                    <span>{n} row{n === 1 ? '' : 's'} today</span>
                  </div>
                </div>
              </div>
              <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <Link to={`/command/reports/${r.id}`} className="btn sm secondary"><Printer /> Print view</Link>
                <Button size="sm" icon={Download} onClick={() => download(r)}>Download CSV</Button>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="tiny muted mt-2">Reports contain aggregated, anonymised figures only. No patient-identifiable data leaves the platform.</p>
    </>
  );
}

export function ReportView() {
  const { id } = useParams();
  const { data } = useGov();
  const { user } = useAuth();
  const toast = useToast();
  const r = REPORTS.find((x) => x.id === id);
  if (!r) return <Empty icon={FileText} title="Report not found"><Link to="/command/reports">Back to reports</Link></Empty>;
  const rows = r.rows(data);
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const t = data.totals || {};

  return (
    <div className="cc-print">
      <div className="row between wrap no-print mb-2" style={{ gap: 10 }}>
        <Link to="/command/reports" className="btn sm ghost"><ArrowLeft /> All reports</Link>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" variant="secondary" icon={Download} onClick={() => { downloadCsv(`nexus-healthcare-${r.id}-${stamp()}.csv`, rows); toast('CSV downloaded'); }}>CSV</Button>
          <Button size="sm" icon={Printer} onClick={() => window.print()}>Print / save PDF</Button>
        </div>
      </div>

      <article className="cc-paper">
        <header className="cc-paper-head">
          <div>
            <div className="eyebrow">Sehatra · Health Command Center</div>
            <h1>{r.title}</h1>
            <div className="small muted">{scopeName(data.scope)} · generated {fmtDateTime(new Date().toISOString())} · prepared for {r.audience}</div>
          </div>
          <div className="cc-paper-seal">{data.scope.level === 'national' ? 'IN' : String(data.scope.level === 'state' ? data.scope.state : data.scope.district).slice(0, 3).toUpperCase()}</div>
        </header>

        <section className="cc-paper-summary">
          <div><span>Free beds</span><strong>{fmtNum(t.freeBeds)}</strong></div>
          <div><span>ICU free</span><strong>{fmtNum(t.icuFree)}</strong></div>
          <div><span>Doctors online</span><strong>{fmtNum(t.doctorsOnline)}</strong></div>
          <div><span>Open alerts</span><strong>{fmtNum(t.openAlerts)}</strong></div>
        </section>

        {r.id === 'outbreak' && (
          <section>
            <h3>Summary</h3>
            <ul className="small">
              {(data.alerts || []).filter((a) => a.type === 'outbreak').map((a) => (
                <li key={a.id}><strong>{alertTitle(a)}</strong> — {a.cases ?? 0} case{a.cases === 1 ? '' : 's'}{a.baseline != null ? ` against a baseline of ${a.baseline}` : ''}{a.multiplier != null ? ` (${a.multiplier}×)` : ''}{a.confidence != null ? `, AI confidence ${Math.round(a.confidence * 100)}%` : ''}, status {a.status}.</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3>Detail</h3>
          {rows.length === 0 ? <p className="small muted">No rows for this period.</p> : (
            <div className="table-wrap">
              <table className="table cc-paper-table">
                <thead><tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>{cols.map((c) => <td key={c}>{c.endsWith('_at') && row[c] ? fmtDate(row[c]) : String(row[c] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="cc-paper-foot tiny muted">
          Prepared by {user?.name} · Aggregated and anonymised; no patient-identifiable information. · Page generated from live platform data.
        </footer>
      </article>
    </div>
  );
}
