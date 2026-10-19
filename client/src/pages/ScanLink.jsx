import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Phone, LogIn, IdCard, FileText, FlaskConical, BadgeCheck, Loader2, CalendarClock, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { PublicPage, Note } from './public/PublicShell';
import { fmtDate, fmtDateTime } from '../components/ui';

// Where a phone camera lands after scanning a Nexus QR.

// /s/p/:id — a Health Passport or emergency card. Signed-in care staff go straight to the patient (their usual
// consent rules apply there); everyone else gets a plain explanation and the emergency number. No patient data
// is ever shown here: the critical details are printed on the card itself.
export function PassportLanding() {
  const { id } = useParams();
  const { user } = useAuth();
  const pid = String(id || '').toUpperCase();
  if (user?.role === 'doctor') return <Navigate to={`/doctor/patients/${encodeURIComponent(pid)}`} replace />;
  if (user?.role === 'hospital_admin') return <Navigate to={`/hospital/reception?q=${encodeURIComponent(pid)}`} replace />;
  return (
    <PublicPage>
      <section className="pb-hero">
        <span className="pb-eyebrow">Nexus Healthcare</span>
        <h1 className="row" style={{ gap: 10 }}><IdCard size={30} /> Health Passport</h1>
        <p className="mono" translate="no" dir="ltr" style={{ fontSize: '1.2rem' }}>{pid}</p>
      </section>
      <div className="stack" style={{ maxWidth: 640 }}>
        <div className="callout rose"><Phone /><span><strong>In an emergency, call 108 now.</strong> The blood group, allergies and conditions are printed on the card itself.</span></div>
        <Note>This code identifies a patient on Nexus Healthcare. Doctors and hospital staff can sign in to open the record — the patient’s consent rules still apply, and every view is logged.</Note>
        {user ? (
          <p className="small muted">You’re signed in as a {user.role.replace('_', ' ')}, which can’t open other patients’ records.</p>
        ) : (
          <Link className="btn" to="/login" state={{ from: `/s/p/${encodeURIComponent(pid)}` }}><LogIn size={16} /> Health worker sign in</Link>
        )}
      </div>
    </PublicPage>
  );
}

// /v/:kind/:token — is this printed prescription / lab report genuine?
export function VerifyDocument() {
  const { kind, token } = useParams();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/verify/${encodeURIComponent(kind)}/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => alive && setState({ loading: false, ok: ok && body.valid, data: body }))
      .catch(() => alive && setState({ loading: false, ok: false, data: { error: 'Couldn’t reach Nexus Healthcare. Check your connection and try again.' } }));
    return () => { alive = false; };
  }, [kind, token]);

  const d = state.data || {};
  const isRx = kind === 'rx';
  return (
    <PublicPage>
      <section className="pb-hero">
        <span className="pb-eyebrow">Document check</span>
        <h1 className="row" style={{ gap: 10 }}>{isRx ? <FileText size={30} /> : <FlaskConical size={30} />} {isRx ? 'Prescription' : 'Lab report'}</h1>
      </section>
      <div className="stack" style={{ maxWidth: 640 }}>
        {state.loading ? (
          <p className="row muted" style={{ gap: 8 }}><Loader2 className="spin" size={18} /> Checking with Nexus Healthcare…</p>
        ) : state.ok ? (
          <div className="card stack" style={{ gap: 10, borderColor: 'var(--green-2)' }}>
            <div className="row" style={{ gap: 10, color: 'var(--green-2)' }}><ShieldCheck size={28} /><h2 className="mb-0" style={{ color: 'var(--green-2)' }}>Genuine — issued on Nexus Healthcare</h2></div>
            <dl className="kv">
              <dt>Document</dt><dd className="mono" translate="no">{d.id}</dd>
              <dt>Issued</dt><dd>{fmtDateTime(d.issuedAt)}</dd>
              <dt>Patient</dt><dd translate="no">{d.patientInitials} <span className="tiny muted">(initials only)</span></dd>
              {isRx ? (
                <>
                  <dt>Doctor</dt><dd translate="no">{d.doctor?.name}{d.doctor?.qualification ? `, ${d.doctor.qualification}` : ''}{d.doctor?.verified && <span className="badge green" style={{ marginInlineStart: 6 }}><BadgeCheck size={12} /> Verified</span>}</dd>
                  {d.doctor?.regNo && <><dt>Registration</dt><dd className="mono" translate="no">{d.doctor.regNo}</dd></>}
                  <dt>Medicines</dt><dd>{d.medicines}</dd>
                  <dt>Status</dt><dd>{d.status === 'dispensed' ? `Already dispensed${d.dispensedAt ? ` on ${fmtDate(d.dispensedAt)}` : ''}` : 'Issued — not yet dispensed through Nexus'}</dd>
                </>
              ) : (
                <>
                  <dt>Lab</dt><dd translate="no">{d.lab?.name}{d.lab?.district ? `, ${d.lab.district}` : ''}{d.lab?.nabl && <span className="badge green" style={{ marginInlineStart: 6 }}>NABL</span>}</dd>
                  <dt>Tests</dt><dd>{(d.tests || []).join(', ') || '—'}</dd>
                  <dt>Status</dt><dd>{d.status === 'reported' ? `Reported${d.reportedAt ? ` on ${fmtDate(d.reportedAt)}` : ''}` : 'In progress — no final report yet'}</dd>
                  {d.signedBy && <><dt>Approved by</dt><dd translate="no">{d.signedBy.name}{d.signedBy.regNo ? ` (Reg ${d.signedBy.regNo})` : ''}</dd></>}
                </>
              )}
            </dl>
            <p className="tiny muted mb-0">Compare these details with the paper in your hand. If anything differs, the paper may have been altered.</p>
          </div>
        ) : (
          <div className="card stack" style={{ gap: 8, borderColor: 'var(--rose)' }}>
            <div className="row" style={{ gap: 10, color: 'var(--rose)' }}><ShieldAlert size={28} /><h2 className="mb-0" style={{ color: 'var(--rose)' }}>Not verified</h2></div>
            <p className="mb-0">{d.error || 'This code doesn’t match any document on Nexus Healthcare.'}</p>
          </div>
        )}
      </div>
    </PublicPage>
  );
}

// /s/v/:id/:code — a visit pass scanned with a phone camera. Reception, the doctor or a kiosk operator who is
// signed in checks the patient in on the spot (the same rules as the scanner at the desk); anyone else is told
// what the pass is and where to show it. The code rotates every 30 s, so a forwarded screenshot soon stops working.
export function VisitLanding() {
  const { id, code } = useParams();
  const { user } = useAuth();
  const payload = `NEXUS-VISIT:${id}:${code}`;
  const staff = ['doctor', 'hospital_admin', 'kiosk_operator'].includes(user?.role);
  const [state, setState] = useState(staff ? 'checking' : 'idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!staff) return undefined;
    let alive = true;
    api.post('/visits/check-in', { payload }).then((r) => { if (alive) { setResult(r); setState('done'); } }).catch((e) => { if (alive) { setError(e.message); setState('error'); } });
    return () => { alive = false; };
  }, [payload, staff]);
  const back = user?.role === 'doctor' ? '/doctor' : user?.role === 'hospital_admin' ? '/hospital/reception' : '/kiosk';
  return (
    <PublicPage>
      <section className="pb-hero">
        <span className="pb-eyebrow">Nexus Healthcare</span>
        <h1 className="row" style={{ gap: 10 }}><CalendarClock size={30} /> Visit pass</h1>
        <p className="mono" translate="no" dir="ltr" style={{ fontSize: '1.2rem' }}>{code}</p>
      </section>
      <div className="stack" style={{ maxWidth: 640 }}>
        {state === 'checking' && <div className="callout"><Loader2 className="spin" /><span>Checking the patient in…</span></div>}
        {state === 'done' && (
          <div className="callout green"><CheckCircle2 /><span><strong translate="no">{result.patientName}</strong> is checked in{result.token ? <> — token <strong>{result.token}</strong></> : null}{result.doctorName ? <> for <span translate="no">{result.doctorName}</span></> : null}. They&apos;ve been told to wait to be called.</span></div>
        )}
        {state === 'error' && <div className="callout rose"><ShieldAlert /><span>{error}</span></div>}
        {staff ? <Link className="btn" to={back}>Back to my screen</Link> : (
          <>
            <Note>This is a patient&apos;s pass for an in-person appointment booked on Nexus Healthcare. <strong>Show it at the reception desk</strong> — they scan it to check you in and give you a token. The 6-digit code above changes every 30 seconds.</Note>
            {user ? <p className="small muted">You&apos;re signed in as a {user.role.replace('_', ' ')}, which can&apos;t check patients in.</p>
              : <Link className="btn" to="/login" state={{ from: `/s/v/${encodeURIComponent(id)}/${code}` }}><LogIn size={16} /> Reception sign in to check in</Link>}
          </>
        )}
      </div>
    </PublicPage>
  );
}
