import { Link } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';

// Home-screen nudge for Refer & earn. Its own small file so Home doesn't pull in the whole invite page.
export default function InviteCard() {
  return (
    <Link to="/patient/invite" className="card row" style={{ gap: 12, textDecoration: 'none', color: 'inherit' }}>
      <span className="pt-quick-ic" style={{ flex: 'none' }}><Gift /></span>
      <span className="grow">
        <strong className="block">Invite friends, you both get ₹50</strong>
        <span className="small muted">Nexus credit after their first paid consult or lab test.</span>
      </span>
      <ChevronRight size={18} className="muted" />
    </Link>
  );
}
