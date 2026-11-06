import { useEffect, useState } from 'react';
import { BadgeCheck, Users } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, Modal, fmtDate, fmtMoney, useToast } from '../../components/ui';
import PaymentStep from './Payment';

// Sehatra plan (server/membership.js): monthly plans the Sehatra team publishes, with included video consults.
// Hidden completely while no plan is on sale — no sample plans or prices.
export default function MembershipCard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [paying, setPaying] = useState(null); // { payment }
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api.get('/membership').then(setData).catch(() => setData({ plans: [], active: null }));
  useEffect(() => { load(); }, []);

  const buy = async (planId) => {
    setBusy(planId); setErr('');
    try { const r = await api.post('/membership/subscribe', { planId }); setPaying(r); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  if (!data || (!data.plans.length && !data.active)) return null;
  const a = data.active;
  const renewable = a && Date.parse(a.endsAt) - Date.now() < 7 * 86400000;

  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><BadgeCheck size={18} /> Sehatra plan</h3>}>
      {a ? (
        <div className="stack" style={{ gap: 6 }}>
          <strong>{a.planName} {a.family && <span className="badge tiny green"><Users size={11} /> Family</span>}</strong>
          <span className="small">{a.consultsLeft} of {a.consultsTotal} video consults left · until {fmtDate(a.endsAt)}</span>
          <span className="tiny muted">When you pay for a video consult, choose “Use plan”.</span>
        </div>
      ) : <p className="small muted">A monthly plan with video consults included. Pay month by month — stop any time.</p>}
      {(!a || renewable) && data.plans.length > 0 && (
        <div className="stack mt-2" style={{ gap: 8 }}>
          {data.plans.map((p) => (
            <div key={p.id} className="card flat row between wrap" style={{ gap: 10, padding: 12 }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <strong className="small">{p.name}</strong>{p.family && <span className="badge tiny green" style={{ marginInlineStart: 6 }}>Whole family</span>}
                <div className="tiny muted">{p.consults} video consult{p.consults > 1 ? 's' : ''} a month{p.note ? ` · ${p.note}` : ''}</div>
              </div>
              <Button size="sm" loading={busy === p.id} onClick={() => buy(p.id)}>{a ? 'Renew' : 'Join'} · {fmtMoney(p.price)}/month</Button>
            </div>
          ))}
        </div>
      )}
      {err && <div className="form-error mt-2">{err}</div>}
      <Modal open={!!paying} onClose={() => setPaying(null)} title="Pay for your plan">
        {paying && (
          <PaymentStep payment={paying.payment}
            onPaid={() => { setPaying(null); toast('Your plan is active.'); load(); }}
            onError={() => load()} />
        )}
      </Modal>
    </Card>
  );
}
