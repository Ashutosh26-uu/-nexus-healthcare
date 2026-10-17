import { useEffect, useState } from 'react';

// The encoder is fetched the first time a QR is drawn, so pages that merely import this (Home's passport card,
// booking) don't carry it in their own chunk. The box keeps its size meanwhile, so nothing shifts.
let qrLib = null;
const loadQr = () => (qrLib ||= import('qrcode').then((m) => m.default || m).catch((e) => { qrLib = null; throw e; }));

// A real, scannable QR code (rendered as crisp SVG). The SVG string is produced by the qrcode
// library from our own value, so it is safe to inline.
export default function QR({ value, size = 168, label, className, color = '#1d2b2a' }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    if (!value) { setSvg(''); return undefined; }
    loadQr().then((QRCode) => QRCode.toString(String(value), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: color, light: '#ffffff' } }))
      .then((s) => alive && setSvg(s)).catch(() => alive && setSvg(''));
    return () => { alive = false; };
  }, [value, color]);
  return (
    <span
      className={className ? `qr ${className}` : 'qr'}
      role="img"
      aria-label={label || 'QR code'}
      style={{ display: 'inline-block', width: size, height: size, background: '#fff', borderRadius: 8, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', `<svg width="${size}" height="${size}" `) }}
    />
  );
}
