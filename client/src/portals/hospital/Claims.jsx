import { useEffect, useState } from 'react';
import { FileCheck2, ShieldCheck, ShieldAlert, Check, X, IndianRupee, Info } from 'lucide-react';
import { Card, Empty, Loading, Modal, PreviewBadge, cx, fmtMoney, fmtDate } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { useLive } from '../../live';

export default function Claims() {
  const live = useLive('/hospital/claims', ['consults', 'prescriptions', 'lab', 'payments', 'hospital']);
  const { reload } = live;
  // Visits finished by your doctors don't always notify this desk, so a light poll keeps the list current too.
  useEffect(() => { const t = setInterval(reload, 60000); return () => clearInterval(t); }, [reload]);
  const [openId, setOpenId] = useState(null);
  const claims = Array.isArray(live.data) ? live.data : null;
  if (live.error && !claims) return <Empty title="Couldn't load claims">{live.error}</Empty>;
  if (!claims) return <Loading />;
  const open = claims.find((c) => c.claimId === openId) || null;
  const setOpen = (c) => setOpenId(c ? c.claimId : null);

  const ready = claims.filter((c) => c.status === 'ready').length;
  const totalValue = claims.reduce((s, c) => s + (Number(c.total) || 0), 0);

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Claims-ready records" title={<span className="row wrap" style={{ gap: 10 }}>Insurance claims <PreviewBadge /></span>}
        subtitle="Each completed visit at your hospital is drafted as a claim, with duplicate and completeness checks." />
      <div className="callout"><Info /><span>Draft claims — NHCX submission isn&apos;t connected yet. Amounts come only from payments recorded on Sehatra; a line with no recorded payment shows “Not recorded”.</span></div>

      <div className="grid three">
        <Card className="stat"><span className="label"><FileCheck2 size={15} /> Drafts with all checks passed</span><span className="value" style={{ color: 'var(--green-2)' }}>{ready}</span></Card>
        <Card className="stat"><span className="label"><ShieldAlert size={15} /> Need review</span><span className="value" style={{ color: 'var(--sun)' }}>{claims.length - ready}</span></Card>
        <Card className="stat"><span className="label"><IndianRupee size={15} /> Recorded value</span><span className="value">{fmtMoney(totalValue)}</span></Card>
      </div>

      {claims.length === 0 ? <Empty title="No completed visits yet" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Claim ID</th><th>Patient</th><th>Diagnosis</th><th>Recorded amount</th><th>Checks</th><th>Status</th></tr></thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.claimId} style={{ cursor: 'pointer' }} tabIndex={0} onClick={() => setOpen(c)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(c); } }} aria-label={`Open claim ${c.claimId}`}>
                  <td className="mono" translate="no">{c.claimId}</td>
                  <td translate="no">{c.patient?.name || '—'}{c.patient?.abha ? ' · ABHA' : ''}</td>
                  <td>{c.diagnosis}</td>
                  <td>{(c.items || []).length > 0 && (c.items || []).every((it) => it.amount == null) ? <span className="muted">Not recorded</span> : (c.items || []).some((it) => it.amount == null) ? <>{fmtMoney(c.total)} <span className="tiny muted">· part not recorded</span></> : fmtMoney(c.total)}</td>
                  <td>{(c.checks || []).filter((k) => k.pass).length}/{(c.checks || []).length} passed</td>
                  <td><span className={cx('badge', c.status === 'ready' ? 'green' : 'sun')}>{c.status === 'ready' ? 'Draft · checks passed' : 'Draft · review'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.claimId} subtitle={open ? `${open.patient?.name || ''} · ${fmtDate(open.date)}` : ''}>
        {open && (
          <div className="stack">
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table">
                <tbody>
                  {(open.items || []).map((it) => <tr key={it.code}><td><span className="badge">{it.code}</span> {it.desc}</td><td className="right">{it.amount == null ? <span className="muted">Not recorded</span> : fmtMoney(it.amount)}</td></tr>)}
                  <tr><td className="strong">Recorded total</td><td className="right strong">{fmtMoney(open.total)}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <div className="small strong mb-1">Fraud & quality checks</div>
              {(open.checks || []).map((k) => (
                <div key={k.key} className="row" style={{ gap: 8, padding: '4px 0' }}>
                  <span className={cx('pt-check-ic', k.pass ? 'ok' : 'bad')}>{k.pass ? <Check size={13} /> : <X size={13} />}</span>
                  <span className="small grow">{k.label}</span>
                  <span className="tiny muted">{k.note}</span>
                </div>
              ))}
            </div>
            <div className={cx('callout', open.status === 'ready' ? 'green' : '')}>
              {open.status === 'ready' ? <ShieldCheck /> : <ShieldAlert />}
              <span>{open.status === 'ready' ? "Draft claim — all checks passed. NHCX submission isn't connected yet." : `Draft claim — fraud score ${open.fraudScore ?? '—'}. Resolve the failed checks first; NHCX submission isn't connected yet.`}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
