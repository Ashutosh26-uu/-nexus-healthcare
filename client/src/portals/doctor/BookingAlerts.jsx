import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, Video, Building2, MonitorSmartphone, CalendarClock, FileText, FlaskConical, IndianRupee, ScanLine, Camera, KeyRound, CheckCircle2, History, Pill } from 'lucide-react';
import { api } from '../../api';
import { Avatar, Button, Modal, TriageBadge, fmtDate, fmtDateTime, fmtMoney, useAction } from '../../components/ui';
import { OtpInput } from '../../components/OtpFlow';
import { chime } from '../../components/chime';
import { detectorFor } from '../../components/BarcodeScanner';

const WHERE = {
  video: { icon: Video, label: (c) => `${c.mode === 'audio' ? 'Audio' : c.mode === 'chat' ? 'Chat' : 'Video'} consult` },
  clinic: { icon: Building2, label: (c) => `In person at your ${c.location?.subtype === 'clinic' ? 'clinic' : 'hospital'} — ${c.location?.name}` },
  eclinic: { icon: MonitorSmartphone, label: (c) => `In person at ${c.location?.name}` },
};

// Pops up the moment a patient's payment for a booking with this doctor goes through.
export function NewBookingPopup({ home }) {
  const navigate = useNavigate();
  const [run, busy] = useAction();
  const list = home.data?.newBookings || [];
  const c = list[0];
  const chimed = useRef(new Set());
  useEffect(() => {
    if (!c || chimed.current.has(c.id)) return;
    chimed.current.add(c.id);
    chime([660, 880]); // a soft two-note chime so the doctor notices
  }, [c]);
  if (!c) return null;
  const W = WHERE[c.visitType] || WHERE.video;
  const ack = (open) => run('ack', async () => {
    await api.post(`/consults/${c.id}/ack`);
    home.setData((d) => (d ? { ...d, newBookings: (d.newBookings || []).filter((x) => x.id !== c.id) } : d));
    if (open) navigate(`/doctor/consult/${c.id}`);
  });
  return (
    <Modal open onClose={() => ack(false)} title={<span className="row" style={{ gap: 8 }}><BellRing size={20} className="dr-bell" /> New patient booked</span>}
      subtitle={`${c.forDoctor ? `For ${c.forDoctor} at your clinic · ` : ''}${list.length > 1 ? `${list.length} new bookings — showing the first` : 'Payment received'}`}
      footer={<><Button variant="ghost" loading={busy === 'ack'} onClick={() => ack(false)}>Got it</Button>{!c.forDoctor && <Button onClick={() => ack(true)}>Open patient</Button>}</>}>
      <div className="dr-nb">
        <div className="dr-nb-head">
          <Avatar name={c.patientName} size="lg" />
          <div className="grow">
            <strong className="dr-nb-name" translate="no">{c.patientName}</strong>
            <div className="small muted">{c.patientAge ?? '—'} y · {c.patientGender}{c.patient?.bloodGroup ? ` · ${c.patient.bloodGroup}` : ''}{c.bookingNo ? ` · ${c.bookingNo}` : ''}</div>
          </div>
          <TriageBadge level={c.triage?.level} />
        </div>
        <div className="dr-nb-sym"><span className="tiny muted">Symptoms{c.triage?.symptomDays != null ? ` · for ${c.triage.symptomDays === 0 ? 'less than a day' : `${c.triage.symptomDays} day${c.triage.symptomDays > 1 ? 's' : ''}`}` : ''}</span><p className="mb-0">“{c.triage?.symptoms || '—'}”</p></div>
        {(c.patient?.allergies?.length > 0 || c.patient?.currentMeds?.length > 0 || c.patient?.conditions?.length > 0) && (
          <div className="dr-nb-flags small">
            {c.patient.allergies?.length > 0 && <span className="badge rose">Allergic: {c.patient.allergies.join(', ')}</span>}
            {c.patient.conditions?.map((x) => <span key={x} className="badge">{x}</span>)}
            {c.patient.currentMeds?.length > 0 && <span className="badge sky">Taking: {c.patient.currentMeds.join(', ')}</span>}
          </div>
        )}
        <div className="dr-nb-grid">
          <div><W.icon size={16} /><span><span className="tiny muted block">Where</span><strong className="small" translate="no">{W.label(c)}</strong></span></div>
          <div><CalendarClock size={16} /><span><span className="tiny muted block">When</span><strong className="small">{c.scheduledAt ? fmtDateTime(c.scheduledAt) : 'Now — in your queue'}</strong></span></div>
          <div><IndianRupee size={16} /><span><span className="tiny muted block">Paid online</span><strong className="small">{fmtMoney(c.fee)}{c.payAtClinic ? ` + ${fmtMoney(c.payAtClinic)} at clinic` : ''}</strong></span></div>
        </div>
        <div>
          <span className="tiny muted">Seen before?</span>
          {c.previousVisits?.length ? (
            <ul className="dr-nb-reports">
              {c.previousVisits.map((v, i) => <li key={i}><History size={14} /> {fmtDate(v.date)} · {v.withYou ? <strong>with you</strong> : <span translate="no">{v.doctorName}</span>}{v.diagnosis ? ` — ${v.diagnosis}` : ''}</li>)}
            </ul>
          ) : <p className="small muted mb-0">First visit on Nexus — no previous consultations.</p>}
        </div>
        {c.pastPrescriptions?.length > 0 && (
          <div>
            <span className="tiny muted">Recent prescriptions</span>
            <ul className="dr-nb-reports">{c.pastPrescriptions.map((r, i) => <li key={i}><Pill size={14} /> {fmtDate(r.date)} · <span translate="no">{r.doctorName}</span>: {r.items.join(', ')}</li>)}</ul>
          </div>
        )}
        <div>
          <span className="tiny muted">Past reports</span>
          {c.pastReports?.length ? (
            <ul className="dr-nb-reports">
              {c.pastReports.map((r, i) => <li key={i}>{r.kind === 'lab' ? <FlaskConical size={14} /> : <FileText size={14} />} {r.title}{r.flagged && <span className="badge rose tiny">abnormal</span>}{r.date && <span className="tiny muted"> · {fmtDate(r.date)}</span>}</li>)}
            </ul>
          ) : <p className="small muted mb-0">No past reports uploaded.</p>}
        </div>
        {c.mode === 'in_person' && <p className="tiny muted mb-0"><ScanLine size={12} style={{ verticalAlign: '-2px' }} /> The patient will show a live QR at reception — use <strong>Check in patient</strong> to scan it.</p>}
      </div>
    </Modal>
  );
}

// Scan the patient's live visit QR (camera) or type the 6-digit code under it.
export function CheckInModal({ open, onClose, onCheckedIn }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [run, busy] = useAction();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canScan = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia; // native reader or the ZXing fallback

  const openRef = useRef(open); // read after awaits: the modal may have closed (or unmounted) meanwhile
  const timerRef = useRef(null);
  const stop = () => { clearTimeout(timerRef.current); streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setScanning(false); };
  useEffect(() => {
    openRef.current = open;
    if (!open) { stop(); setCode(''); setError(''); setDone(null); }
    return () => { openRef.current = false; stop(); };
  }, [open]);

  const submit = (body) => run('checkin', async () => {
    setError('');
    try {
      const c = await api.post('/visits/check-in', body);
      stop(); setDone(c); onCheckedIn?.(c);
    } catch (e) { stop(); setError(e.message); setCode(''); throw e; } // the detect loop has ended, so release the camera and show the scan button again
  });

  const scan = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      // Closed while the permission prompt was up: release the camera instead of leaving it on in the background.
      if (!openRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      stop();
      streamRef.current = stream; setScanning(true);
      await new Promise((r) => setTimeout(r, 50));
      if (videoRef.current && streamRef.current === stream) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const detector = await detectorFor(['qr_code']);
      if (!detector) throw new Error('no QR reader');
      // ~4 reads a second is plenty for a QR held up to the camera; every animation frame just burns battery.
      const tick = async () => {
        if (streamRef.current !== stream || !videoRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          const hit = found.find((f) => /^NEXUS-VISIT:/.test(f.rawValue));
          if (hit) { submit({ payload: hit.rawValue }); return; }
        } catch { /* keep trying */ }
        if (streamRef.current === stream) timerRef.current = setTimeout(tick, 250);
      };
      tick();
    } catch { setError('Camera not available — type the 6-digit code instead.'); stop(); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Check in a patient" subtitle="Scan the live QR on the patient's phone, or type the 6-digit code under it."
      footer={done ? <Button onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Close</Button><Button icon={KeyRound} disabled={code.length !== 6} loading={busy === 'checkin'} onClick={() => submit({ code })}>Check in</Button></>}>
      {done ? (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <CheckCircle2 size={42} color="var(--green-2)" />
          <h3 className="mb-0" translate="no">{done.patientName}</h3>
          <p className="small muted mb-0">Checked in · now in your queue. {done.triage?.symptoms}</p>
        </div>
      ) : (
        <div className="stack">
          {scanning ? (
            <div className="dr-scan"><video ref={videoRef} playsInline muted /><span className="dr-scan-frame" /></div>
          ) : canScan ? <Button variant="secondary" icon={Camera} onClick={scan}>Scan QR with camera</Button> : null}
          <div className="tiny muted center">{canScan ? 'or type the code' : 'Type the code shown under the QR'}</div>
          <div style={{ maxWidth: 380, margin: '0 auto' }}><OtpInput value={code} onChange={setCode} /></div>
          {error && <div className="form-error">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
