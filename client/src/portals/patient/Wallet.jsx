import { useEffect, useState } from 'react';
import { Coins, ShieldCheck, Droplet, Truck, Stethoscope, Heart, Gift, Check, Lock, Sparkles } from 'lucide-react';
import { Card, Button, Empty, Modal, useAction, cx, fmtDateTime } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { usePatient, firstName, PageSkeleton } from './shared';

const REWARD_ICON = { droplet: Droplet, truck: Truck, stethoscope: Stethoscope, heart: Heart };

export default function Wallet() {
  const { patient, profileKey } = usePatient();
  const [run, busy] = useAction();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [voucher, setVoucher] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null); setError('');
    api.get('/patient/wallet').then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [profileKey]);

  if (error) return <Empty title="Couldn't load your Data Wallet">{error}</Empty>;
  if (!data) return <PageSkeleton />;

  const donate = (s) => run(`d-${s.id}`, async () => { const r = await api.post('/patient/wallet/donate', { studyId: s.id }); setData((d) => ({ ...d, ...r })); }, `Thank you! +${s.credits} credits`);
  const redeem = (rw) => run(`r-${rw.id}`, async () => { const r = await api.post('/patient/wallet/redeem', { rewardId: rw.id }); setData((d) => ({ ...d, credits: r.credits, ledger: r.ledger })); setVoucher(r.voucher); });

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Consent Wallet" title={profileKey === 'self' ? 'Your Data Wallet' : `${firstName(patient?.name)}’s Data Wallet`}
        subtitle="You own your data. Choose to share it — only ever anonymised — and earn health credits you can spend on care." />

      {/* balance */}
      <div className="pt-wallet-balance">
        <div className="pt-wallet-coins"><Coins size={26} /></div>
        <div className="grow">
          <div className="pt-wallet-num" translate="no">{data.credits}</div>
          <div className="small">health credits</div>
        </div>
        <div className={cx('pt-wallet-verify', data.verified && 'ok')}>
          <ShieldCheck size={15} />
          <span className="tiny">{data.verified ? 'Ledger verified · tamper-proof' : 'Ledger check failed'}</span>
        </div>
      </div>

      <div className="grid side">
        <div className="stack lg">
          {/* studies */}
          <div className="stack">
            <h3 className="mb-0">Donate your data, help your community</h3>
            <p className="small muted mt-0">Approved, ethics-board research. Only anonymised numbers leave your passport — never your name, and you can see every request.</p>
            <div className="stack">
              {data.studies.map((s) => {
                const joined = data.donations.includes(s.id);
                return (
                  <Card key={s.id} className={cx('pt-study', joined && 'joined')}>
                    <div className="row between top">
                      <div className="grow">
                        <div className="strong">{s.title}</div>
                        <div className="tiny muted">{s.org}</div>
                        <p className="small mt-1 mb-1">{s.blurb}</p>
                        <div className="row wrap" style={{ gap: 6 }}>
                          {s.data.map((d) => <span key={d} className="badge green"><Lock size={11} /> {d}</span>)}
                        </div>
                      </div>
                      <div className="pt-study-side">
                        <div className="pt-study-credits" translate="no">+{s.credits}</div>
                        {joined
                          ? <span className="badge green"><Check size={13} /> Joined</span>
                          : <Button size="sm" loading={busy === `d-${s.id}`} onClick={() => donate(s)}>Join study</Button>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* rewards */}
          <div className="stack">
            <h3 className="mb-0">Spend your credits</h3>
            <div className="grid two">
              {data.rewards.map((rw) => {
                const Icon = REWARD_ICON[rw.icon] || Gift;
                const afford = data.credits >= rw.cost;
                return (
                  <Card key={rw.id} className="pt-reward">
                    <span className="pt-reward-ic"><Icon size={18} /></span>
                    <div className="grow">
                      <div className="small strong">{rw.title}</div>
                      <div className="tiny muted" translate="no">{rw.cost} credits</div>
                    </div>
                    <Button size="sm" variant={afford ? 'soft' : 'ghost'} disabled={!afford} loading={busy === `r-${rw.id}`} onClick={() => redeem(rw)}>Redeem</Button>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        {/* ledger */}
        <Card className="pt-ledger">
          <div className="card-head"><h3 className="mb-0">Credit ledger</h3><span className="badge green"><ShieldCheck size={12} /> hash-chained</span></div>
          <p className="tiny muted mt-0">Every credit is cryptographically linked to the one before it, so your history can’t be faked or quietly changed.</p>
          <div className="pt-ledger-list">
            {data.ledger.length === 0 && <p className="muted small center">No activity yet.</p>}
            {data.ledger.map((e) => (
              <div key={e.hash} className="pt-ledger-row">
                <div className="grow">
                  <div className="small">{e.note}</div>
                  <div className="tiny muted" translate="no">{fmtDateTime(e.at)} · #{e.hash.slice(0, 8)}</div>
                </div>
                <div className={cx('pt-ledger-delta', e.delta < 0 ? 'minus' : 'plus')} translate="no">{e.delta > 0 ? '+' : ''}{e.delta}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={!!voucher} onClose={() => setVoucher(null)} title="Reward unlocked 🎁">
        {voucher && (
          <div className="center stack">
            <div className="pt-voucher">
              <Gift size={28} />
              <div className="strong mt-1">{voucher.title}</div>
              <div className="pt-voucher-code mono" translate="no">{voucher.code}</div>
              <div className="tiny muted">Show this code at any Nexus Healthcare kiosk or pharmacy</div>
            </div>
            <Button onClick={() => setVoucher(null)}>Done</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
