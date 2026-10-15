import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// A real, scannable QR code (rendered as crisp SVG). The SVG string is produced by the qrcode
// library from our own value, so it is safe to inline.
export default function QR({ value, size = 168, label, className, color = '#1d2b2a' }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    if (!value) { setSvg(''); return undefined; }
    QRCode.toString(String(value), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: color, light: '#ffffff' } })
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
