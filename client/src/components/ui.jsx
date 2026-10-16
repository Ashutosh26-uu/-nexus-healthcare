import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X, Inbox } from 'lucide-react';
import { getLocale } from '../i18n';

/* ---------- formatting ---------- */
export function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const future = diff < 0;
  const s = Math.abs(diff);
  let out;
  if (s < 45) out = 'just now';
  else if (s < 3600) out = `${Math.round(s / 60)} min`;
  else if (s < 86400) out = `${Math.round(s / 3600)} hr`;
  else if (s < 86400 * 30) out = `${Math.round(s / 86400)} day${Math.round(s / 86400) > 1 ? 's' : ''}`;
  else return fmtDate(iso);
  if (out === 'just now') return out;
  return future ? `in ${out}` : `${out} ago`;
}
const safeLocale = () => { try { Intl.DateTimeFormat(getLocale()); return getLocale(); } catch { return 'en-IN'; } };
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(safeLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(safeLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(safeLocale(), { hour: 'numeric', minute: '2-digit' }) : '—');
export const fmtMoney = (n, currency = 'INR') => new Intl.NumberFormat(safeLocale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(n || 0));
export const fmtNum = (n) => Number(n || 0).toLocaleString(safeLocale());
export const initials = (name) => String(name || '').replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const cx = (...a) => a.filter(Boolean).join(' ');

const AVATAR_COLORS = ['#0f5c4d', '#d9734e', '#3d7fb8', '#7a4f9a', '#b8862b', '#2a8a6e', '#c8463d', '#4b6b8a'];
export function Avatar({ name = '', size, className }) {
  const n = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return <span className={cx('avatar', size, className)} style={{ background: AVATAR_COLORS[n % AVATAR_COLORS.length] }} aria-hidden="true">{initials(name)}</span>;
}

/* ---------- triage ---------- */
export const TRIAGE = {
  emergency: { label: 'Emergency', tone: 'rose' },
  doctor_now: { label: 'See doctor now', tone: 'clay' },
  routine: { label: 'Routine', tone: 'sky' },
  self_care: { label: 'Self-care', tone: 'green' },
};
export function TriageBadge({ level }) {
  const t = TRIAGE[level] || { label: level };
  return <span className={cx('triage', level)}>{t.label}</span>;
}

const STATUS_TONES = {
  active: 'green', online: 'green', completed: 'green', delivered: 'green', collected: 'green', accepted: 'green', reported: 'green', confirmed: 'rose', published: 'green', verified: 'green',
  queued: 'sun', pending: 'sun', requested: 'sun', scheduled: 'sky', in_progress: 'clay', processing: 'sky', received: 'sky', collected_sample: 'sky', ordered: 'sun', sent: 'sky', issued: 'sun',
  dispensed: 'sky', out_for_delivery: 'clay', dispatched: 'clay', in_transit: 'clay', picked: 'clay', assigned: 'sun', acknowledged: 'sky', draft: '',
  cancelled: '', declined: 'rose', rejected: 'rose', denied: 'rose', revoked: 'rose', expired: '', offline: 'rose', suspended: 'rose', dismissed: '', resolved: 'green', closed: '', open: 'clay',
};
export function StatusBadge({ status, children }) {
  const label = children || String(status || '').replace(/_/g, ' ');
  return <span className={cx('badge', STATUS_TONES[status])} style={{ textTransform: 'capitalize' }}>{label}</span>;
}

/* ---------- primitives ---------- */
export function Button({ variant, size, block, loading, icon: Icon, disabled, children, className, ...rest }) {
  // `disabled` goes after the spread: a caller's disabled={false} must not re-enable a button mid-request.
  return (
    <button className={cx('btn', variant, size, block && 'block', className)} {...rest} disabled={loading || disabled}>
      {loading ? <span className="spinner sm" style={{ borderTopColor: 'currentColor' }} /> : Icon ? <Icon /> : null}
      {children}
    </button>
  );
}

const CONTROLS = new Set(['input', 'select', 'textarea']);
export function Field({ label, hint, error, children, className }) {
  // Tie the label to the first plain control so screen readers announce it (and a tap on the label focuses it).
  const auto = useId();
  let id;
  const kids = Children.map(children, (c) => {
    if (id || !isValidElement(c) || !CONTROLS.has(c.type)) return c;
    id = c.props.id || auto;
    return c.props.id ? c : cloneElement(c, { id });
  });
  return (
    <div className={cx('field', className)}>
      {label && <label htmlFor={id}>{label}</label>}
      {kids}
      {error ? <span className="hint" style={{ color: 'var(--rose)' }}>{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Card({ title, action, children, className, ...rest }) {
  return (
    <section className={cx('card', className)} {...rest}>
      {(title || action) && (
        <div className="card-head">
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, icon: Icon, delta, deltaDir, sub }) {
  return (
    <div className="card stat">
      <span className="label">{Icon && <Icon />}{label}</span>
      <span className="value">{value}</span>
      {delta && <span className={cx('delta', deltaDir)}>{delta}</span>}
      {sub && <span className="tiny muted">{sub}</span>}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="empty">
      <Icon />
      {title && <h4>{title}</h4>}
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="page-loading"><div className="spinner" /></div>;
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className={cx('tab', value === t.value && 'active')} onClick={() => onChange(t.value)}>
          {t.icon && <t.icon size={16} />}
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pills({ options, value, onChange }) {
  return (
    <div className="pills">
      {options.map((o) => (
        <button key={o.value} type="button" className={cx('pill', value === o.value && 'active')} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

// Open modals, innermost last: Escape closes only the top one, and the scroll lock lifts with the last.
const modalStack = [];
let bodyOverflow = '';

export function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const token = {};
    if (!modalStack.length) { bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    modalStack.push(token);
    // Keyboard and screen-reader users land inside the dialog, and get back to where they were on close.
    const opener = document.activeElement;
    boxRef.current?.focus({ preventScroll: true });
    const onKey = (e) => e.key === 'Escape' && modalStack[modalStack.length - 1] === token && closeRef.current?.();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(token), 1);
      if (!modalStack.length) document.body.style.overflow = bodyOverflow;
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  // Portal to <body> so an animated/transformed ancestor can't trap the fixed-position backdrop.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={boxRef} tabIndex={-1} className={cx('modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="muted small mb-0" style={{ marginTop: 4 }}>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Progress({ value, max = 100, tone }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const auto = tone || (pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : '');
  return <div className={cx('progress', auto)}><span style={{ width: `${pct}%` }} /></div>;
}

/* ---------- toast ---------- */
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, message, type }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3600);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('toast', t.type)}>
            {t.type === 'error' ? <AlertCircle /> : <CheckCircle2 />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/* Run an async action with loading state + toast on error/success. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const run = useCallback(async (key, fn, successMsg) => {
    setBusy(key);
    try {
      const r = await fn();
      if (successMsg) toast(successMsg);
      return r;
    } catch (e) {
      toast(e.message, 'error');
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [toast]);
  return [run, busy];
}

/* Debounced copy of a value (search boxes, dependency checks) — shared so portals don't import each other. */
export function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ---------- tiny charts (hand-rolled SVG) ---------- */
export function Sparkline({ data = [], color = 'var(--green-2)', height = 48, fill = true }) {
  if (!data.length) return null;
  const w = 200;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1 || 1)) * w, height - 4 - ((v - min) / (max - min || 1)) * (height - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      {fill && <path d={`${d} L${w},${height} L0,${height} Z`} fill={color} opacity="0.1" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BarChart({ data = [], labels = [], color = 'var(--green-2)', height = 140, format = (v) => v }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, paddingTop: 18 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }} title={`${labels[i] || ''}: ${format(v)}`}>
          <span className="tiny muted">{format(v)}</span>
          <div style={{ width: '100%', maxWidth: 34, height: `${(v / max) * 100}%`, minHeight: 3, background: color, borderRadius: '6px 6px 3px 3px', transition: 'height .6s var(--ease)' }} />
          {labels[i] && <span className="tiny muted nowrap">{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

export function LineChart({ series = [], labels = [], height = 180 }) {
  const w = 600;
  const pad = { l: 30, r: 10, t: 12, b: 26 };
  const all = series.flatMap((s) => s.data);
  const max = Math.max(...all, 1) * 1.1;
  const x = (i) => pad.l + (i / Math.max(1, labels.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t ? '3 4' : ''} />
            <text x={pad.l - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="var(--ink-3)">{t}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={i} x={x(i)} y={height - 6} fontSize="10" textAnchor="middle" fill="var(--ink-3)">{l}</text>)}
        {series.map((s) => (
          <g key={s.name}>
            <path d={s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? '6 5' : ''} strokeLinecap="round" strokeLinejoin="round" />
            {!s.dashed && s.data.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#fff" stroke={s.color} strokeWidth="2" />)}
          </g>
        ))}
      </svg>
      <div className="row wrap" style={{ gap: 16, marginTop: 4 }}>
        {series.map((s) => (
          <span key={s.name} className="row tiny muted" style={{ gap: 6 }}>
            <span style={{ width: 14, height: 3, background: s.color, borderRadius: 2, opacity: s.dashed ? 0.6 : 1 }} />{s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Donut({ value, max, size = 92, color = 'var(--green-2)', label }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / (max || 1));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--paper-2)" strokeWidth="11" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray .8s var(--ease)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="serif" style={{ fontSize: size > 80 ? '1.3rem' : '1rem', fontWeight: 600, lineHeight: 1 }}>{Math.round(pct * 100)}%</div>
          {label && <div className="tiny muted">{label}</div>}
        </div>
      </div>
    </div>
  );
}
