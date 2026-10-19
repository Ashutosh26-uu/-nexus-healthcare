import { useEffect, useRef, useState } from 'react';
import { ScanLine, Camera, X, ChevronRight, Upload, AlertTriangle } from 'lucide-react';
import { Button, useAction } from '../../components/ui';
import { api } from '../../api';
import { NEXT, STATUS_LABEL, Stepper, TestChips, genderShort } from './shared';
import { detectorFor } from '../../components/BarcodeScanner';

// Any phone or laptop with a camera: the browser's own reader, or the ZXing fallback (components/BarcodeScanner).
const hasDetector = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

// Scan a tube to open its order: USB/Bluetooth scanners type the ID + Enter into the focused field;
// any device with a camera can scan too. The next step is sent with the scanned ID so the
// server refuses a tube that belongs to a different order.
export default function ScanBox({ reload, onReport }) {
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [run, busy] = useAction();
  const inputRef = useRef(null);
  const lookupSeq = useRef(0);

  const lookup = async (raw) => {
    const value = String(raw || '').trim();
    if (!value) return;
    setError('');
    // Clear before the request: a second tube scanned while this lookup is in flight must not be wiped
    // half-typed when it returns (the error names the code that failed).
    setCode('');
    const seq = ++lookupSeq.current;
    try {
      const r = await api.post('/lab/scan', { code: value });
      if (seq !== lookupSeq.current) return; // a newer scan won
      setFound(r.order);
    } catch (e) {
      if (seq !== lookupSeq.current) return;
      setFound(null);
      setError(e.message);
    }
    inputRef.current?.focus();
  };
  const advance = async () => {
    const n = NEXT[found.status];
    const r = await run('adv', () => api.put(`/lab-orders/${found.id}/status`, { status: n.status, sampleId: found.sampleId }), `${n.done} · ${found.sampleId}`);
    if (r) { setFound(r); reload(); inputRef.current?.focus(); }
  };

  return (
    <div className="card lab-scan mb-2">
      <form className="lab-scan-row" onSubmit={(e) => { e.preventDefault(); lookup(code); }}>
        <ScanLine size={20} className="lab-scan-icon" />
        <input ref={inputRef} className="input mono" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan a tube or type its sample ID" aria-label="Sample ID" autoComplete="off" spellCheck={false} />
        <Button type="submit" size="sm" disabled={!code.trim()}>Open</Button>
        {hasDetector && <Button type="button" size="sm" variant="secondary" icon={Camera} onClick={() => setCamera(true)}>Camera</Button>}
      </form>
      {error && <div className="callout rose tiny mt-1" role="alert"><AlertTriangle size={14} /> <span>{error}</span></div>}
      {found && (
        <div className="lab-scan-found fade-in">
          <div className="row between wrap" style={{ gap: 8 }}>
            <div>
              <strong translate="no">{found.patientName}</strong> <span className="small muted">{found.patientAge ?? '—'} {genderShort(found.patientGender)} · <span className="mono">{found.sampleId}</span></span>
              <TestChips tests={found.tests} />
            </div>
            <span className="badge">{STATUS_LABEL[found.status]}</span>
          </div>
          <Stepper order={found} compact />
          <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <Button size="sm" variant="ghost" icon={X} onClick={() => setFound(null)}>Close</Button>
            {found.status === 'processing' && <Button size="sm" variant="clay" icon={Upload} onClick={() => onReport(found)}>Enter results</Button>}
            {NEXT[found.status] && found.status !== 'ordered' && <Button size="sm" loading={busy === 'adv'} onClick={advance}>{NEXT[found.status].label} <ChevronRight size={16} /></Button>}
          </div>
        </div>
      )}
      {camera && <CameraScan onClose={() => setCamera(false)} onCode={(v) => { setCamera(false); lookup(v); }} />}
    </div>
  );
}

function CameraScan({ onClose, onCode }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState('');
  const onCodeRef = useRef(onCode); // the camera starts once; the latest handler is read on a hit
  useEffect(() => { onCodeRef.current = onCode; });
  useEffect(() => {
    let stream; let timer; let alive = true;
    (async () => {
      try {
        const detector = await detectorFor(['code_128']);
        if (!detector) throw new Error('no barcode reader');
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        // Closed while the permission prompt was open: the cleanup already ran, so stop this stream here.
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (!alive) return;
          try {
            const hits = await detector.detect(videoRef.current);
            if (hits[0]?.rawValue) { onCodeRef.current(hits[0].rawValue); return; }
          } catch { /* frame not ready */ }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        setErr(e?.name === 'NotAllowedError' ? 'Camera permission was refused. Type the ID or use a USB scanner instead.' : 'The camera couldn\'t start here. Type the ID or use a USB scanner instead.');
      }
    })();
    return () => { alive = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="lab-cam">
      {err ? <div className="callout rose tiny"><AlertTriangle size={14} /> <span>{err}</span></div> : <video ref={videoRef} playsInline muted className="lab-cam-video" />}
      <div className="row between mt-1"><span className="tiny muted">Hold the label flat, about a hand away from the camera.</span><Button size="sm" variant="ghost" icon={X} onClick={onClose}>Close</Button></div>
    </div>
  );
}
