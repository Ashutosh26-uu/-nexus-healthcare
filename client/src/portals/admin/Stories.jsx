import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareQuote, Check, X, EyeOff, BadgeCheck, ExternalLink } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Empty, fmtDateTime, useAction, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';

// Stories for the public Testimonials page. Nothing appears there until it's approved here; the poster can take
// their own story down at any time, and an approved one can be hidden from here too.
const TONE = { approved: 'green', rejected: 'rose', hidden: '' };

function StoryRow({ s, onDone }) {
  const [run, busy] = useAction();
  const act = async (action) => {
    const note = action === 'reject' ? window.prompt('Note to the person (optional) — why it can’t be published as written:') ?? null : null;
    if (action === 'reject' && note === null) return;
    if (await run(action, () => api.post(`/admin/stories/${s.id}/${action}`, { note }), { approve: 'Published', reject: 'Rejected', hide: 'Hidden from the page' }[action])) onDone();
  };
  return (
    <div className="card flat ad-story">
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="small"><strong translate="no">{s.fullName}</strong> <span className="muted">· shows as “{s.name}” · {s.role}{s.place ? ` · ${s.place}` : ''}</span></span>
        <span className="row" style={{ gap: 6 }}>
          {s.status !== 'pending' && <span className={cx('badge', TONE[s.status])}>{s.status}</span>}
          {s.rating ? <span className="tiny muted">{'★'.repeat(s.rating)}</span> : null}
        </span>
      </div>
      <p className="small mb-1 mt-1">“{s.text}”</p>
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="tiny muted">{s.email ? `${s.email} · ` : ''}{fmtDateTime(s.createdAt)}{s.reviewNote ? ` · note: ${s.reviewNote}` : ''}</span>
        <span className="row" style={{ gap: 6 }}>
          {s.status === 'pending' && <Button size="sm" variant="ghost" icon={X} loading={busy === 'reject'} onClick={() => act('reject')}>Reject</Button>}
          {s.status === 'pending' && <Button size="sm" icon={Check} loading={busy === 'approve'} onClick={() => act('approve')}>Approve &amp; publish</Button>}
          {s.status === 'approved' && <Button size="sm" variant="ghost" icon={EyeOff} loading={busy === 'hide'} onClick={() => act('hide')}>Hide</Button>}
          {s.status === 'hidden' && <Button size="sm" variant="ghost" icon={BadgeCheck} loading={busy === 'approve'} onClick={() => act('approve')}>Show again</Button>}
        </span>
      </div>
    </div>
  );
}

export default function Stories() {
  const live = useLive('/admin/stories', ['stories', 'admin']);
  const [tab, setTab] = useState('pending');
  return (
    <>
      <PageHeader eyebrow="Content" title="Stories" subtitle="Testimonials from people who use Nexus. Read each one — only approved stories appear on the public page.">
        <Link to="/testimonials" target="_blank" className="btn ghost"><ExternalLink size={16} /> View the page</Link>
      </PageHeader>
      <LiveGate live={live}>
        {(d) => {
          const list = tab === 'pending' ? d.pending : d.recent;
          return (
            <div className="stack">
              <div className="pills">
                <button type="button" className={cx('pill', tab === 'pending' && 'active')} onClick={() => setTab('pending')}>{d.pending.length ? `To review (${d.pending.length})` : 'To review'}</button>
                <button type="button" className={cx('pill', tab === 'recent' && 'active')} onClick={() => setTab('recent')}>Reviewed</button>
              </div>
              <Card>
                {list.length === 0
                  ? <Empty icon={MessageSquareQuote} title={tab === 'pending' ? 'Nothing to review' : 'No reviewed stories yet'}>{tab === 'pending' ? 'When someone shares their story from the Testimonials page, it lands here.' : 'Approved, rejected and hidden stories show here.'}</Empty>
                  : <div className="stack">{list.map((s) => <StoryRow key={s.id} s={s} onDone={live.reload} />)}</div>}
              </Card>
            </div>
          );
        }}
      </LiveGate>
    </>
  );
}
