import { useEffect, useState } from 'react';
import { Gift, Copy, Check, Users, Wallet, Info } from 'lucide-react';
import { Card, Empty, fmtDate, fmtMoney, cx } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import ShareButton from '../../components/ShareButton';
import { useLive } from '../../live';
import { PageSkeleton } from './shared';

const REASON = {
  referral_bonus: 'A friend joined with your invite',
  referral_welcome: 'Welcome reward — you joined with an invite',
  used: 'Used on a payment',
  refund: 'Returned — payment cancelled',
  expired: 'Expired',
  reversed: 'Taken back — that visit was refunded',
};
const FRIEND = { joined: ['Joined', ''], earned: ['You earned ₹50', 'green'], capped: ['Joined · reward limit reached', ''] };

// Refer & earn: your code + link, a WhatsApp share, who joined, and your Nexus credit.
export default function Invite() {
  const live = useLive('/referrals/me', ['notifications', 'payments']);
  const [copied, setCopied] = useState('');
  useEffect(() => { if (!copied) return undefined; const t = setTimeout(() => setCopied(''), 1800); return () => clearTimeout(t); }, [copied]);
  const data = live.data;
  if (live.error && !data) return <Empty title="Couldn't load your invite page">{live.error}</Empty>;
  if (!data) return <PageSkeleton />;

  const link = `${window.location.origin}${data.path}`;
  const copy = (what, text) => navigator.clipboard?.writeText(text).then(() => setCopied(what)).catch(() => {});
  const shareMsg = `I use Nexus Healthcare to see verified doctors and save on medicines — join with my link and we both get ₹${data.reward}:`;

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Invite & earn" title={`Give ₹${data.reward}, get ₹${data.reward}`}
        subtitle="Invite friends and family to Nexus Healthcare. When they finish their first paid consult or lab test, you both get Nexus credit." />

      <section className="pt-inv-hero" aria-label="Your invite">
        <div className="pt-inv-code">
          <span className="small muted">Your code</span>
          <strong translate="no">{data.code}</strong>
          <button type="button" className="icon-btn" aria-label="Copy code" onClick={() => copy('code', data.code)}>{copied === 'code' ? <Check size={15} /> : <Copy size={15} />}</button>
        </div>
        <div className="pt-inv-link">
          <span className="small mono" dir="ltr" translate="no">{link}</span>
        </div>
        <div className="pt-inv-actions">
          <ShareButton size="lg" variant="clay" text={shareMsg} url={link} label="Share on WhatsApp" />
          <button type="button" className="btn secondary lg" onClick={() => copy('link', link)}>{copied === 'link' ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy link</>}</button>
        </div>
      </section>

      <ol className="pt-inv-steps">
        <li><b>1</b><span className="small">Share your link on WhatsApp, or tell them your code.</span></li>
        <li><b>2</b><span className="small">They sign up with it — it only works when creating a new account.</span></li>
        <li><b>3</b><span className="small">After their first paid consult or lab test, you both get ₹{data.reward}.</span></li>
      </ol>

      <div className="grid side">
        <Card title={<h3 className="row" style={{ gap: 8 }}><Users size={18} /> Friends you invited</h3>}>
          {data.invited.length ? data.invited.map((f, i) => (
            <div key={i} className="pt-inv-row">
              <span className="grow"><strong className="small" translate="no">{f.firstName}</strong><span className="tiny muted block">Joined {fmtDate(f.joinedAt)}</span></span>
              <span className={cx('badge', FRIEND[f.status]?.[1])}>{FRIEND[f.status]?.[0] || f.status}</span>
            </div>
          )) : <p className="small muted mb-0">No one yet. Your first invite is one WhatsApp message away.</p>}
          <p className="tiny muted mb-0 mt-1">{data.rewardedCount} of {data.cap} rewards earned. Friends see only your first name.</p>
        </Card>

        <Card title={<h3 className="row" style={{ gap: 8 }}><Wallet size={18} /> Your Nexus credit</h3>}>
          <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
            <strong style={{ fontSize: '1.8rem' }} className="serif">{fmtMoney(data.balance)}</strong>
            <span className="small muted">to spend</span>
          </div>
          <p className="tiny muted mt-0"><Gift size={12} className="inline-ic" /> Use it on the payment step of a consult, lab test or medicine order. Each reward lasts {data.creditDays} days.</p>
          {data.history.length > 0 && (
            <div>
              {data.history.map((h) => (
                <div key={h.id} className="pt-inv-row">
                  <span className="grow"><span className="small block">{REASON[h.reason] || h.reason}</span><span className="tiny muted">{fmtDate(h.at)}{h.expiresAt ? ` · use by ${fmtDate(h.expiresAt)}` : ''}</span></span>
                  <span className={cx('pt-inv-amt', h.amount > 0 ? 'plus' : 'minus')}>{h.amount > 0 ? '+' : '−'}{fmtMoney(Math.abs(h.amount))}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="tiny muted mb-0"><Info size={12} className="inline-ic" /> Rewards are for new accounts only, not your own second account. If that first visit is cancelled and refunded, its rewards are taken back. Nexus credit has no cash value and can&apos;t be transferred.</p>
    </div>
  );
}
