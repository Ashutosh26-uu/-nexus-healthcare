import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, Card, Loading, useAction } from '../components/ui';

export const PENDING_CIRCLE = 'oc_circle_invite';

// Opened from a link a family member shared: join their emergency circle (needs your own Sehatra account).
export default function CircleInvite() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [run, busy] = useAction();
  useEffect(() => {
    api.get(`/circle/invite/${encodeURIComponent(token)}`).then(setInfo).catch((e) => setError(e.message));
  }, [token]);
  // Not signed in: remember the invite so it opens again right after sign-in / sign-up.
  useEffect(() => { if (!user) { try { localStorage.setItem(PENDING_CIRCLE, token); } catch { /* storage blocked */ } } }, [user, token]);

  const accept = async () => {
    const r = await run('ok', () => api.post(`/circle/invite/${encodeURIComponent(token)}/accept`), 'You’re in their emergency circle');
    if (r) { try { localStorage.removeItem(PENDING_CIRCLE); } catch { /* ignore */ } navigate('/patient', { replace: true }); }
  };
  const staff = user && !['patient', 'caregiver'].includes(user.role);

  return (
    <main className="container" style={{ maxWidth: 520, padding: '48px 16px' }}>
      <Card>
        {!info && !error && <Loading />}
        {error && <p className="small mb-0">{error}</p>}
        {info && (
          <div className="stack">
            <h2 className="row mb-0" style={{ gap: 8 }}><Users size={22} /> Join {info.from}’s emergency circle</h2>
            <p className="small mb-0">If {info.from} ever presses SOS on Sehatra, you’ll get an alert at once with where they are and the nearest hospitals. You won’t see their health records.</p>
            <p className="tiny muted mb-0"><ShieldCheck size={12} /> You can leave any time from your Sehatra account.</p>
            {!user && (
              <div className="row wrap" style={{ gap: 8 }}>
                <Link className="btn" to="/signup">Create a free account</Link>
                <Link className="btn secondary" to="/login" state={{ from: `/circle/${token}` }}>I have an account</Link>
              </div>
            )}
            {staff && <p className="small mb-0">Please open this link signed in with your personal (patient) account.</p>}
            {user && !staff && <Button loading={busy === 'ok'} onClick={accept}>Join {info.from}’s circle</Button>}
          </div>
        )}
      </Card>
    </main>
  );
}
