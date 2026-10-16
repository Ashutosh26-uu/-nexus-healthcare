import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus, Check, ArrowRightLeft, Users, HeartHandshake } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Avatar, Button, Card, Empty, Field, Modal, cx, useAction } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, firstName, relationOf, localISO, BLOOD_GROUPS, PageSkeleton } from './shared';

const RELATIONS = ['Son', 'Daughter', 'Mother', 'Father', 'Mother-in-law', 'Father-in-law', 'Spouse', 'Grandparent', 'Sibling', 'Other'];
const EMPTY = { name: '', dob: '', gender: '', relation: '', bloodGroup: 'Unknown', allergies: '', conditions: '' };

export default function Family() {
  const { profiles, patient, switchProfile, reloadHome, homeLoading } = usePatient();
  const { refresh } = useAuth();
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
        <div className="grid three fade-in">
          {profiles.map((p) => {
            const on = p.id === patient?.id;
            const rel = p.self ? 'You' : relations[p.id] || relationOf(p);
            return (
              <article key={p.id} className={cx('card pt-family', on && 'on')}>
                <div className="row top">
                  <Avatar name={p.name} size="lg" />
                  <div className="grow">
                    <h3 className="mb-0" translate="no">{p.name}</h3>
                    <div className="small muted">{rel}{p.age != null ? ` · ${p.age} yrs` : ''}{p.gender && p.gender !== 'Prefer not to say' ? ` · ${p.gender}` : ''}</div>
                    <div className="tiny muted mono mt-1" dir="ltr" translate="no">{p.id}</div>
                  </div>
                </div>
                <div className="pt-family-foot">
                  {on ? (
                    <span className="badge green"><Check /> Viewing now</span>
                  ) : (
                    <Button size="sm" variant="secondary" icon={ArrowRightLeft} onClick={() => switchProfile(p.id)}>
                      {p.self ? 'Switch back to me' : `Look after ${firstName(p.name)}`}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          <button className="card pt-family add" onClick={() => setAdding(true)}>
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
