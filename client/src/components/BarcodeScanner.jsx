import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Modal, Button } from './ui';

const WANTED = ['data_matrix', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
// Any device with a camera can scan: the browser's own BarcodeDetector when it reads these formats (Android
// Chrome), otherwise an open-source ZXing decoder loaded only when needed, its wasm served from this site.
export const canScan = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

let ponyfill = null;
async function zxingDetector(formats) {
  if (!ponyfill) {
    ponyfill = Promise.all([import('barcode-detector/ponyfill'), import('zxing-wasm/reader/zxing_reader.wasm?url')]).then(([m, wasm]) => {
      m.prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasm.default : prefix + path) } });
      return m.BarcodeDetector;
    });
  }
  const Ctor = await ponyfill;
  return new Ctor({ formats });
}
// The best detector for these formats on this device, or null when none can be had.
export async function detectorFor(formats) {
  if ('BarcodeDetector' in window) {
    try {
      const supported = (await window.BarcodeDetector.getSupportedFormats?.()) || [];
      const ok = formats.filter((f) => supported.includes(f));
      // Native when it reads everything we want (1-D packs need more than QR, which many desktops only do).
      if (ok.length === formats.length) return new window.BarcodeDetector({ formats: ok });
    } catch { /* use ZXing */ }
  }
  try { return await zxingDetector(formats); } catch { return null; }
}

// GS1 expiry YYMMDD with day 00 means "end of that month".
const monthEnd = (v) => String(new Date(Date.UTC(2000 + Number(v.slice(0, 2)), Number(v.slice(2, 4)), 0)).getUTCDate()).padStart(2, '0');

// GS1 YYMMDD → ISO date, or null for a month outside 01–12 (a misread must not become an impossible date).
const gs1Date = (v) => {
  if (!/^\d{6}$/.test(v)) return null;
  const mm = Number(v.slice(2, 4));
  if (mm < 1 || mm > 12) return null;
  const dd = v.slice(4, 6);
  if (dd !== '00' && (Number(dd) < 1 || Number(dd) > Number(monthEnd(v)))) return null;
  return `20${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6) === '00' ? monthEnd(v) : v.slice(4, 6)}`;
};
// Fixed 6-digit date fields: (11) production, (12) due, (13) packaging, (15) best before, (16) sell by, (17) expiry.
const DATE_AIS = new Set(['11', '12', '13', '15', '16', '17']);

// What a GS1 medicine pack's code holds: (01) GTIN, (17) expiry YYMMDD, (10) batch, (21) serial.
export function packFieldsFrom(raw) {
  const text = String(raw || '').trim();
  // Printed form "(01)…(17)…(10)…(21)…": the brackets mark where each field starts and ends.
  if (/^\(01\)\d{14}/.test(text)) {
    const f = {};
    for (const [, ai, v] of text.matchAll(/\((\d{2})\)([^(]*)/g)) {
      if (ai === '01') f.gtin = v; else if (ai === '10') f.batch = v.trim(); else if (ai === '21') f.serial = v.trim();
      else if (ai === '17') { const d = gs1Date(v); if (d) f.expiry = d; }
    }
    return { raw: text, ...f };
  }
  const s = text.replace(/^\]d2|^\]Q3|^\]C1/, '').replace(/[()]/g, '');
  if (!/^01\d{14}/.test(s)) return { raw: text };
  const GS = '\u001d';
  const f = {};
  let i = 0;
  while (i < s.length) {
    const ai = s.slice(i, i + 2);
    if (ai === '01') { f.gtin = s.slice(i + 2, i + 16); i += 16; continue; }
    if (DATE_AIS.has(ai)) { if (ai === '17') { const d = gs1Date(s.slice(i + 2, i + 8)); if (d) f.expiry = d; } i += 8; continue; }
    if (ai === '10' || ai === '21') {
      const end = s.indexOf(GS, i + 2);
      f[ai === '10' ? 'batch' : 'serial'] = s.slice(i + 2, end === -1 ? undefined : end);
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    break;
  }
  return { raw: text, ...f };
}
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
// Sehatra looks packs up by batch (what chemists enter in stock) — fall back to the serial, then the raw text.
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
  return fields['10'] || fields['21'] || String(raw).trim(); // the batch is what chemists list in their stock
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
        const detector = await detectorFor(qrOnly ? ['qr_code'] : WANTED);
        if (!detector && !qrOnly) throw new Error('unsupported');
        if (stopped) return;
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
