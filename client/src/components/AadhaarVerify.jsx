import { useRef, useState } from 'react';
import { BadgeCheck, Camera, Fingerprint, ImageUp, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import { Modal, Button } from './ui';
import BarcodeScanner, { canScanQr, decodeQrFrom } from './BarcodeScanner';

// Aadhaar Secure QR check — an optional trust badge, never required for anything.
// Consent first (plain words: what is read, what is kept), then scan the card's QR or upload a photo/screenshot.
// The QR text goes to our server once for UIDAI's signature check and is never kept here (no state after submit,
// no storage). The server keeps only: verified, last 4 digits, year of birth, gender and a name-match flag.

// Small "Aadhaar verified" badge. `admin` also shows the name-match result for review.
export function AadhaarBadge({ v, admin = false }) {
  if (!v?.verified) return null;
  return (
    <span className="row wrap" style={{ gap: 6, display: 'inline-flex' }}>
      <span className="badge green" title={`Aadhaar XXXX XXXX ${v.last4}${v.yob ? ` · born ${v.yob}` : ''}`}><BadgeCheck /> Aadhaar verified</span>
      {admin && v.nameMatch === 'mismatch' && <span className="badge rose"><TriangleAlert /> Name on Aadhaar differs</span>}
      {admin && v.nameMatch === 'close' && <span className="badge sun">Name: close match</span>}
    </span>
  );
}

// Full-width buttons via style: the shared `.block` utility in patient.css / doctor.css turns a .btn into display:block.
const FULL = { width: '100%' };
const summary = (v) => `XXXX XXXX ${v.last4}${v.yob ? ` · born ${v.yob}` : ''}`;

// target: a patient id (kiosk / reception / family profile); omit for "my own Aadhaar".
// forPatient: staff are scanning someone else's card — the wording changes and they confirm the patient agreed.
export default function AadhaarVerify({ target, forPatient = false, verification, onVerified, label = 'Verify with Aadhaar QR (optional)', size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('consent'); // consent → choose → reading/checking → done
  const [agree, setAgree] = useState(false);
  const [scan, setScan] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const v = result || verification;

  const start = () => { setStep('consent'); setAgree(false); setError(''); setResult(null); setOpen(true); };
  const close = () => { setScan(false); setOpen(false); };

  const submit = async (qr) => {
    setScan(false); setStep('checking'); setError('');
    try {
      const r = await api.post('/identity/aadhaar-qr', { qr, consent: true, ...(target ? { target } : {}) });
      setResult(r); setStep('done'); onVerified?.(r);
    } catch (e) { setError(e.message); setStep('choose'); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose a photo or screenshot (JPG or PNG). For an e-Aadhaar PDF, take a screenshot of its QR first.'); return; }
    setStep('reading'); setError('');
    try {
      const bmp = await createImageBitmap(file);
      // 2400 px is plenty for the densest Aadhaar QR and keeps older phones responsive.
      const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const text = await decodeQrFrom(bmp, bmp.width * k, bmp.height * k);
      bmp.close?.();
      if (!text) { setError('We couldn\'t find a QR in that picture. Crop close to the big QR, keep it sharp and flat, and try again.'); setStep('choose'); return; }
      await submit(text);
    } catch {
      setError('We couldn\'t open that picture. Try another photo or screenshot.'); setStep('choose');
    }
  };

  return (
    <>
      {v?.verified ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <AadhaarBadge v={v} />
          <span className="tiny muted mono" dir="ltr">{summary(v)}</span>
          <button type="button" className="link-btn tiny" onClick={start}>Check again</button>
        </div>
      ) : (
        <Button type="button" variant="ghost" size={size} icon={ShieldCheck} onClick={start}>{label}</Button>
      )}

      <Modal open={open && !scan} onClose={close} title="Verify with Aadhaar QR" subtitle="Optional — a trust badge, never needed for care."
        footer={step === 'consent' ? (
          <>
            <Button type="button" variant="ghost" onClick={close}>Not now</Button>
            <Button type="button" disabled={!agree} onClick={() => setStep('choose')}>Continue</Button>
          </>
        ) : <Button type="button" variant="ghost" onClick={close}>{step === 'done' ? 'Done' : 'Cancel'}</Button>}>
        {step === 'consent' && (
          <div className="stack">
            <div className="callout sky"><Fingerprint /><span className="small">{forPatient
              ? 'We read the QR printed on the patient\'s Aadhaar card or e-Aadhaar and check UIDAI\'s digital signature. That proves the card is genuine — no Aadhaar number is typed and nothing is sent to UIDAI.'
              : 'We read the QR printed on your Aadhaar card or e-Aadhaar and check UIDAI\'s digital signature. That proves the card is genuine — no Aadhaar number is typed and nothing is sent to UIDAI.'}</span></div>
            <div className="small">
              <strong>What we keep</strong>
              <ul style={{ margin: '6px 0 0', paddingInlineStart: 20 }}>
                <li>Only &lsquo;verified&rsquo;, the last 4 digits, the year of birth and gender.</li>
                <li>Whether the name on the card matches the name on this profile (yes / close / no) — not the name itself.</li>
              </ul>
              <strong className="mt-1" style={{ display: 'block' }}>What we never keep</strong>
              <ul style={{ margin: '6px 0 0', paddingInlineStart: 20 }}>
                <li>The QR, the photo, the address, the full date of birth, or the mobile number and email linked to Aadhaar.</li>
              </ul>
            </div>
            <p className="tiny muted mb-0">The QR is sent securely to Sehatra only for this one check, then thrown away. This is optional — everything on Sehatra works without it.</p>
            <label className="check small">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              {forPatient ? 'The patient has agreed to this Aadhaar check.' : 'I agree to this one-time Aadhaar check.'}
            </label>
          </div>
        )}

        {step === 'choose' && (
          <div className="stack">
            {error && <div className="callout rose"><TriangleAlert /><span className="small">{error}</span></div>}
            {canScanQr() && <Button type="button" style={FULL} icon={Camera} onClick={() => { setError(''); setScan(true); }}>Scan the QR on the Aadhaar card</Button>}
            <Button type="button" style={FULL} variant="ghost" icon={ImageUp} onClick={() => fileRef.current?.click()}>Upload a photo / e-Aadhaar screenshot</Button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            <p className="tiny muted mb-0">Use the big QR on the Aadhaar letter, PVC card or e-Aadhaar (download a new one at myaadhaar.uidai.gov.in if yours is old). Good light, the whole QR in view, no glare.</p>
          </div>
        )}

        {(step === 'reading' || step === 'checking') && (
          <p className="small mb-0" role="status">{step === 'reading' ? 'Reading the QR from your picture…' : 'Checking UIDAI\'s signature…'}</p>
        )}

        {step === 'done' && result && (
          <div className="stack" role="status">
            <div className="callout green"><BadgeCheck /><span><strong>Aadhaar verified ✓</strong> · <span className="mono" dir="ltr">{summary(result)}</span></span></div>
            {result.nameMatch === 'mismatch' && <div className="callout"><TriangleAlert /><span className="small">The name on the card looks different from the name on this profile. The card is genuine; our team may check the name with you.</span></div>}
            {result.nameMatch === 'close' && <p className="tiny muted mb-0">The name on the card is a close match to the name on this profile.</p>}
          </div>
        )}
      </Modal>

      <BarcodeScanner open={open && scan} qrOnly onClose={() => setScan(false)} onResult={submit}
        title="Scan the Aadhaar QR" subtitle="Hold the big QR on the card inside the frame, close and steady — it scans by itself." />
    </>
  );
}
