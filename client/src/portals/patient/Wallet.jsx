import { Link } from 'react-router-dom';
import { Coins, ShieldCheck, Gift, Lock } from 'lucide-react';
import { Card, Empty, PreviewBadge } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, firstName } from './shared';

// Data donation + health credits isn't live yet: no research study is enrolling through Sehatra and no
// reward can be redeemed anywhere. Until it is, this page says so plainly instead of showing sample studies,
// a starter balance or vouchers nobody honours. Real Sehatra credit (from invites) lives on "Invite & earn".
export default function Wallet() {
  const { patient, profileKey } = usePatient();

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Consent Wallet" title={profileKey === 'self' ? 'Your Data Wallet' : `${firstName(patient?.name)}’s Data Wallet`}
        subtitle="You own your data. One day you’ll be able to share it — only ever anonymised — with approved research, and earn health credits for it." />

      <Card>
        <Empty icon={Coins} title={<>Data donation is coming soon <PreviewBadge>Coming soon</PreviewBadge></>}>
          No research studies are enrolling through Sehatra yet, so there is nothing to join and no health credits to earn or spend here. We&apos;ll tell you when the first approved study opens — nothing is ever shared without your clear yes.
        </Empty>
      </Card>

      <div className="grid two">
        <Card>
          <div className="row top">
            <span className="pt-ic-tile green"><Lock size={18} /></span>
            <div className="grow small">
              <strong>Your data stays yours</strong>
              <p className="muted mb-0">Today, only doctors and hospitals you approve can see your records. You can check and withdraw access any time in <Link to="/patient/consents">Who sees my data</Link>.</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="row top">
            <span className="pt-ic-tile clay"><Gift size={18} /></span>
            <div className="grow small">
              <strong>Want credit you can use today?</strong>
              <p className="muted mb-0">Invite friends and family — you both get Sehatra credit after their first paid visit. See <Link to="/patient/invite">Invite &amp; earn</Link>.</p>
            </div>
          </div>
        </Card>
      </div>
      <p className="tiny muted mb-0"><ShieldCheck size={12} className="inline-ic" /> Research sharing (when it launches) will always be off unless you switch it on in Settings.</p>
    </div>
  );
}
