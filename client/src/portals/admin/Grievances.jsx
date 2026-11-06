import { useState } from 'react';
import { MessageSquareWarning, Send, CheckCircle2 } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Empty, fmtDateTime, useAction, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';

// Privacy complaints (DPDP Rules: answered within 90 days). Oldest deadline first; the person sees every reply.
const TOPIC = { access: 'See my data', correction: 'Correct my data', erasure: 'Erase my data', consent: 'Consent', misuse: 'Possible misuse', other: 'Other' };

function Row({ g, onDone }) {
  const [run, busy] = useAction();
  const [text, setText] = useState('');
  const send = async (close) => {
    if (await run(close ? 'close' : 'reply', () => api.post(`/admin/grievances/${g.id}/reply`, { text, close }), close ? 'Resolved — the person was told' : 'Reply sent')) { setText(''); onDone(); }
  };
  const late = g.daysLeft != null && g.daysLeft <= 7;
  return (
    <div className="card flat">
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="small"><strong translate="no">{g.user}</strong> <span className="muted">· {g.role} · {g.email}</span></span>
        {g.status === 'open'
          ? <span className={cx('badge', late ? 'rose' : 'sun')}>{g.daysLeft > 0 ? `${g.daysLeft} days left` : 'Overdue'}</span>
          : <span className="badge green">Resolved</span>}
      </div>
      <div className="tiny muted mt-1">{TOPIC[g.topic] || g.topic} · {fmtDateTime(g.at)}</div>
      <p className="small mb-1 mt-1">{g.text}</p>
      {g.replies.map((r) => <div key={r.at} className="tiny muted">↳ {r.by} ({fmtDateTime(r.at)}): {r.text}</div>)}
      {g.status === 'open' && (
        <div className="stack mt-1" style={{ gap: 6 }}>
          <textarea className="input" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply to the person — they see it in the app." />
          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
            <Button size="sm" variant="ghost" icon={Send} disabled={text.trim().length < 5} loading={busy === 'reply'} onClick={() => send(false)}>Reply</Button>
            <Button size="sm" icon={CheckCircle2} disabled={text.trim().length < 5} loading={busy === 'close'} onClick={() => send(true)}>Reply &amp; resolve</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Grievances() {
  const live = useLive('/admin/grievances', ['admin']);
  const [tab, setTab] = useState('open');
  return (
    <>
      <PageHeader eyebrow="Privacy" title="Privacy complaints" subtitle="Under the DPDP Rules every complaint must be answered within 90 days. Oldest deadline first." />
      <LiveGate live={live}>
        {(d) => {
          const list = tab === 'open' ? d.open : d.closed;
          return (
            <div className="stack">
              <p className="small muted mb-0">{d.consents.total} accounts have agreed to notice {d.consents.version}; {d.consents.ai} of them turned on Saathi AI.</p>
              <div className="pills">
                <button type="button" className={cx('pill', tab === 'open' && 'active')} onClick={() => setTab('open')}>{d.open.length ? `Open (${d.open.length})` : 'Open'}</button>
                <button type="button" className={cx('pill', tab === 'closed' && 'active')} onClick={() => setTab('closed')}>Resolved</button>
              </div>
              <Card>
                {list.length === 0
                  ? <Empty icon={MessageSquareWarning} title={tab === 'open' ? 'No open complaints' : 'Nothing resolved yet'}>People raise these from the account menu → Privacy &amp; consent.</Empty>
                  : <div className="stack">{list.map((g) => <Row key={g.id} g={g} onDone={live.reload} />)}</div>}
              </Card>
            </div>
          );
        }}
      </LiveGate>
    </>
  );
}
