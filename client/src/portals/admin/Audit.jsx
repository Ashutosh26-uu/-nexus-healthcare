import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShieldAlert, CheckCircle2, ScrollText, Download } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Empty, Button, Modal, Field, Loading, useAction, useToast, fmtDateTime, cx } from '../../components/ui';
import { useLive } from '../../live';
import { RoleBadge } from './shared';

const ACTIONS = [
  ['', 'All actions'],
  ['break_glass', 'Break-glass (emergency access)'],
  ['viewed_records', 'Viewed records'],
  ['viewed_records_emergency', 'Viewed records (emergency)'],
  ['created_prescription', 'Created prescription'],
  ['uploaded_report', 'Uploaded lab report'],
  ['consent_approve', 'Consent approved'],
  ['consent_deny', 'Consent denied'],
  ['consent_revoke', 'Consent revoked'],
  ['booked_consult', 'Booked consult'],
  ['completed_consult', 'Completed consult'],
  ['registered_patient', 'Registered patient'],
  ['ai_config_changed', 'AI config changed'],
  ['ai_config_rollback', 'AI config rolled back'],
  ['verified', 'Verified onboarding'],
  ['rejected', 'Rejected onboarding'],
  ['created_user', 'Created user'],
  ['user_suspended', 'Suspended user'],
  ['user_active', 'Reactivated user'],
];
const ACTION_TONE = { break_glass: 'solid-rose', viewed_records_emergency: 'rose', created_prescription: 'green', ai_config_changed: 'plum', ai_config_rollback: 'plum', user_suspended: 'rose', rejected: 'rose', verified: 'green' };
const label = (a) => ACTIONS.find(([k]) => k === a)?.[1] || a.replace(/_/g, ' ');

function exportCsv(rows) {
  const cols = ['at', 'actorName', 'role', 'action', 'patientId', 'recordType', 'reason', 'reviewed', 'reviewedBy', 'reviewNote'];
  const esc = (v) => {
    let s = v === undefined || v === null ? '' : String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no formula injection in Excel/Sheets
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `nexus-healthcare-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Audit() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [debounced, setDebounced] = useState(q);
  const action = params.get('action') || '';
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  const url = `/admin/audit?q=${encodeURIComponent(debounced)}&action=${encodeURIComponent(action)}`;
  const live = useLive(url, ['audit', 'admin']);
  const [review, setReview] = useState(null);
  const [note, setNote] = useState('');
  const [run, busy] = useAction();
  const toast = useToast();
  const rows = live.data || [];

  const setAction = (a) => { const p = new URLSearchParams(params); if (a) p.set('action', a); else p.delete('action'); setParams(p, { replace: true }); };
  const submitReview = async () => {
    const r = await run('rev', () => api.post(`/admin/audit/${review.id}/review`, { note: note.trim() }), 'Review recorded');
    if (r) { setReview(null); setNote(''); live.reload(); }
  };
  const pendingBG = rows.filter((r) => r.action === 'break_glass' && !r.reviewed).length;

  return (
    <>
      <PageHeader eyebrow="Audit & compliance" title="Access log" subtitle="Every view, prescription, consent change and emergency access — who, when and why. Entries can’t be edited or deleted.">
        <Button variant="secondary" icon={Download} disabled={!rows.length} onClick={() => { exportCsv(rows); toast(`Exported ${rows.length} entries`); }}>Export CSV</Button>
      </PageHeader>

      {pendingBG > 0 && (
        <div className="callout rose small mb-2"><ShieldAlert /> <span><strong>{pendingBG} break-glass event{pendingBG > 1 ? 's' : ''} need review.</strong> A doctor opened critical records without consent. Check the stated reason was a genuine emergency.</span></div>
      )}

      <Card>
        <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
          <div className="input-wrap grow" style={{ minWidth: 220 }}>
            <Search />
            <input className="input sm" placeholder="Search name, patient ID, reason…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select sm" style={{ width: 'auto' }} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
            {ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>

        {live.loading && !live.data ? <Loading /> : rows.length === 0 ? (
          <Empty icon={ScrollText} title="No entries">Nothing matches this search.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table ad-audit">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Patient</th><th>Reason / detail</th><th aria-label="Review" /></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const bg = a.action === 'break_glass';
                  return (
                    <tr key={a.id} className={cx(bg && 'ad-bg-row', bg && !a.reviewed && 'unreviewed')}>
                      <td className="nowrap small">{fmtDateTime(a.at)}</td>
                      <td>
                        <div className="small" style={{ fontWeight: 600 }} translate="no">{a.actorName}</div>
                        <RoleBadge role={a.role} />
                      </td>
                      <td><span className={cx('badge', ACTION_TONE[a.action] || (a.action.startsWith('consent') ? 'sky' : ''))}>{label(a.action)}</span></td>
                      <td className="mono small nowrap">{a.patientId || <span className="muted">—</span>}</td>
                      <td className="small ad-reason">
                        {a.recordType && <span className="tiny muted">{a.recordType} · </span>}{a.reason}
                        {a.reviewed && <div className="tiny ad-reviewed"><CheckCircle2 size={12} /> Reviewed by {a.reviewedBy}: {a.reviewNote}</div>}
                      </td>
                      <td className="right">
                        {bg && !a.reviewed && <Button size="sm" variant="danger" onClick={() => { setReview(a); setNote(''); }}>Review</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted mb-0 mt-1">Showing up to 200 most recent entries. Logs are retained for 7 years under the DPDP Act and clinical record rules.</p>
      </Card>

      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title="Review emergency access"
        subtitle={review ? `${review.actorName} · ${fmtDateTime(review.at)}` : ''}
        footer={<><Button variant="ghost" onClick={() => setReview(null)}>Cancel</Button><Button loading={busy === 'rev'} disabled={note.trim().length < 5} onClick={submitReview}>Record review</Button></>}
      >
        {review && (
          <div className="stack">
            <dl className="kv">
              <dt>Patient</dt><dd className="mono">{review.patientId}</dd>
              <dt>Data opened</dt><dd>Critical only — allergies, blood group, conditions, current medicines</dd>
              <dt>Stated reason</dt><dd>“{review.reason}”</dd>
            </dl>
            <div className="row wrap" style={{ gap: 6 }}>
              {['Justified — genuine emergency', 'Justified — follow up with doctor on documentation', 'Not justified — escalate to compliance'].map((s) => (
                <button key={s} type="button" className={cx('chip', note === s && 'on')} onClick={() => setNote(s)}>{s}</button>
              ))}
            </div>
            <Field label="Review note" hint="Saved with your name. The patient was already notified at the time of access.">
              <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
