import { useEffect, useState } from 'react';
import { FileCheck2, ShieldCheck, ShieldAlert, Check, X, IndianRupee } from 'lucide-react';
import { Card, Empty, Loading, Modal, cx, fmtMoney, fmtDate } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';

export default function Claims() {
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get('/hospital/claims').then((r) => alive && setClaims(r)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, []);
  if (error) return <Empty title="Couldn't load claims">{error}</Empty>;
  if (!claims) return <Loading />;

  const ready = claims.filter((c) => c.status === 'ready').length;
  const totalValue = claims.reduce((s, c) => s + c.total, 0);

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Claims-ready records" title="Insurance claims"
        subtitle="Every completed visit is auto-structured into an NHCX-ready claim, with duplicate and fraud checks — so you get paid faster, with less paperwork." />

      <div className="grid three">
        <Card className="stat"><span className="label"><FileCheck2 size={15} /> Ready to submit</span><span className="value" style={{ color: 'var(--green-2)' }}>{ready}</span></Card>
        <Card className="stat"><span className="label"><ShieldAlert size={15} /> Need review</span><span className="value" style={{ color: 'var(--sun)' }}>{claims.length - ready}</span></Card>
        <Card className="stat"><span className="label"><IndianRupee size={15} /> Total value</span><span className="value">{fmtMoney(totalValue)}</span></Card>
      </div>

      {claims.length === 0 ? <Empty title="No completed visits yet" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Claim ID</th><th>Patient</th><th>Diagnosis</th><th>Amount</th><th>Checks</th><th>Status</th></tr></thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.claimId} style={{ cursor: 'pointer' }} tabIndex={0} onClick={() => setOpen(c)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(c); } }} aria-label={`Open claim ${c.claimId}`}>
                  <td className="mono" translate="no">{c.claimId}</td>
                  <td translate="no">{c.patient.name}{c.patient.abha ? ' · ABHA' : ''}</td>
                  <td>{c.diagnosis}</td>
                  <td>{fmtMoney(c.total)}</td>
                  <td>{c.checks.filter((k) => k.pass).length}/{c.checks.length} passed</td>
                  <td><span className={cx('badge', c.status === 'ready' ? 'green' : 'sun')}>{c.status === 'ready' ? 'Ready' : 'Review'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.claimId} subtitle={open ? `${open.patient.name} · ${fmtDate(open.date)}` : ''}>
        {open && (
          <div className="stack">
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table">
                <tbody>
                  {open.items.map((it) => <tr key={it.code}><td><span className="badge">{it.code}</span> {it.desc}</td><td className="right">{fmtMoney(it.amount)}</td></tr>)}
                  <tr><td className="strong">Total</td><td className="right strong">{fmtMoney(open.total)}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <div className="small strong mb-1">Fraud & quality checks</div>
              {open.checks.map((k) => (
                <div key={k.key} className="row" style={{ gap: 8, padding: '4px 0' }}>
                  <span className={cx('pt-check-ic', k.pass ? 'ok' : 'bad')}>{k.pass ? <Check size={13} /> : <X size={13} />}</span>
                  <span className="small grow">{k.label}</span>
                  <span className="tiny muted">{k.note}</span>
                </div>
              ))}
            </div>
            <div className={cx('callout', open.status === 'ready' ? 'green' : '')}>
              {open.status === 'ready' ? <ShieldCheck /> : <ShieldAlert />}
              <span>{open.status === 'ready' ? 'All checks passed — this claim is ready to submit to NHCX.' : `Fraud score ${open.fraudScore}. Resolve the failed checks before submitting.`}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
