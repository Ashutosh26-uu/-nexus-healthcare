import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Modal, Button } from './ui';

const WANTED = ['data_matrix', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
export const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

// Indian medicine packs carry GS1 codes: (01) GTIN, (17) expiry, (10) batch, (21) unique serial.
// The "code under the barcode" a patient would type is the serial — fall back to the batch, then the raw text.
export function packCodeFrom(raw) {
  const s = String(raw || '').replace(/^\]d2|^\]Q3/, '').replace(/[()]/g, '');
  if (!/^01\d{14}/.test(s)) return String(raw || '').trim();
  const GS = '\u001d';
  const fields = {};
  let i = 0;
  while (i < s.length) {
    const ai = s.slice(i, i + 2);
    if (ai === '01') { fields['01'] = s.slice(i + 2, i + 16); i += 16; continue; }
    if (ai === '17' || ai === '11') { fields[ai] = s.slice(i + 2, i + 8); i += 8; continue; }
    if (ai === '10' || ai === '21') {
      const end = s.indexOf(GS, i + 2);
      fields[ai] = s.slice(i + 2, end === -1 ? undefined : end);
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    break;
  }
  return fields['21'] || fields['10'] || String(raw).trim();
}

// Full-screen camera scanner. onResult(text) gets the raw barcode text; the caller decides what to do with it.
export default function BarcodeScanner({ open, onClose, onResult, title = 'Scan the barcode' }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const resultRef = useRef(onResult); // the camera must not restart just because the parent re-rendered
  resultRef.current = onResult;

  useEffect(() => {
    if (!open) return undefined;
    let stream = null;
    let stopped = false;
    let timer = null;
    setError('');
    (async () => {
      try {
        const supported = (await window.BarcodeDetector.getSupportedFormats?.()) || WANTED;
        const detector = new window.BarcodeDetector({ formats: WANTED.filter((f) => supported.includes(f)) });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const hits = await detector.detect(videoRef.current);
            if (hits[0]?.rawValue) { stopped = true; resultRef.current(hits[0].rawValue); return; }
          } catch { /* a frame that couldn't be read — try the next one */ }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        setError(e?.name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for this site, or type the code instead.' : 'Couldn\'t start the camera on this device. Please type the code instead.');
      }
    })();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle="Hold the barcode or square code inside the frame — it scans by itself." footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      {error ? <div className="callout rose"><Camera /><span className="small">{error}</span></div> : (
        <div className="bc-scan">
          <video ref={videoRef} playsInline muted aria-label="Camera preview" />
          <span className="bc-frame" aria-hidden="true" />
        </div>
      )}
    </Modal>
  );
}
