import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Syringe, Check, Upload, Info, ExternalLink, Plus, Undo2 } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, Empty, Field, Modal, Switch, cx, useAction } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, usePatientLive, firstName, localISO, PageSkeleton } from './shared';
import { dayLabel } from './health';

const STATUS = {
  given: { label: 'Given', tone: 'green' },
  due: { label: 'Due now', tone: 'sun' },
  overdue: { label: 'Overdue', tone: 'rose' },
  upcoming: { label: 'Upcoming', tone: '' },
  missed: { label: 'Ask doctor', tone: '' },
};
const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export default function Vaccines() {
  const { patient, profiles } = usePatient();
  const { data, loading, error, reload, setData } = usePatientLive('/patient/vaccines', ['vaccines', 'records']);
  const [marking, setMarking] = useState(null); // { code, name }
  const [run, busy] = useAction();
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;
  const name = firstName(patient?.name);

  const groups = useMemo(() => {
    const out = [];
    for (const d of data?.schedule || []) {
      let g = out.find((x) => x.label === d.group);
      if (!g) { g = { label: d.group, items: [] }; out.push(g); }
      g.items.push(d);
    }
    return out;
  }, [data]);

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <Empty title="Couldn't load the vaccine schedule">{error}</Empty>;

  const undo = (d) => run(`undo-${d.code}`, async () => setData(await api.del(`/patient/vaccines/${d.code}`)), 'Marked as not given');
  const uploadCard = (file) => run('card', async () => {
    if (!FILE_TYPES.includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Please choose a PDF, PNG, JPG or WEBP under 10 MB.');
    const stored = await api.upload(file);
    await api.post('/patient/records/upload', { title: 'Vaccination card', date: localISO().slice(0, 10), fileName: file.name, fileId: stored.id });
  }, 'Card saved to records');

  const counts = (data.schedule || []).reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
  const title = isSelf ? 'Your vaccinations' : `${name}’s vaccinations`;

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Vaccinations" title={title}
        subtitle={data.child ? 'Every vaccine on the free government schedule, with what’s due next. Mark each one once it’s given.' : 'Keep a record of vaccines and get a nudge when a flu shot or tetanus booster is due.'}>
        <label className="btn secondary">
          <Upload size={16} /> {busy === 'card' ? 'Uploading…' : 'Upload card photo'}
          <input type="file" hidden accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadCard(f); }} />
        </label>
      </PageHeader>

      {!data.hasDob && (
        <div className="callout"><Info /><span>Add a date of birth in <Link to="/patient/settings">Settings</Link> to see which vaccines are due.</span></div>
      )}

      {data.child && (
        <>
          <div className="callout sky">
            <Info />
            <div className="grow small">
              <strong className="block">{data.note}</strong>
              Source: <a href={data.source.url} target="_blank" rel="noreferrer noopener">{data.source.name} <ExternalLink size={12} className="inline-ic" /></a>
            </div>
          </div>
          <div className="hl-vax-sum">
            {counts.overdue ? <span className="badge rose">{counts.overdue} overdue</span> : null}
            {counts.due ? <span className="badge sun">{counts.due} due now</span> : null}
            <span className="badge green">{counts.given || 0} of {data.schedule.length} given</span>
          </div>
          <div className="grid side">
            <div className="stack">
              {groups.map((g) => (
                <section key={g.label} className="hl-vax-group" aria-label={g.label}>
                  <h4>{g.label}</h4>
                  {g.items.map((d) => (
                    <DoseRow key={d.code} d={d} busy={busy} onMark={() => setMarking({ code: d.code, name: d.name, min: data.profile.dob })} onUndo={() => undo(d)} />
                  ))}
                </section>
              ))}
            </div>
            <div className="stack lg">
              <Card title="Optional vaccines">
                <p className="small muted mt-0">Recommended by the Indian Academy of Pediatrics (IAP), not part of the free government schedule. Talk to your doctor about these.</p>
                <div className="stack">
                  {data.optional.map((o) => (
                    <div key={o.code} className={cx('hl-vax', o.given && 'given')}>
                      <div className="grow">
                        <strong className="small block">{o.name}</strong>
                        <span className="tiny muted">{o.when} · {o.protects}</span>
                        {o.given && <span className="tiny block">Given {dayLabel(o.given.date, { day: 'numeric', month: 'short', year: 'numeric' })}{o.given.place ? ` at ${o.given.place}` : ''}</span>}
                      </div>
                      {o.given
                        ? <Button size="sm" variant="ghost" icon={Undo2} loading={busy === `undo-${o.code}`} onClick={() => undo(o)}>Undo</Button>
                        : <Button size="sm" variant="secondary" onClick={() => setMarking({ code: o.code, name: o.name, min: data.profile.dob })}>Mark given</Button>}
                    </div>
                  ))}
                </div>
              </Card>
              <OtherCard data={data} onAdd={() => setMarking({ code: 'other', name: '', min: data.profile.dob })} />
            </div>
          </div>
        </>
      )}

      {!data.child && data.adult && (
        <div className="grid side">
          <div className="stack">
            {Object.entries(data.adult).map(([k, a]) => (
              <Card key={k}>
                <div className="row between top" style={{ gap: 12 }}>
                  <div className="grow">
                    <h3 className="mb-0">{a.name}</h3>
                    <p className="small muted mb-0">{a.every === 1 ? 'Recommended every year, especially for over-65s, diabetes, heart or lung disease, and in pregnancy.' : 'A booster every 10 years, and after a deep or dirty wound if it has been 5+ years.'}</p>
                    <p className="small mb-0 mt-1">
                      {a.last ? <>Last: <strong>{dayLabel(a.last.date, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>{a.last.place ? ` at ${a.last.place}` : ''}</> : 'No dose recorded yet.'}
                      {a.on && a.dueOn ? <> · Next: <strong>{a.status === 'due' ? 'due now' : dayLabel(a.dueOn, { day: 'numeric', month: 'short', year: 'numeric' })}</strong></> : null}
                    </p>
                  </div>
                  <Switch checked={a.on} label={`Remind me about the ${a.name}`} onChange={(on) => run(`pref-${k}`, async () => setData(await api.put('/patient/vaccines/reminders', { [k]: on })), on ? 'Reminder on' : 'Reminder off')} />
                </div>
                <div className="row wrap mt-2" style={{ gap: 8 }}>
                  <Button size="sm" variant="secondary" icon={Check} onClick={() => setMarking({ code: `adult_${k}`, name: a.name, min: data.profile.dob })}>I had it — record date</Button>
                </div>
              </Card>
            ))}
            <p className="tiny muted mb-0">Reminders are off unless you switch them on. Ask your doctor which vaccines are right for you.</p>
          </div>
          <OtherCard data={data} onAdd={() => setMarking({ code: 'other', name: '', min: data.profile.dob })} />
        </div>
      )}

      <MarkModal target={marking} onClose={() => setMarking(null)} onSaved={(plan) => { setData(plan); setMarking(null); reload(); }} />
    </div>
  );
}

function DoseRow({ d, busy, onMark, onUndo }) {
  const s = STATUS[d.status];
  return (
    <div className={cx('hl-vax', d.status)}>
      <span className={cx('pt-ic-tile', d.status === 'given' ? 'green' : d.status === 'overdue' ? 'clay' : 'sky')}>{d.status === 'given' ? <Check size={16} /> : <Syringe size={16} />}</span>
      <div className="grow">
        <strong className="small block">{d.name}</strong>
        <span className="tiny muted">{d.protects}</span>
        <span className="tiny block">
          {d.status === 'given'
            ? <>Given {dayLabel(d.given.date, { day: 'numeric', month: 'short', year: 'numeric' })}{d.given.place ? ` at ${d.given.place}` : ''}</>
            : d.status === 'missed'
              ? <>Past its usual age (due {dayLabel(d.dueOn, { day: 'numeric', month: 'short', year: 'numeric' })}). If it was given, mark it; if not, ask your doctor about a catch-up dose.</>
              : <>Due {dayLabel(d.dueOn, { day: 'numeric', month: 'short', year: 'numeric' })}{d.status === 'upcoming' && d.daysUntil <= 30 ? ` · in ${d.daysUntil} day${d.daysUntil === 1 ? '' : 's'}` : ''}{d.status === 'overdue' ? ' · please get it soon' : ''}</>}
        </span>
        {d.note && <span className="tiny muted block">{d.note}</span>}
      </div>
      <span className={cx('badge', s.tone)}>{s.label}</span>
      {d.status === 'given'
        ? <Button size="sm" variant="ghost" icon={Undo2} loading={busy === `undo-${d.code}`} onClick={onUndo}>Undo</Button>
        : d.status !== 'upcoming' || d.daysUntil <= 30 ? <Button size="sm" variant={d.status === 'missed' ? 'ghost' : 'secondary'} onClick={onMark}>Mark given</Button> : null}
    </div>
  );
}

function OtherCard({ data, onAdd }) {
  return (
    <Card title="Other vaccinations" action={<Button size="sm" variant="ghost" icon={Plus} onClick={onAdd}>Add</Button>}>
      {data.other.length === 0 ? <p className="small muted mb-0">Anything not on the list above — e.g. COVID-19, rabies, hepatitis A for travel.</p> : (
        <div className="stack">
          {data.other.map((v, i) => <div key={`${v.name}-${v.date}-${i}`} className="small"><strong>{v.name}</strong> <span className="muted">· {dayLabel(v.date, { day: 'numeric', month: 'short', year: 'numeric' })}{v.place ? ` · ${v.place}` : ''}</span></div>)}
        </div>
      )}
    </Card>
  );
}

function MarkModal({ target, onClose, onSaved }) {
  const [form, setForm] = useState({ date: localISO().slice(0, 10), place: '', name: '' });
  const [run, busy] = useAction();
  if (!target) return <Modal open={false} />;
  const other = target.code === 'other';
  const submit = (e) => {
    e.preventDefault();
    run('mark', async () => {
      const plan = await api.post('/patient/vaccines', { code: target.code, date: form.date, place: form.place || undefined, name: other ? form.name : undefined });
      setForm({ date: localISO().slice(0, 10), place: '', name: '' });
      onSaved(plan);
    }, 'Vaccination recorded');
  };
  return (
    <Modal open onClose={onClose} title={other ? 'Add a vaccination' : `Mark ${target.name} as given`} subtitle="Copy the date from the vaccination card if you have it.">
      <form className="stack" onSubmit={submit}>
        {other && <Field label="Vaccine name"><input className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. COVID-19 booster" /></Field>}
        <div className="grid two">
          <Field label="Date given"><input className="input" type="date" required min={target.min || undefined} max={localISO().slice(0, 10)} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Where" hint="Optional"><input className="input" maxLength={120} value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="e.g. PHC, anganwadi, clinic" /></Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy === 'mark'}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
