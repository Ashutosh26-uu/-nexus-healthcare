import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareQuote, BadgeCheck, Star, Send, ShieldCheck, Users, Stethoscope, Languages, MapPin, LogIn, Clock3, Undo2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useLive } from '../live';
import { PublicPage } from './public/PublicShell';
import { Button, Field, fmtDate, useAction, cx } from '../components/ui';
import { useSeo } from '../seo';

// Testimonials — a wall of VERIFIED stories. Only people who really use Sehatra can post (signed in), each story
// is approved by the team, and the badge comes from the poster's actual account. Nothing is seeded or invented:
// until the first story is approved, the page says so.
const MAX = 600;

function Stars({ value, onChange, size = 18 }) {
  return (
    <span className="tm-stars" role={onChange ? 'radiogroup' : undefined} aria-label={onChange ? 'Rating' : `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (onChange
        ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={cx(n <= (value || 0) && 'on')} onClick={() => onChange(value === n ? null : n)}><Star size={size} /></button>
        : <Star key={n} size={size} className={cx(n <= (value || 0) && 'on')} />))}
    </span>
  );
}

function StoryCard({ s, preview }) {
  return (
    <article className={cx('tm-card', preview && 'preview')}>
      <MessageSquareQuote className="tm-card-q" size={26} aria-hidden="true" />
      {s.rating ? <Stars value={s.rating} size={15} /> : null}
      <p className="tm-text">{s.text}</p>
      <footer>
        <span className="tm-avatar" aria-hidden="true">{String(s.name || '').split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join('').toUpperCase() || '★'}</span>
        <span className="grow">
          <strong translate="no">{s.name}</strong>
          <span className="tiny muted block">{[s.place, s.at && fmtDate(s.at)].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="tm-badge"><BadgeCheck size={14} /> Verified {s.role.toLowerCase()}</span>
      </footer>
    </article>
  );
}

function ShareStory() {
  const { user } = useAuth();
  const mine = useLive(user ? '/stories/mine' : null, ['stories']);
  const [run, busy] = useAction();
  const [form, setForm] = useState({ text: '', show: 'initials', place: '', rating: null, consent: false });
  if (!user) {
    return (
      <div className="tm-share">
        <h2>Used Sehatra? Be one of the first stories.</h2>
        <p className="muted">Sign in to share yours — only real patients, doctors, chemists and labs on Sehatra can post, so every story here is genuine.</p>
        <Link className="btn" to="/login" state={{ from: '/testimonials' }}><LogIn size={16} /> Sign in to share your story</Link>
      </div>
    );
  }
  const story = mine.data?.story;
  const roleLabel = mine.data?.role || 'Sehatra user';
  if (story && story.status === 'pending') {
    return (
      <div className="tm-share">
        <h2 className="row" style={{ gap: 8, justifyContent: 'center' }}><Clock3 size={20} /> Thank you — your story is with our team</h2>
        <p className="muted">It will appear here as soon as it&apos;s approved. This is how it will look:</p>
        <StoryCard s={story.preview} preview />
        <button type="button" className="link-btn small" onClick={() => run('w', () => api.post(`/stories/${story.id}/withdraw`), 'Story withdrawn').then(mine.reload)}><Undo2 size={14} /> Withdraw it</button>
      </div>
    );
  }
  if (story && story.status === 'approved') {
    return (
      <div className="tm-share">
        <h2 className="row" style={{ gap: 8, justifyContent: 'center' }}><BadgeCheck size={20} /> Your story is live — thank you!</h2>
        <button type="button" className="link-btn small" onClick={() => run('w', () => api.post(`/stories/${story.id}/withdraw`), 'Story taken down').then(mine.reload)}><Undo2 size={14} /> Take it down</button>
      </div>
    );
  }
  if (['super_admin', 'official'].includes(user.role)) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (await run('send', () => api.post('/stories', form), 'Sent for review — thank you!')) { setForm({ text: '', show: 'initials', place: '', rating: null, consent: false }); mine.reload(); }
  };
  const previewName = form.show === 'full' ? user.name : String(user.name || '').replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');
  return (
    <form className="tm-share tm-form" onSubmit={submit}>
      <h2>Share your story</h2>
      <p className="muted">What changed for you with Sehatra? A sentence or two in your own words — any language is fine.</p>
      {story?.status === 'rejected' && story.reviewNote && <div className="callout sun small"><span>About your last story: {story.reviewNote}</span></div>}
      <Field label="Your story" hint={`${form.text.length}/${MAX}`}>
        <textarea className="textarea" rows={4} maxLength={MAX} value={form.text} onChange={(e) => set('text', e.target.value)} placeholder="e.g. My mother's BP is finally under control — the doctor sees her readings every week without us travelling to the city." required />
      </Field>
      <div className="tm-form-row">
        <Field label="Show my name as">
          <div className="pills" role="group" aria-label="Name shown">
            <button type="button" className={cx('pill', form.show === 'initials' && 'active')} onClick={() => set('show', 'initials')}>Initials only</button>
            <button type="button" className={cx('pill', form.show === 'full' && 'active')} onClick={() => set('show', 'full')}>Full name</button>
          </div>
        </Field>
        <Field label="Town or city (optional)"><input className="input" maxLength={60} value={form.place} onChange={(e) => set('place', e.target.value)} placeholder="e.g. Barabanki" /></Field>
        <Field label="Rating (optional)"><Stars value={form.rating} onChange={(v) => set('rating', v)} size={22} /></Field>
      </div>
      {form.text.trim().length >= 30 && <><span className="tiny muted">Preview</span><StoryCard s={{ name: previewName || 'You', role: roleLabel, place: form.place, text: form.text.trim(), rating: form.rating }} preview /></>}
      <label className="tm-consent">
        <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
        <span className="small">I agree that Sehatra may publish this story with my {form.show === 'full' ? 'name' : 'initials'}, role{form.place ? ' and town' : ''}. I can take it down any time. <span className="muted">Please don&apos;t include medical details you want to keep private.</span></span>
      </label>
      <Button type="submit" icon={Send} loading={busy === 'send'} disabled={form.text.trim().length < 30 || !form.consent}>Send for review</Button>
      <p className="tiny muted mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> Our team reads every story before it appears. Your badge — “Verified {roleLabel.toLowerCase()}” — comes from your account.</p>
    </form>
  );
}

export default function Testimonials() {
  useSeo({ title: 'Testimonials · Sehatra', description: 'Verified stories from patients, doctors, chemists and labs using Sehatra.', path: '/testimonials' });
  const { user } = useAuth();
  // Signed-in visitors get approvals live over the app's stream; everyone else re-checks when they come back to the tab.
  const live = useLive(user ? '/public/stories' : null, ['stories', 'doctors']);
  const [anon, setAnon] = useState(null);
  useEffect(() => {
    if (user) return undefined;
    let alive = true;
    const load = () => api.get('/public/stories').then((r) => alive && setAnon(r)).catch(() => {});
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); };
  }, [user]);
  const data = user ? live.data : anon;
  const stories = data?.stories || [];
  const st = data?.stats;

  return (
    <PublicPage>
      <section className="tm-hero">
        <div className="tm-float" aria-hidden="true"><span /><span /><span /></div>
        <span className="pb-eyebrow">Testimonials</span>
        <h1>{stories.length ? 'Real stories from real people' : 'Real stories, coming soon'}</h1>
        <p className="muted">Every story here is from someone who actually uses Sehatra — signed in, verified by their account, and read by our team before it appears. No actors, no made-up quotes.</p>
        {st && (
          <div className="tm-stats">
            <span><Users size={16} /><strong>{st.passports.toLocaleString('en-IN')}</strong> Health Passports</span>
            <span><Stethoscope size={16} /><strong>{st.doctorsOnline}</strong> doctors online now</span>
            <span><MapPin size={16} /><strong>{st.states}</strong> state{st.states === 1 ? '' : 's'}</span>
            <span><Languages size={16} /><strong>{st.languages}</strong> languages</span>
          </div>
        )}
      </section>

      {stories.length > 0 ? (
        <section className="tm-wall" aria-label="Stories">{stories.map((s) => <StoryCard key={s.id} s={s} />)}</section>
      ) : (
        <section className="tm-empty" aria-label="No stories yet">
          {[0, 1, 2].map((i) => <div key={i} className="tm-ghost" style={{ animationDelay: `${i * 0.4}s` }}><span /><span /><span /></div>)}
          <p className="small muted">The first verified stories will appear here.</p>
        </section>
      )}

      <ShareStory />
    </PublicPage>
  );
}
