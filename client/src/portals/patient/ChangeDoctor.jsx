import { useEffect, useRef, useState } from 'react';
import { Repeat, Stethoscope, ArrowRight, ArrowLeft, ShieldCheck, Check, FileText, FlaskConical, ClipboardList, Copy as CopyIcon, History } from 'lucide-react';
import { api } from '../../api';
import { Avatar, Button, Card, Empty, Field, cx, fmtDate, useToast } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, usePatientLive, PageSkeleton } from './shared';
import NearbyDoctors from './NearbyDoctors';
import BookingFlow from './BookingFlow';

// Change doctor. Only the patient starts it: pick the doctor you're leaving, find a new one anywhere in
// your country (the 20 km filter is lifted), and a full copy of your record goes to the new doctor and
// their hospital / clinic. Your previous doctor keeps a read-only copy up to today.
export default function ChangeDoctor() {
  const { patient } = usePatient();
  const toast = useToast();
  // Live: a finished visit adds that doctor here, and a transfer shows up in the history, without a refresh.
  const live = usePatientLive('/patient/transfers', ['consults', 'consents', 'records', 'doctors']);
  const data = live.data ? { currentDoctors: live.data.currentDoctors || [], transfers: live.data.transfers || [], counts: live.data.counts || {} } : null;
  const [step, setStep] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(null);
  const [reason, setReason] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [book, setBook] = useState(null);

  // Pre-select the most recent doctor once per profile; later live refreshes never override the patient's pick.
  const firstDoc = data?.currentDoctors[0]?.id || '';
  const picked = useRef(false);
  useEffect(() => { picked.current = false; setFrom(''); }, [patient?.id]);
  useEffect(() => { if (!picked.current && firstDoc) { picked.current = true; setFrom(firstDoc); } }, [firstDoc]);
  if (live.error && !data) return <Empty title="We couldn't load your doctors">{live.error}</Empty>;
  if (!data) return <PageSkeleton />;
  const fromDoc = data.currentDoctors.find((x) => x.id === from);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post('/patient/transfers', { fromDoctorId: from || undefined, toDoctorId: to.id, reason });
      setDone(r); toast('Records transferred'); live.reload();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Your care, your choice" title="Change your doctor"
        subtitle="Move to any doctor, hospital or clinic in your country. A full copy of your records goes with you — your previous doctor keeps only what they had until today." />

      {done ? (
        <Card className="center">
          <div className="stack" style={{ alignItems: 'center' }}>
            <div className="success-burst"><Check /></div>
            <h3 className="mb-0">Your records are now with <span translate="no">{done.doctor.name}</span></h3>
            <p className="small muted mb-0">{done.transfer.copied.visits} visits · {done.transfer.copied.prescriptions} prescriptions · {done.transfer.copied.reports} reports copied{done.doctor.facility ? <> to <span translate="no">{done.doctor.facility}</span></> : ''}.</p>
            <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
              <Button icon={Stethoscope} onClick={() => setBook(to)}>Book with <span translate="no">{to?.name}</span></Button>
              <Button variant="ghost" onClick={() => { setDone(null); setStep(0); setTo(null); setAgree(false); setReason(''); }}>Done</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="steps">{['Current doctor', 'New doctor', 'Confirm'].map((s, i) => <span key={s} className={cx(i <= step && 'done')} />)}</div>

          {step === 0 && (
            <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Stethoscope size={17} />Which doctor are you moving from?</h4>}>
              <div className="pt-cd-list">
                {data.currentDoctors.map((d) => (
                  <button type="button" key={d.id} className={cx('pt-bk-type', from === d.id && 'on')} onClick={() => setFrom(d.id)}>
                    <Avatar name={d.name} size="sm" /><span><strong translate="no">{d.name}</strong><span className="tiny muted block">{d.specialty}{d.facility ? ` · ${d.facility}` : ''} · last visit {fmtDate(d.lastVisit)}</span></span>
                  </button>
                ))}
                <button type="button" className={cx('pt-bk-type', !from && 'on')} onClick={() => setFrom('')}>
                  <Repeat /><span><strong>I don&apos;t have a doctor on Sehatra</strong><span className="tiny muted block">Just share my records with a new doctor</span></span>
                </button>
              </div>
              <div className="row mt-2" style={{ justifyContent: 'flex-end' }}><Button icon={ArrowRight} onClick={() => setStep(1)}>Find a new doctor</Button></div>
            </Card>
          )}

          {step === 1 && (
            <>
              <NearbyDoctors full defaultScope="all" excludeId={from || undefined} symptoms={patient?.currentSymptoms?.text || ''} title="Choose your new doctor" onPick={(d) => { setTo(d); setStep(2); }} pickLabel="Move to this doctor" />
              <div><Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(0)}>Back</Button></div>
            </>
          )}

          {step === 2 && to && (
            <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><CopyIcon size={17} />Confirm the transfer</h4>}>
              <div className="pt-cd-move">
                <div><span className="tiny muted">From</span><strong translate="no">{fromDoc?.name || '—'}</strong>{fromDoc && <span className="tiny muted">keeps a read-only copy up to today</span>}</div>
                <ArrowRight className="muted" />
                <div><span className="tiny muted">To</span><strong translate="no">{to.name}</strong><span className="tiny muted">{to.specialty}{to.facility?.name ? ` · ${to.facility.name}` : ''}</span></div>
              </div>
              <div className="pt-cd-copy">
                <span><ClipboardList size={15} /> {data.counts.visits ?? 0} visits</span>
                <span><FileText size={15} /> {data.counts.prescriptions ?? 0} prescriptions</span>
                <span><FlaskConical size={15} /> {data.counts.reports ?? 0} reports</span>
              </div>
              <Field label="Reason (optional)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. closer to home, second opinion" /></Field>
              <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I want a full copy of my health record — history, prescriptions, reports and uploads — shared with <strong translate="no">{to.name}</strong>{to.facility?.name ? <> and <span translate="no">{to.facility.name}</span></> : ''} for one year. I can withdraw it any time in “Who sees my data”.</span>
              </label>
              {error && <div className="form-error">{error}</div>}
              <div className="row between mt-1">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(1)}>Choose someone else</Button>
                <Button variant="clay" icon={ShieldCheck} disabled={!agree} loading={busy} onClick={submit}>Transfer my records</Button>
              </div>
            </Card>
          )}
        </>
      )}

      {data.transfers.length > 0 && (
        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><History size={17} />Past transfers</h4>}>
          <div className="pt-fu-list">
            {data.transfers.map((t) => (
              <div key={t.id} className="pt-fu-row">
                <Repeat size={16} className="muted" />
                <div className="grow"><strong className="small" translate="no">{t.fromName || 'New'} → {t.toName}</strong><div className="tiny muted">{fmtDate(t.at)} · {t.copied.visits} visits, {t.copied.prescriptions} prescriptions, {t.copied.reports} reports{t.reason ? ` · ${t.reason}` : ''}</div></div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <BookingFlow doctor={book} onClose={() => setBook(null)} />
    </div>
  );
}
