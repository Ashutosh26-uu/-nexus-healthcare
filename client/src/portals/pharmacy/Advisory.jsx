import { Link } from 'react-router-dom';
import { Megaphone, ArrowRight } from 'lucide-react';

export default function Advisory({ advisories, linkToAlerts = true }) {
  if (!advisories?.length) return null;
  // One banner per disease: keep the strongest signal (several pin codes can raise alerts at once).
  const mult = (a) => parseFloat(a.message.match(/([\d.]+)×/)?.[1] || 0) + (a.status === 'confirmed' ? 100 : 0);
  const byDisease = Object.values(advisories.reduce((acc, a) => {
    if (!acc[a.disease] || mult(a) > mult(acc[a.disease])) acc[a.disease] = a;
    return acc;
  }, {}));
  return (
    <div className="ph-advisory-wrap">
      {byDisease.map((a) => (
        <div key={a.id} className="ph-advisory fade-in">
          <span className="ph-adv-icon"><Megaphone size={18} /></span>
          <div className="grow">
            <div className="row wrap" style={{ gap: 8 }}>
              <strong>Outbreak stock advisory · {a.disease}</strong>
              <span className={`badge ${a.status === 'confirmed' ? 'rose' : 'sun'}`}>{a.status === 'confirmed' ? 'Confirmed by district' : 'Under watch'}</span>
            </div>
            <div className="small">{a.message}</div>
          </div>
          {linkToAlerts && <Link to="/pharmacy/alerts" className="btn sm secondary">Plan restock <ArrowRight /></Link>}
        </div>
      ))}
    </div>
  );
}
