import { useState } from 'react';
import { Baby, CalendarCheck, Syringe, Pill, AlertTriangle, Phone, CheckCircle2, Circle, Clock, Plus, Info } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Field, Modal, cx, fmtDate, useAction } from '../../components/ui';
import { api } from '../../api';
import { usePatientLive, usePatient, firstName, PageSkeleton } from './shared';

const today = () => new Date().toISOString().slice(0, 10);
const STATE = {
  done: { icon: CheckCircle2, tone: 'green', word: 'Done' },
  due: { icon: Clock, tone: 'sun', word: 'Due now' },
  missed: { icon: AlertTriangle, tone: 'rose', word: 'Missed — get checked soon' },
  upcoming: { icon: Circle, tone: '', word: 'Coming up' },
};

// Pregnancy care: week by week, the four check-ups, Td injections, tablets and the danger signs — from the
// Mother & Child Protection card. Tracks what was done; the doctor decides everything medical.
export default function Pregnancy() {
  const { patient, profileKey } = usePatient();
  const { data, reload } = usePatientLive('/patient/pregnancy', ['patients']);
  const [run, busy] = useAction();
  const [start, setStart] = useState({ by: 'lmp', date: '' });
  const [visitOpen, setVisitOpen] = useState(false);
  const [warnings, setWarnings] = useState([]);
  if (!data) return <PageSkeleton />;
  const pg = data.pregnancy;
  const pl = pg?.plan;
  const who = profileKey === 'self' ? 'your' : `${firstName(patient?.name)}’s`;

  const begin = async () => {
    const ok = await run('start', () => api.post('/patient/pregnancy', start.by === 'lmp' ? { lmp: start.date } : { edd: start.date }), 'Pregnancy care is on — we’ll remind you before each check-up');
    if (ok) reload();
  };
  const td = async () => { if (await run('td', () => api.post('/patient/pregnancy/td', { date: today() }), 'Td injection recorded')) reload(); };
  const end = async (outcome) => {
    if (!window.confirm(outcome === 'delivered' ? 'Mark the baby as born? Pregnancy care will close and you can add the baby under Family.' : 'Close pregnancy care for this profile?')) return;
    if (await run('end', () => api.post('/patient/pregnancy/end', { outcome }), outcome === 'delivered' ? 'Congratulations! Add your baby under Family members for vaccine reminders.' : 'Pregnancy care closed')) reload();
  };

  return (
    <div className="stack lg">
      <PageHeader eyebrow="My health" title="Pregnancy care" subtitle={`Check-ups, injections and tablets for a safe pregnancy — ${who} week-by-week guide.`} />

      <Danger danger={data.danger} />

      {!pg ? (
        data.canTrack ? (
          <Card title={<h3 className="row" style={{ gap: 8 }}><Baby size={20} /> Start pregnancy care</h3>}>
            <p className="small mt-0">Tell us one date and we’ll work out the due date, the four check-ups and when each injection and tablet is due. You’ll get a reminder before each check-up.</p>
            <div className="chip-select">
              <button type="button" className={cx('chip', start.by === 'lmp' && 'on')} onClick={() => setStart({ ...start, by: 'lmp' })}>First day of last period</button>
              <button type="button" className={cx('chip', start.by === 'edd' && 'on')} onClick={() => setStart({ ...start, by: 'edd' })}>Due date from my doctor</button>
            </div>
            <Field label={start.by === 'lmp' ? 'First day of the last period' : 'Due date'}>
              <input className="input" type="date" value={start.date} max={start.by === 'lmp' ? today() : undefined} onChange={(e) => setStart({ ...start, date: e.target.value })} />
            </Field>
            <Button icon={Baby} loading={busy === 'start'} disabled={!start.date} onClick={begin}>Start</Button>
          </Card>
        ) : <Card><p className="small mb-0">Pregnancy care can be turned on from a woman’s profile.</p></Card>
      ) : (
        <>
          <Card>
            <div className="row wrap" style={{ gap: 16, alignItems: 'center' }}>
              <div className="preg-week"><strong>{pl.week}</strong><span>weeks{pl.days ? ` ${pl.days}d` : ''}</span></div>
              <div className="grow">
                <h3 className="mb-0">Trimester {pl.trimester}</h3>
                <div className="small">Due date <strong>{fmtDate(pg.edd)}</strong>{pl.daysToEdd > 0 ? ` · ${pl.daysToEdd} days to go` : pl.daysToEdd > -14 ? ' · any day now' : ''}</div>
                <div className="preg-bar"><span style={{ width: `${Math.min(100, (pl.week / 40) * 100)}%` }} /></div>
              </div>
            </div>
            {pl.next && <div className="callout sky small mt-2"><CalendarCheck /><span><strong>Next: {pl.next.label}</strong> — {pl.next.status === 'due' ? `due by ${fmtDate(pl.next.dueBy)}` : `from ${fmtDate(pl.next.dueFrom)}`}. {pl.next.what}</span></div>}
          </Card>

          {warnings.length > 0 && <div className="callout rose small"><AlertTriangle /><span>{warnings.join(' ')}</span></div>}

          <Card title={<h3 className="row" style={{ gap: 8 }}><CalendarCheck size={18} /> Check-ups</h3>} action={<Button size="sm" icon={Plus} onClick={() => setVisitOpen(true)}>Add a check-up</Button>}>
            <div className="stack" style={{ gap: 10 }}>
              {pl.anc.map((a) => {
                const s = STATE[a.status];
                return (
                  <div key={a.n} className={cx('preg-step', a.status)}>
                    <s.icon size={20} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <strong className="small">{a.label}</strong> <span className={cx('badge', s.tone)}>{a.status === 'done' ? `Done ${fmtDate(a.doneOn)}` : s.word}</span>
                      <div className="tiny muted">Weeks {a.from === 0 ? 'up to 12' : `${a.from}–${a.to}`} · {fmtDate(a.dueFrom)} – {fmtDate(a.dueBy)}</div>
                      {a.status !== 'done' && <div className="tiny">{a.what}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            {pg.visits.length > 0 && (
              <details className="mt-2">
                <summary className="small">Recorded check-ups ({pg.visits.length})</summary>
                <ul className="small" style={{ paddingLeft: 18 }}>
                  {pg.visits.slice().reverse().map((v) => <li key={v.id}>{fmtDate(v.date)}{v.place ? ` · ${v.place}` : ''}{v.bp ? ` · BP ${v.bp}` : ''}{v.weightKg ? ` · ${v.weightKg} kg` : ''}{v.hb ? ` · Hb ${v.hb}` : ''}{v.notes ? ` — ${v.notes}` : ''}</li>)}
                </ul>
              </details>
            )}
          </Card>

          <div className="grid two">
            <Card title={<h3 className="row" style={{ gap: 8 }}><Syringe size={18} /> Td injections</h3>}>
              <p className="small mt-0">{pl.td.given.length ? `Given: ${pl.td.given.map(fmtDate).join(', ')}.` : 'Not recorded yet.'} {pl.td.next ? `Dose ${pl.td.next.dose} ${pl.td.next.dose === 1 ? 'at the first check-up' : `from ${fmtDate(pl.td.next.from)}`}.` : 'Both doses done.'}</p>
              {pl.td.next && pl.td.next.from <= today() && <Button size="sm" variant="secondary" loading={busy === 'td'} onClick={td}>I got Td {pl.td.next.dose} today</Button>}
            </Card>
            <Card title={<h3 className="row" style={{ gap: 8 }}><Pill size={18} /> Tablets</h3>}>
              <ul className="small mb-0" style={{ paddingLeft: 18 }}>
                {[pl.tablets.folicAcid, pl.tablets.ifa, pl.tablets.calcium].filter(Boolean).map((t) => <li key={t}>{t}</li>)}
              </ul>
              <p className="tiny muted mb-0">Free at government health centres. Take as your doctor or ANM advises.</p>
            </Card>
          </div>

          <Card title={<h3 className="row" style={{ gap: 8 }}><Info size={18} /> Good to know</h3>}>
            <ul className="small mb-0" style={{ paddingLeft: 18 }}>{data.tips.map((t) => <li key={t}>{t}</li>)}</ul>
          </Card>

          <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" icon={Baby} loading={busy === 'end'} onClick={() => end('delivered')}>Baby is born</Button>
            <Button variant="ghost" onClick={() => end('other')}>Close pregnancy care</Button>
          </div>
          {visitOpen && <VisitModal onClose={() => setVisitOpen(false)} onSaved={(w) => { setWarnings(w || []); setVisitOpen(false); reload(); }} />}
        </>
      )}
    </div>
  );
}

function Danger({ danger }) {
  return (
    <div className="callout rose">
      <AlertTriangle />
      <div className="grow">
        <strong>Go to a hospital at once if you have:</strong>
        <div className="small">{danger.join(' · ')}</div>
        <div className="row wrap mt-1" style={{ gap: 8 }}>
          <a className="btn sm" href="tel:102"><Phone size={15} /> Call 102 (free ambulance)</a>
          <a className="btn sm secondary" href="tel:108"><Phone size={15} /> 108 emergency</a>
        </div>
      </div>
    </div>
  );
}

function VisitModal({ onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), place: '', bp: '', weightKg: '', hb: '', notes: '' });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const r = await run('v', () => api.post('/patient/pregnancy/visits', f), 'Check-up saved');
    if (r) onSaved(r.warnings);
  };
  return (
    <Modal open onClose={onClose} title="Add a check-up" subtitle="Copy what’s written on the Mother & Child Protection card. Leave blank what you don’t know.">
      <div className="stack">
        <div className="grid two">
          <Field label="Date"><input className="input" type="date" value={f.date} max={today()} onChange={set('date')} /></Field>
          <Field label="Where"><input className="input" value={f.place} onChange={set('place')} placeholder="e.g. PHC, hospital, ANM visit" /></Field>
          <Field label="BP"><input className="input" value={f.bp} onChange={set('bp')} placeholder="120/80" inputMode="numeric" /></Field>
          <Field label="Weight (kg)"><input className="input" value={f.weightKg} onChange={set('weightKg')} inputMode="decimal" /></Field>
          <Field label="Hb (g/dL)"><input className="input" value={f.hb} onChange={set('hb')} inputMode="decimal" placeholder="e.g. 11.2" /></Field>
        </div>
        <Field label="Notes"><textarea className="textarea" rows={2} value={f.notes} onChange={set('notes')} placeholder="e.g. ultrasound normal, started iron tablets" /></Field>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy === 'v'} onClick={save}>Save check-up</Button>
        </div>
      </div>
    </Modal>
  );
}
