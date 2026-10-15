import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import Logo from '../components/Logo';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="center" style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}><Logo /></div>
        <Compass size={44} style={{ margin: '0 auto 14px', color: 'var(--clay)' }} />
        <h1 style={{ fontSize: '2rem' }}>We couldn&apos;t find that page</h1>
        <p className="muted">The link may be old, or the page may have moved. Let&apos;s get you back on track.</p>
        <Link to="/" className="btn mt-2">Take me home</Link>
      </div>
    </div>
  );
}
