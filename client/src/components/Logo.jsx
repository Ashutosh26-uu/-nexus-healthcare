import { Link } from 'react-router-dom';

// Sehatra = sehat (health) + yatra (journey): a heart with a winding road — the S — that ends at a dot,
// care travelling all the way to the patient. Same drawing as public/favicon.svg and scripts/make-icons.mjs.
export function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#0f5c4d" />
      <path d="M32 48s-15-8.6-15-20a8.5 8.5 0 0 1 15-5.5A8.5 8.5 0 0 1 47 28c0 11.4-15 20-15 20z" fill="#fbf7f0" />
      <g transform="translate(32 31.4) scale(0.95)">
        <path d="M4.1 -1.09C2.05 -4.37 -4.92 -3.55 -4.1 0.55C-3.28 3.83 4.1 3.01 4.1 6.7C4.1 10.8 -2.05 12.03 -4.51 9.16" stroke="#d9734e" strokeWidth="3.3" fill="none" strokeLinecap="round" />
        <circle cx="4.59" cy="-1.66" r="2.2" fill="#d9734e" />
      </g>
    </svg>
  );
}

export default function Logo({ to = '/', light, sub }) {
  return (
    <Link to={to} className="logo" style={{ color: light ? '#fff' : 'var(--ink)' }} aria-label="Sehatra home">
      <LogoMark />
      <span className="logo-text">
        <span className="logo-name notranslate" translate="no">Sehatra<span style={{ color: 'var(--clay)' }}>.</span></span>
        {sub && <span className="logo-sub">{sub}</span>}
      </span>
    </Link>
  );
}
