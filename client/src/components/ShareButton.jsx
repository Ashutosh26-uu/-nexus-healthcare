import { useState } from 'react';
import { cx } from './ui';

// Share to WhatsApp with no business account: the phone's own share sheet when there is one (it lists
// WhatsApp, SMS, Telegram…), otherwise wa.me, which opens WhatsApp / WhatsApp Web with the text filled in.
// PRIVACY: callers pass only what is safe to forward — a date, a time, a doctor or clinic name, a link.
// Never symptoms, diagnoses, medicines or reports: a forwarded message leaves our control for good.
const isPhone = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');

export function WhatsAppGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="#1fa855">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3Z" />
    </svg>
  );
}

export default function ShareButton({ text, url, title = 'Sehatra', label = 'Share on WhatsApp', size = 'sm', variant = 'secondary', className, iconOnly = false }) {
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (busy) return;
    if (isPhone() && navigator.share) {
      setBusy(true);
      try { await navigator.share({ title, text, ...(url ? { url } : {}) }); return; } catch (e) {
        if (e?.name === 'AbortError') return; // they closed the sheet — not an error
      } finally { setBusy(false); }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent([text, url].filter(Boolean).join(' '))}`, '_blank', 'noopener,noreferrer');
  };
  return (
    <button type="button" className={cx('btn', variant, size, 'share-wa', className)} onClick={share} disabled={busy} aria-label={iconOnly ? label : undefined} title={label}>
      <WhatsAppGlyph size={size === 'lg' ? 18 : 15} />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
