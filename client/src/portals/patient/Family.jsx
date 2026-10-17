import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus, Check, ArrowRightLeft, Users, HeartHandshake, CalendarClock, Syringe, Pill, Activity, Video, Plus } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useLive } from '../../live';
import { Avatar, Button, Card, Empty, Field, Modal, cx, timeAgo, useAction } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, firstName, relationOf, localISO, BLOOD_GROUPS, PageSkeleton } from './shared';
import { READING_KINDS, FlagBadge, dayLabel, readingValue } from './health';
import { getLocale } from '../../i18n';

// Everything the family hub cards show, live: refetches when any of these change for anyone in the family.
const HUB_TOPICS = ['vitals', 'vaccines', 'consults', 'prescriptions', 'pharmacy', 'family', 'records', 'patients'];

const RELATIONS = ['Son', 'Daughter', 'Mother', 'Father', 'Mother-in-law', 'Father-in-law', 'Spouse', 'Grandparent', 'Sibling', 'Other'];
const EMPTY = { name: '', dob: '', gender: '', relation: '', bloodGroup: 'Unknown', allergies: '', conditions: '' };

export default function Family() {
  const { profiles, patient, switchProfile, reloadHome, homeLoading } = usePatient();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const hub = useLive('/family/overview', HUB_TOPICS);
  const cards = new Map((hub.data || []).map((c) => [c.id, c]));
  // Quick actions act on that person: switch quietly, then open the page.
  const actFor = (p, to) => { if (p.id !== patient?.id) switchProfile(p.id, { stay: true, quiet: true }); navigate(to); };
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [run, busy] = useAction();
  // Relation isn't returned by /patient/home, so remember what was typed for this session.
  const [relations, setRelations] = useState(() => { try { return JSON.parse(sessionStorage.getItem('oc_relations') || '{}'); } catch { return {}; } });

  useEffect(() => {
    if (params.get('add')) { setAdding(true); params.delete('add'); setParams(params, { replace: true }); }
  }, [params, setParams]);

  if (homeLoading) return <PageSkeleton />;

  const submit = (e) => {
    e.preventDefault();
    run('add', async () => {
      const p = await api.post('/family', form);
      const next = { ...relations, [p.id]: form.relation };
      setRelations(next);
      try { sessionStorage.setItem('oc_relations', JSON.stringify(next)); } catch { /* ignore */ }
      await reloadHome();
      hub.reload();
      refresh?.();
      setAdding(false);
      setForm(EMPTY);
    }, `${firstName(form.name)} has their own health passport now`);
  };

  const today = localISO().slice(0, 10);

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Family" title="Your family's health, together"
        subtitle="Look after children and elders from one phone. Each person gets their own passport, records and privacy settings.">
        <Button icon={UserPlus} onClick={() => setAdding(true)}>Add family member</Button>
      </PageHeader>

      {profiles.length === 0 ? (
        <Card><Empty icon={Users} title="Just you for now">Add your children or parents to book consults and keep records for them.</Empty></Card>
      ) : (
        <div className="hl-fam-grid fade-in">
          {profiles.map((p) => {
            const on = p.id === patient?.id;
            const rel = p.self ? 'You' : relations[p.id] || relationOf(p);
            const c = cards.get(p.id);
            return (
              <article key={p.id} className={cx('card hl-fam', on && 'on')}>
                <div className="row top">
                  <Avatar name={p.name} size="lg" />
                  <div className="grow">
                    <h3 className="mb-0" translate="no">{p.name}</h3>
                    <div className="small muted">{rel}{p.age != null ? ` · ${p.age === 0 ? 'under 1 yr' : `${p.age} yrs`}` : ''}{p.gender && p.gender !== 'Prefer not to say' ? ` · ${p.gender}` : ''}</div>
                    <div className="tiny muted mono mt-1" dir="ltr" translate="no">{p.id}</div>
                  </div>
                </div>
                <HubRows c={c} loading={hub.loading && !hub.data} onVaccines={() => actFor(p, '/patient/vaccines')} />
                <div className="hl-fam-actions">
                  {on ? (
                    <span className="badge green"><Check /> Viewing now</span>
                  ) : (
                    <Button size="sm" variant="secondary" icon={ArrowRightLeft} onClick={() => switchProfile(p.id)}>
                      {p.self ? 'Switch back to me' : `Look after ${firstName(p.name)}`}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={Video} onClick={() => actFor(p, '/patient/consult')}>Book doctor</Button>
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => actFor(p, '/patient/tracker')}>Add reading</Button>
                </div>
              </article>
            );
          })}
          <button className="card hl-fam-add" onClick={() => setAdding(true)}>
            <span className="pt-switch-plus big"><UserPlus size={22} /></span>
            <strong>Add someone</strong>
            <span className="small muted">A child, parent or anyone you care for</span>
          </button>
        </div>
      )}

      <Card className="tint">
        <div className="row top">
          <HeartHandshake className="pt-clay" />
          <div className="grow small">
            <strong>How family profiles work</strong>
            <p className="muted mb-0">When you switch to someone, everything — consults, medicines, records — is saved to <em>their</em> passport, not yours. Elders who have their own phone can later take over their profile with an OTP.</p>
          </div>
        </div>
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a family member" subtitle="Only name and date of birth are needed now. You can fill in the rest later.">
        <form className="stack" onSubmit={submit}>
          <Field label="Full name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Aarav Kumar" autoFocus /></Field>
          <div className="grid two">
            <Field label="Date of birth"><input className="input" type="date" required max={today} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
            <Field label="They are your…">
              <select className="select" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
                <option value="">Choose</option>
                {RELATIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Gender">
              <select className="select" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option>
              </select>
            </Field>
            <Field label="Blood group">
              <select className="select" value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
                {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b === 'Unknown' ? 'Don’t know yet' : b}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Allergies" hint="Separate with commas. Leave blank if none or not sure."><input className="input" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="e.g. Penicillin, peanuts" /></Field>
          <Field label="Long-term conditions" hint="Separate with commas."><input className="input" value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} placeholder="e.g. Asthma, BP" /></Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" loading={busy === 'add'}>Create passport</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// The four things a carer checks for each person: next visit, vaccines, medicines running low, latest reading.
function HubRows({ c, loading, onVaccines }) {
  if (loading) return <div className="small muted">Loading…</div>;
  if (!c) return null;
  const v = c.vaccines;
  const visit = c.nextAppointment;
  const r = c.latestReading;
  return (
    <div className="hl-fam-rows">
      <div className="hl-fam-row"><CalendarClock /><span className="grow">
        {visit ? <>Next visit: <strong>{visit.status === 'scheduled' ? new Date(visit.at).toLocaleString(getLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : visit.status === 'in_progress' ? 'happening now' : 'in the queue'}</strong>{visit.doctorName ? <> · <span translate="no">{visit.doctorName}</span></> : null}</> : <span className="muted">No visits booked</span>}
      </span></div>
      <div className="hl-fam-row"><Syringe /><span className="grow">
        {!c.hasDob ? <span className="muted">Add a date of birth to see vaccines due</span>
          : v?.child ? (
            v.overdue || v.due ? <button type="button" className="hl-link" onClick={onVaccines}><strong className={v.overdue ? 'pt-clay' : ''}>{[v.overdue ? `${v.overdue} overdue` : '', v.due ? `${v.due} due now` : ''].filter(Boolean).join(', ')}</strong>{v.dueNames?.length ? <span className="muted"> · {v.dueNames.slice(0, 2).join(', ')}{v.dueNames.length > 2 ? '…' : ''}</span> : null}</button>
              : v.next ? <button type="button" className="hl-link" onClick={onVaccines}>Next vaccine: <strong>{v.next.name}</strong> on {dayLabel(v.next.dueOn)}</button> : <span className="muted">Childhood vaccines all done</span>
          ) : v?.due ? <button type="button" className="hl-link" onClick={onVaccines}><strong>{v.next?.name} due</strong></button>
            : <button type="button" className="hl-link muted" onClick={onVaccines}>Flu &amp; tetanus reminders</button>}
      </span></div>
      <div className="hl-fam-row"><Pill /><span className="grow">
        {c.lowMeds.length ? c.lowMeds.slice(0, 2).map((m) => <span key={m.rxId} className="block"><strong>{m.label}</strong> {m.daysLeft > 0 ? `run out in ${m.daysLeft} day${m.daysLeft === 1 ? '' : 's'}` : 'have run out'}</span>) : <span className="muted">No medicines running low</span>}
      </span></div>
      <div className="hl-fam-row"><Activity /><span className="grow">
        {r ? <><strong translate="no" dir="ltr">{READING_KINDS[r.kind].short} {readingValue(r)}</strong> <span className="muted">{READING_KINDS[r.kind].unit} · {timeAgo(r.at)}</span> <FlagBadge flag={r.flag} /></> : <span className="muted">No home readings yet</span>}
      </span></div>
    </div>
  );
}
