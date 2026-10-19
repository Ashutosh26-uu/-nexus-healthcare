import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Lock, AlertTriangle, Droplet, Phone } from 'lucide-react';
import { api } from '../api';
import { parseScan } from '../scanLinks';
import BarcodeScanner, { canScanQr } from './BarcodeScanner';
import { Button, Modal, useToast } from './ui';

// One camera button for doctors and hospital desks: reads a patient's Health Passport / emergency card, a
// visit pass, or an emergency capsule, and does the right thing with each. `onPatient(id)` and
// `onVisit(checkedIn)` let a screen handle those itself; otherwise patients open in the doctor's records.
export default function StaffScan({ onPatient, onVisit, label = 'Scan a patient QR', size = 'sm', variant = 'secondary', block }) {
  const [open, setOpen] = useState(false);
  const [capsule, setCapsule] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  if (!canScanQr()) return null;

  const handle = async (raw) => {
    setOpen(false);
    const s = parseScan(raw);
    try {
      setBusy(true);
      if (s.type === 'patient') {
        if (onPatient) onPatient(s.id); else navigate(`/doctor/patients/${encodeURIComponent(s.id)}`);
      } else if (s.type === 'visit') {
        const c = await api.post('/visits/check-in', { payload: s.payload });
        toast(`${c.patientName || 'Patient'} checked in`);
        onVisit?.(c);
      } else if (s.type === 'capsule') {
        const r = await api.post('/capsule/open', { capsuleId: s.id, key: s.key, reason: 'Opened by scanning the emergency capsule QR' });
        setCapsule(r.patient);
      } else if (s.type === 'verify') {
        navigate(s.path);
      } else {
        toast('That isn’t a Nexus Healthcare patient code. Try the QR on the Health Passport or emergency card.', 'error');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size={size} variant={variant} block={block} icon={ScanLine} loading={busy} onClick={() => setOpen(true)}>{label}</Button>
      <BarcodeScanner open={open} onClose={() => setOpen(false)} onResult={handle} qrOnly
        title="Scan the patient’s QR" subtitle="Health Passport, emergency card, visit pass or emergency capsule — hold it inside the frame." />
      <Modal open={!!capsule} onClose={() => setCapsule(null)} title={<span className="row" style={{ gap: 8 }}><Lock size={18} /> Emergency capsule</span>}
        subtitle="Opened for emergency care. The patient has been told, and this is logged.">
        {capsule && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="row between wrap">
              <strong className="notranslate" translate="no" style={{ fontSize: '1.1rem' }}>{capsule.name}</strong>
              <span className="badge rose"><Droplet size={12} /> {capsule.bloodGroup || 'Blood group not recorded'}</span>
            </div>
            <div className="callout rose"><AlertTriangle /><span><strong>Allergies:</strong> {capsule.allergies?.length ? capsule.allergies.join(', ') : 'None recorded'}</span></div>
            <div className="small"><strong>Conditions:</strong> {capsule.conditions?.length ? capsule.conditions.join(', ') : 'None recorded'}</div>
            <div className="small"><strong>Current medicines:</strong> {capsule.currentMeds?.length ? capsule.currentMeds.join(', ') : 'None recorded'}</div>
            {capsule.emergencyContacts?.length > 0 && (
              <div className="small"><strong>Emergency contacts:</strong>
                {capsule.emergencyContacts.map((c, i) => (
                  <div key={i} className="row" style={{ gap: 6 }}><Phone size={13} /> <span translate="no">{c.name}{c.relation ? ` (${c.relation})` : ''}</span>{c.phone && <a href={`tel:${c.phone}`} translate="no">{c.phone}</a>}</div>
                ))}
              </div>
            )}
            <p className="tiny muted mb-0">Sealed {capsule.generatedAt ? new Date(capsule.generatedAt).toLocaleString() : ''} — confirm anything critical with the patient or family when you can.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
