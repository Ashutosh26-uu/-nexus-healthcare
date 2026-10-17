import { useState } from 'react';
import { Stamp, AlertTriangle, Undo2, ShieldCheck, Barcode } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Empty, Field, timeAgo, useAction, cx } from '../../components/ui';
import { api } from '../../api';
import { TestChips, genderShort, canSign } from './shared';

const FLAG_TONE = { normal: 'green', negative: 'green', high: 'sun', low: 'sun', positive: 'clay', critical: 'solid-rose' };
const SIGNER_KEY = 'nx_lab_signer'; // a single-person lab's own name + reg. no., remembered on this device only
const loadSigner = () => { try { return JSON.parse(localStorage.getItem(SIGNER_KEY)) || {}; } catch { return {}; } };
const saveSigner = (v) => { try { localStorage.setItem(SIGNER_KEY, JSON.stringify(v)); } catch { /* private mode */ } };

// Pathologist sign-off: nothing reaches the patient or doctor until a report is signed here.
export default function Approvals({ home, orders, reload, onApproved }) {
  const queue = orders.filter((o) => o.status === 'review').sort((a, b) => (b.draftReport?.critical ? 1 : 0) - (a.draftReport?.critical ? 1 : 0) || new Date(a.reviewAt) - new Date(b.reviewAt));
  const signer = canSign(home);
  const self = home?.me?.labRole !== 'pathologist';
  return (
    <>
      <PageHeader title="Pathologist sign-off" subtitle={signer
        ? (self ? 'Your lab has no separate pathologist, so you sign as the reporting pathologist — with your name and registration number on every report.' : `Signing as ${home.me.name}${home.me.regNo ? ` (Reg ${home.me.regNo})` : ''}. Patients and doctors see a report only after you approve it.`)
        : `Reports wait here for ${home?.pathologists?.join(', ')} to sign. Patients see them only after that.`} />
      {queue.length === 0 ? (
        <div className="card"><Empty icon={Stamp} title="Nothing waiting for sign-off">Entered results land here before they go to the patient.</Empty></div>
      ) : (
        <div className="stack lg">
          {queue.map((o) => <ApprovalCard key={`${o.id}-${o.draftReport?.enteredAt}`} order={o} home={home} signer={signer} self={self} reload={reload} onApproved={onApproved} />)}
        </div>
      )}
    </>
  );
}

function ApprovalCard({ order: o, home, signer, self, reload, onApproved }) {
  const d = o.draftReport || { results: [] };
  const crit = d.results.filter((r) => r.flag === 'critical');
  const [ack, setAck] = useState(false);
  const [sign, setSign] = useState(() => ({ confirm: false, ...loadSigner() }));
  const [regNo, setRegNo] = useState('');
  const [note, setNote] = useState('');
  const [returning, setReturning] = useState(false);
  const [run, busy] = useAction();

  const needsReg = !self && !home.me.regNo;
  const ready = (!crit.length || ack) && (self ? sign.confirm && sign.name?.trim().length >= 3 && sign.regNo?.trim().length >= 3 : !needsReg || regNo.trim().length >= 3);
  const approve = async () => {
    const body = self ? { sign: { confirm: true, name: sign.name.trim(), regNo: sign.regNo.trim() } } : { sign: { regNo: regNo.trim() } };
    const r = await run('ok', () => api.post(`/lab-orders/${o.id}/approve`, body), `Signed and sent to ${o.patientName}`);
    if (r) { if (self) saveSigner({ name: sign.name.trim(), regNo: sign.regNo.trim() }); onApproved?.(r); reload(); }
  };
  const sendBack = async () => {
    const r = await run('back', () => api.post(`/lab-orders/${o.id}/approve`, { decision: 'return', note }), 'Sent back to the bench');
    if (r) reload();
  };

  return (
    <article className={cx('card lab-approve', crit.length && 'critical')}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div>
          <div className="row wrap" style={{ gap: 8 }}>
            <strong translate="no">{o.patientName}</strong>
            <span className="small muted">{o.patientAge ?? '—'} {genderShort(o.patientGender)}</span>
            {o.sampleId && <span className="lab-chip mono" translate="no"><Barcode size={12} /> {o.sampleId}</span>}
            {crit.length > 0 && <span className="badge solid-rose"><AlertTriangle /> Critical</span>}
          </div>
          <TestChips tests={o.tests} />
        </div>
        <span className="tiny muted">Entered by {d.enteredBy?.name || 'lab'} · {timeAgo(d.enteredAt)}{d.reportFileId ? ' · PDF attached' : ''}</span>
      </div>
      <div className="table-wrap mt-1">
        <table className="table">
          <thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead>
          <tbody>
            {d.results.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td><td translate="no" dir="ltr"><strong>{r.value}</strong></td><td className="muted">{r.unit || '—'}</td><td className="muted">{r.range || '—'}</td>
                <td><span className={`badge ${FLAG_TONE[r.flag] || ''}`} style={{ textTransform: 'capitalize' }}>{r.flag}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!signer ? null : (
        <div className="stack mt-1">
          {crit.length > 0 && (
            <label className="callout rose small"><AlertTriangle size={16} /><span><strong>{crit.map((c) => `${c.name} ${c.value} ${c.unit}`).join(', ')}</strong> — the doctor and patient are alerted the moment you sign.
              <span className="check mt-1"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have reviewed this critical value</span></span></label>
          )}
          {self && (
            <div className="lab-selfsign">
              <label className="check small"><input type="checkbox" checked={!!sign.confirm} onChange={(e) => setSign((s) => ({ ...s, confirm: e.target.checked }))} /> <strong>I am the reporting pathologist</strong> for this report</label>
              <div className="lab-collect-grid">
                <Field label="Name"><input className="input sm" value={sign.name || ''} onChange={(e) => setSign((s) => ({ ...s, name: e.target.value }))} placeholder="Dr. Full name" /></Field>
                <Field label="Registration no."><input className="input sm" value={sign.regNo || ''} onChange={(e) => setSign((s) => ({ ...s, regNo: e.target.value }))} placeholder="e.g. UPMC-12345" /></Field>
              </div>
            </div>
          )}
          {needsReg && <Field label="Your registration no."><input className="input sm" value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="e.g. UPMC-12345" /></Field>}
          {returning && <Field label="What needs re-checking?"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sample haemolysed — please re-run Hb" /></Field>}
          <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
            {returning ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setReturning(false)}>Cancel</Button>
                <Button size="sm" variant="secondary" icon={Undo2} loading={busy === 'back'} disabled={note.trim().length < 3} onClick={sendBack}>Send back</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setReturning(true)}>Send back</Button>
                <Button size="sm" variant={crit.length ? 'danger' : undefined} icon={ShieldCheck} loading={busy === 'ok'} disabled={!ready} onClick={approve}>Approve &amp; sign</Button>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
