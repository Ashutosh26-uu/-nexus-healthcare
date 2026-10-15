import { Link } from 'react-router-dom';

export function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#0f5c4d" />
      <path d="M32 48s-15-8.6-15-20a8.5 8.5 0 0 1 15-5.5A8.5 8.5 0 0 1 47 28c0 11.4-15 20-15 20z" fill="#fbf7f0" />
      <path d="M23.5 31h5.5l2-4.2 3 8 2-3.8h4.5" stroke="#d9734e" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ to = '/', light, sub }) {
  return (
    <Link to={to} className="logo" style={{ color: light ? '#fff' : 'var(--ink)' }}>
      <LogoMark />
      <span className="logo-text">
        <span className="logo-name">Nexus Healthcare<span style={{ color: 'var(--clay)' }}>.</span></span>
        {sub && <span className="logo-sub">{sub}</span>}
      </span>
    </Link>
  );
}
