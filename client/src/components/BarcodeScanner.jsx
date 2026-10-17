import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Modal, Button } from './ui';

const WANTED = ['data_matrix', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
export const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
// QR codes only: iPhone Safari has no BarcodeDetector, so QR scanning falls back to jsQR (lazy-loaded) on video frames.
export const canScanQr = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

// Decode a QR from an image / canvas / bitmap. BarcodeDetector first (fast, native); jsQR otherwise or if it missed.
// Dense codes (Aadhaar) read better at a few scales, so the jsQR pass tries the full size, then smaller ones.
export async function decodeQrFrom(source, w, h) {
  if ('BarcodeDetector' in window) {
    try {
      const formats = (await window.BarcodeDetector.getSupportedFormats?.()) || ['qr_code'];
      if (formats.includes('qr_code')) {
        const hit = (await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(source))[0]?.rawValue;
        if (hit) return hit;
      }
    } catch { /* fall through to jsQR */ }
  }
  const { default: jsQR } = await import('jsqr');
  for (const scale of [1, 0.75, 0.5]) {
    const cw = Math.round(w * scale); const ch = Math.round(h * scale);
    if (cw < 200 || ch < 200) break;
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, cw, ch);
    const hit = jsQR(ctx.getImageData(0, 0, cw, ch).data, cw, ch, { inversionAttempts: 'attemptBoth' });
    if (hit?.data) return hit.data;
  }
  return null;
}

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
// `qrOnly` (Aadhaar and other dense QRs): asks for the sharpest camera and works without BarcodeDetector via jsQR.
export default function BarcodeScanner({ open, onClose, onResult, title = 'Scan the barcode', subtitle = 'Hold the barcode or square code inside the frame — it scans by itself.', qrOnly = false }) {
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
        const native = 'BarcodeDetector' in window;
        const supported = native ? (await window.BarcodeDetector.getSupportedFormats?.()) || WANTED : [];
        const wanted = qrOnly ? ['qr_code'] : WANTED;
        const detector = native && wanted.some((f) => supported.includes(f)) ? new window.BarcodeDetector({ formats: wanted.filter((f) => supported.includes(f)) }) : null;
        if (!detector && !qrOnly) throw new Error('unsupported');
        stream = await navigator.mediaDevices.getUserMedia({ video: qrOnly ? { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } : { facingMode: 'environment' } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const v = videoRef.current;
            const raw = detector ? (await detector.detect(v))[0]?.rawValue : await decodeQrFrom(v, v.videoWidth, v.videoHeight);
            if (raw && !stopped) { stopped = true; resultRef.current(raw); return; }
          } catch { /* a frame that couldn't be read — try the next one */ }
          timer = setTimeout(tick, detector ? 250 : 400);
        };
        tick();
      } catch (e) {
        setError(e?.name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for this site, or type the code instead.' : 'Couldn\'t start the camera on this device. Please type the code instead.');
      }
    })();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [open, qrOnly]);

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      {error ? <div className="callout rose"><Camera /><span className="small">{error}</span></div> : (
        <div className="bc-scan">
          <video ref={videoRef} playsInline muted aria-label="Camera preview" />
          <span className="bc-frame" aria-hidden="true" />
        </div>
      )}
    </Modal>
  );
}
