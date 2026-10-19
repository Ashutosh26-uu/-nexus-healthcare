import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert, Building2, Stethoscope, History, Eye, Clock, Check, X, Siren, Inbox } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Avatar, Button, Card, Empty, Field, Modal, Pills, Progress, StatusBadge, Tabs, cx, fmtDate, fmtDateTime, timeAgo, useAction } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, usePatientLive, firstName, Skeleton } from './shared';
import { useSupport, telHref } from '../../config';

const SCOPES = [
  { value: 'history', label: 'Visit history & notes' },
  { value: 'prescriptions', label: 'Prescriptions' },
  { value: 'labs', label: 'Lab reports' },
  { value: 'allergies', label: 'Allergies & conditions' },
  { value: 'vitals', label: 'Vitals readings' },
];
const scopeLabel = (s) => SCOPES.find((x) => x.value === s)?.label || s;

const ACTIONS = {
  viewed_records: 'Viewed records',
  created_prescription: 'Wrote a prescription',
  uploaded_report: 'Uploaded a lab report',
  break_glass: 'Emergency access',
  consent_approve: 'Approved access',
  consent_deny: 'Denied access',
  consent_revoke: 'Revoked access',
  booked_consult: 'Booked a consult',
  completed_consult: 'Completed a consult',
  updated_profile: 'Updated the passport',
  uploaded_record: 'Uploaded a record',
  added_family_profile: 'Created this profile',
};

export default function Consents() {
  const support = useSupport();
  const { patient, profiles } = usePatient();
  const { user } = useAuth();
  const { data, loading, error, setData } = usePatientLive('/consents', ['consents', 'audit', 'consults']);
  const [tab, setTab] = useState('pending');
  const [approving, setApproving] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [run, busy] = useAction();
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;

  const consents = data?.consents || [];
  const pending = consents.filter((c) => c.status === 'pending');
  const active = consents.filter((c) => c.status === 'active');
  const past = consents.filter((c) => ['expired', 'denied', 'revoked', 'archived'].includes(c.status));
  const log = data?.log || [];

  // Open on Requests only when something is waiting; otherwise show who has access now.
  const picked = useRef(false);
  useEffect(() => {
    if (!data || picked.current) return;
    picked.current = true;
    if (!data.consents.some((c) => c.status === 'pending')) setTab('active');
  }, [data]);

  const patch = (id, changes) => setData((d) => ({ ...d, consents: d.consents.map((c) => (c.id === id ? { ...c, ...changes } : c)) }));

  const deny = (c) => run(`deny-${c.id}`, async () => {
    patch(c.id, { status: 'denied' });
    try { await api.post(`/consents/${c.id}/deny`); } catch (e) { patch(c.id, { status: 'pending' }); throw e; }
  }, `Denied. ${c.granteeName} won’t see anything.`);

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Privacy" title="Who can see my data"
        subtitle={`${isSelf ? 'Your' : `${firstName(patient?.name)}’s`} records belong to ${isSelf ? 'you' : 'them'}. Doctors and hospitals only see what you allow, for as long as you allow — and you can take it back any time.`} />

      <div className="pt-consent-summary">
        <div><ShieldCheck className="pt-green" /><span><strong>{active.length}</strong> with access now</span></div>
        <div><Inbox className="pt-clay" /><span><strong>{pending.length}</strong> waiting for you</span></div>
        <div><Eye /><span><strong>{log.length}</strong> logged events</span></div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'pending', label: 'Requests', count: pending.length },
        { value: 'active', label: 'Active', count: active.length },
        { value: 'past', label: 'Past', count: past.length },
        { value: 'log', label: 'Access history', icon: History },
      ]} />

      {loading && !data ? (
        <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={110} r={14} />)}</div>
      ) : error ? <Empty title="Couldn't load consents">{error}</Empty> : (
        <>
          {tab === 'pending' && (pending.length === 0 ? (
            <Card><Empty icon={ShieldCheck} title="No requests right now">When a doctor or hospital asks to see your records, you&apos;ll get a notification and the request will wait here for you.</Empty></Card>
          ) : (
            <div className="stack fade-in">
              {pending.map((c) => (
                <article key={c.id} className="card pt-consent pending">
                  <div className="row top wrap">
                    <GranteeIcon c={c} />
                    <div className="grow">
                      <strong translate="no">{c.granteeName}</strong> <span className="small muted">wants to see {isSelf ? 'your' : `${firstName(patient?.name)}’s`} records</span>
                      <div className="small mt-1"><span className="muted">Why:</span> {c.purpose}</div>
                      <div className="row wrap mt-1" style={{ gap: 6 }}>{c.scope.map((s) => <span key={s} className="badge">{scopeLabel(s)}</span>)}</div>
                      <div className="tiny muted mt-1">Asked {timeAgo(c.requestedAt)}</div>
                    </div>
                  </div>
                  <div className="row wrap pt-consent-actions">
                    <Button variant="secondary" loading={busy === `deny-${c.id}`} onClick={() => deny(c)} icon={X}>Deny</Button>
                    <Button onClick={() => setApproving(c)} icon={Check}>Review & approve</Button>
                  </div>
                </article>
              ))}
            </div>
          ))}

          {tab === 'active' && (active.length === 0 ? (
            <Card><Empty icon={ShieldCheck} title="Nobody has access right now">Your records are private. When you book a consult, the doctor gets temporary access for that visit only.</Empty></Card>
          ) : (
            <div className="stack fade-in">
              {active.map((c) => {
                const total = new Date(c.expiry) - new Date(c.start);
                const used = Date.now() - new Date(c.start);
                return (
                  <article key={c.id} className="card pt-consent">
                    <div className="row top wrap">
                      <GranteeIcon c={c} />
                      <div className="grow">
                        <div className="row wrap between">
                          <strong translate="no">{c.granteeName}</strong>
                          <StatusBadge status="active" />
                        </div>
                        <div className="small muted">{c.purpose}</div>
                        <div className="row wrap mt-1" style={{ gap: 6 }}>{c.scope.map((s) => <span key={s} className="badge green">{scopeLabel(s)}</span>)}</div>
                        <div className="pt-expiry mt-2">
                          <Progress value={used} max={total} tone={used / total > 0.85 ? 'warn' : undefined} />
                          <div className="row between tiny muted mt-1"><span>Since {fmtDate(c.start)}</span><span><Clock size={12} className="inline-ic" /> Ends {timeAgo(c.expiry)}</span></div>
                        </div>
                      </div>
                    </div>
                    <div className="row wrap pt-consent-actions">
                      <Button variant="secondary" onClick={() => setRevoking(c)}>Revoke access</Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}

          {tab === 'past' && (past.length === 0 ? (
            <Card><Empty icon={History} title="Nothing in the past yet">Expired, denied and revoked permissions — and doctors you moved away from — will be listed here for your reference.</Empty></Card>
          ) : (
            <Card>
              <div className="list">
                {past.map((c) => (
                  <div key={c.id} className="list-item">
                    <GranteeIcon c={c} small />
                    <div className="grow">
                      <div className="strong small" translate="no">{c.granteeName}</div>
                      <div className="tiny muted">{c.purpose} · {c.scope.map(scopeLabel).join(', ')}</div>
                    </div>
                    <div className="right">
                      <StatusBadge status={c.status}>{c.status === 'archived' ? 'Moved away' : undefined}</StatusBadge>
                      {c.status === 'archived' && <div className="tiny muted">Read-only copy up to this date</div>}
                      <div className="tiny muted mt-1">{c.status === 'archived' ? fmtDate(c.archivedAt) : c.status === 'revoked' ? fmtDate(c.revokedAt) : c.status === 'expired' ? fmtDate(c.expiry) : fmtDate(c.requestedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {tab === 'log' && (log.length === 0 ? (
            <Card><Empty icon={Eye} title="No one has opened these records">Every time someone views or changes anything, it&apos;s recorded here — permanently.</Empty></Card>
          ) : (
            <Card>
              <p className="small muted">Every view and change, by anyone, is recorded here. It can&apos;t be edited or deleted — not even by us.</p>
              <div className="pt-audit">
                {log.map((a) => {
                  const bg = a.action === 'break_glass';
                  const me = a.actorId === user?.id;
                  return (
                    <div key={a.id} className={cx('pt-audit-row', bg && 'glass')}>
                      {bg ? <span className="pt-ic-tile rose"><Siren size={17} /></span> : <Avatar name={me ? (user?.name || 'You') : a.actorName} size="sm" />}
                      <div className="grow">
                        <div className="small"><strong>{me ? 'You' : a.actorName}</strong> <span className="muted">· {ACTIONS[a.action] || a.action.replace(/_/g, ' ')}</span>{a.recordType ? <span className="muted"> · {a.recordType}</span> : null}</div>
                        {a.reason && <div className="tiny muted">{bg ? 'Reason given: ' : ''}{a.reason}</div>}
                        {bg && <div className="tiny pt-glass-note"><ShieldAlert size={12} className="inline-ic" /> Emergency access is reviewed by a Nexus Healthcare admin.{support.phone ? <> If this wasn&apos;t you or a real emergency, call <a href={telHref(support.phone)} translate="no">{support.phone}</a>.</> : support.email ? <> If this wasn&apos;t you or a real emergency, email <a href={`mailto:${support.email}`} translate="no">{support.email}</a>.</> : null}</div>}
                      </div>
                      <span className="tiny muted nowrap" title={fmtDateTime(a.at)}>{timeAgo(a.at)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </>
      )}

      <ApproveModal consent={approving} onClose={() => setApproving(null)} onDone={(c) => patch(c.id, c)} />
      <RevokeModal consent={revoking} onClose={() => setRevoking(null)} onDone={(c) => patch(c.id, c)} />
    </div>
  );
}

function GranteeIcon({ c, small }) {
  const Icon = c.granteeType === 'hospital' ? Building2 : Stethoscope;
  return <span className={cx('pt-ic-tile', c.granteeType === 'hospital' ? 'sky' : 'green', small && 'sm')}><Icon size={small ? 15 : 18} /></span>;
}

function ApproveModal({ consent, onClose, onDone }) {
  const [days, setDays] = useState('30');
  const [scope, setScope] = useState([]);
  const [lastId, setLastId] = useState(null);
  const [run, busy] = useAction();

  if (consent && consent.id !== lastId) { setLastId(consent.id); setScope(consent.scope); setDays('30'); }

  const approve = () => run('approve', async () => {
    const c = await api.post(`/consents/${consent.id}/approve`, { days: Number(days), scope });
    onDone(c);
    onClose();
  }, `Approved for ${days} days. You can revoke any time.`);

  return (
    <Modal open={!!consent} onClose={onClose} title="Share records" subtitle={consent ? `with ${consent.granteeName}` : ''}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy === 'approve'} disabled={!scope.length} onClick={approve}>Approve for {days} days</Button></>}>
      {consent && (
        <div className="stack lg">
          <div className="callout sky"><ShieldCheck /><span>They asked for this because: <strong>{consent.purpose}</strong>. Share only what feels right — you can untick anything.</span></div>
          <Field label="What can they see?">
            <div className="stack" style={{ gap: 10 }}>
              {SCOPES.map((s) => (
                <label key={s.value} className="check">
                  <input type="checkbox" checked={scope.includes(s.value)} onChange={(e) => setScope((v) => (e.target.checked ? [...v, s.value] : v.filter((x) => x !== s.value)))} />
                  {s.label}
                  {!consent.scope.includes(s.value) && <span className="tiny muted">(not requested)</span>}
                </label>
              ))}
            </div>
          </Field>
          <Field label="For how long?" hint="Access switches off on its own when the time is up.">
            <Pills value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function RevokeModal({ consent, onClose, onDone }) {
  const [run, busy] = useAction();
  const revoke = () => run('revoke', async () => {
    const c = await api.post(`/consents/${consent.id}/revoke`);
    onDone(c);
    onClose();
  }, 'Access revoked');
  return (
    <Modal open={!!consent} onClose={onClose} title="Revoke access?" subtitle={consent?.granteeName}
      footer={<><Button variant="ghost" onClick={onClose}>Keep access</Button><Button variant="danger" loading={busy === 'revoke'} onClick={revoke}>Revoke now</Button></>}>
      <p className="mb-0">They won&apos;t be able to open {consent?.scope?.map(scopeLabel).join(', ').toLowerCase()} from this moment. Anything they already wrote in your records stays — that&apos;s your history.</p>
    </Modal>
  );
}
