import { useEffect, useRef, useState } from 'react';
import { Save, Minus, Plus, Languages, IndianRupee, Gauge, RotateCcw, Sun, Moon } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { Button, Card, Field, Loading, Switch, useAction, fmtMoney, cx } from '../../components/ui';
import { useDoctorHome } from './context';
import { AvailBadge } from '../../components/Availability';
import { INDIAN_LANGUAGES } from './shared';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 am – 8 pm
const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;

// Sensible default for a GP who also runs an OPD: mornings + early evenings on weekdays, Saturday morning.
function defaultSlots() {
  const s = {};
  DAYS.forEach((d, i) => {
    if (i < 5) s[d] = [9, 10, 11, 12, 17, 18, 19];
    else if (i === 5) s[d] = [9, 10, 11];
    else s[d] = [];
  });
  return s;
}

export default function Schedule() {
  const home = useDoctorHome();
  const doctor = home.data?.doctor;
  const [slots, setSlots] = useState(null);
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const paint = useRef(null); // { value: true|false } while dragging
  const [run, busy] = useAction();

  useEffect(() => {
    if (doctor && !slots) {
      setSlots(doctor.slots && typeof doctor.slots === 'object' && !Array.isArray(doctor.slots) ? doctor.slots : defaultSlots());
      setForm({ maxPerHour: doctor.maxPerHour || 6, fee: doctor.fee || 0, languages: doctor.languages || [], online: !!doctor.online });
    }
  }, [doctor, slots]);

  useEffect(() => {
    const stop = () => { paint.current = null; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  if (!slots || !form) return <Loading />;

  const has = (d, h) => (slots[d] || []).includes(h);
  const setCell = (d, h, on) => {
    setSlots((s) => {
      const cur = new Set(s[d] || []);
      if (on) cur.add(h); else cur.delete(h);
      return { ...s, [d]: [...cur].sort((a, b) => a - b) };
    });
    setDirty(true);
  };
  const down = (d, h) => { const v = !has(d, h); paint.current = { value: v }; setCell(d, h, v); };
  const enter = (d, h) => { if (paint.current) setCell(d, h, paint.current.value); };
  const setRow = (d, list) => { setSlots((s) => ({ ...s, [d]: list })); setDirty(true); };
  const patch = (p) => { setForm((f) => ({ ...f, ...p })); setDirty(true); };

  const totalHours = DAYS.reduce((n, d) => n + (slots[d]?.length || 0), 0);
  const capacity = totalHours * form.maxPerHour;

  const save = () => run('save', async () => {
    const doc = await api.put('/doctor/me', { slots, maxPerHour: Number(form.maxPerHour), languages: form.languages });
    home.setData((d) => (d ? { ...d, doctor: doc } : d));
    setDirty(false);
  }, 'Availability saved. Patients can book these slots now.');

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Availability" title="Schedule & availability" subtitle={doctor.eClinicPartner ? 'Paint the hours you usually come to the E-Clinic. Patients see you as available only while you are checked in.' : 'Paint your working hours. You show as available to patients during these hours automatically — and faded out once they end.'}>
        <Button variant="ghost" icon={RotateCcw} onClick={() => { setSlots(defaultSlots()); setDirty(true); }}>Reset</Button>
        <Button icon={Save} loading={busy === 'save'} disabled={!dirty} onClick={save}>{dirty ? 'Save changes' : 'Saved'}</Button>
      </PageHeader>

      <div className="grid side">
        <Card title="Weekly slots" action={<span className="tiny muted">{totalHours} hrs/week · up to {capacity} consults</span>}>
          <div className="dr-slot-wrap">
            <div className="dr-slots" style={{ gridTemplateColumns: `52px repeat(${HOURS.length}, minmax(30px, 1fr))` }} onPointerLeave={() => { paint.current = null; }}>
              <span />
              {HOURS.map((h) => <span key={h} className="dr-slot-h">{hourLabel(h)}</span>)}
              {DAYS.map((d) => (
                <div key={d} style={{ display: 'contents' }}>
                  <span className="dr-slot-day">{d}</span>
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={cx('dr-slot', has(d, h) && 'on', h === 13 && 'lunch')}
                      onPointerDown={(e) => { e.preventDefault(); down(d, h); }}
                      onPointerEnter={() => enter(d, h)}
                      aria-pressed={has(d, h)}
                      aria-label={`${d} ${hourLabel(h)}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="row wrap mt-2" style={{ gap: 8 }}>
            <span className="tiny muted">Quick fill:</span>
            <button type="button" className="chip" onClick={() => DAYS.slice(0, 6).forEach((d) => setRow(d, [9, 10, 11, 12]))}><Sun size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Mornings Mon–Sat</button>
            <button type="button" className="chip" onClick={() => DAYS.slice(0, 5).forEach((d) => setRow(d, [...new Set([...(slots[d] || []), 17, 18, 19, 20])].sort((a, b) => a - b)))}><Moon size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Add evenings</button>
            <button type="button" className="chip" onClick={() => setRow('Sun', [])}>Sunday off</button>
            <button type="button" className="chip" onClick={() => DAYS.forEach((d) => setRow(d, []))}>Clear all</button>
          </div>
          <p className="tiny muted mt-1 mb-0">Click or drag across cells. The shaded column is the usual lunch hour.</p>
        </Card>

        <div className="stack">
          <Card>
            {doctor.eClinicPartner ? (
              <div className="row between">
                <div>
                  <h4 className="mb-0">At the E-Clinic</h4>
                  <p className="tiny muted mb-0">Use the switch at the top of the screen when you arrive and when you leave.</p>
                </div>
                <AvailBadge a={doctor.availability} />
              </div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between"><h4 className="mb-0">Your status right now</h4><AvailBadge a={doctor.availability} /></div>
                <p className="tiny muted mb-0">Automatic — follows the hours on the left{doctor.affiliation ? ` at ${doctor.affiliation}` : ''}. No switch needed.</p>
              </div>
            )}
          </Card>
          <Card>
            <Field label={<span className="row" style={{ gap: 6 }}><Gauge size={15} />Max patients per hour</span>} hint="The routing engine stops sending patients once you reach this.">
              <div className="dr-stepper">
                <button type="button" className="icon-btn" onClick={() => patch({ maxPerHour: Math.max(1, form.maxPerHour - 1) })} aria-label="Fewer"><Minus /></button>
                <strong className="serif">{form.maxPerHour}</strong>
                <button type="button" className="icon-btn" onClick={() => patch({ maxPerHour: Math.min(15, form.maxPerHour + 1) })} aria-label="More"><Plus /></button>
                <span className="tiny muted">≈ {Math.round(60 / form.maxPerHour)} min each</span>
              </div>
            </Field>
            <hr className="divider" />
            <Field label={<span className="row" style={{ gap: 6 }}><IndianRupee size={15} />Consultation fee</span>} hint={`You receive ${fmtMoney(Math.round(form.fee * 0.9))} per consult after the 10% platform fee. Kiosk pilot visits are paid by the state.`}>
              <div className="input-wrap">
                <IndianRupee />
                <input className="input" type="number" min="0" step="10" value={form.fee} onChange={(e) => patch({ fee: e.target.value })} />
              </div>
            </Field>
          </Card>
          <Card title={<h4 className="row" style={{ gap: 6, margin: 0 }}><Languages size={16} />Languages you consult in</h4>}>
            <div className="chip-select">
              {INDIAN_LANGUAGES.map((l) => {
                const on = form.languages.includes(l);
                return <button key={l} type="button" className={cx('chip', on && 'on')} onClick={() => patch({ languages: on ? form.languages.filter((x) => x !== l) : [...form.languages, l] })}>{l}</button>;
              })}
            </div>
            <p className="tiny muted mt-1 mb-0">The first language ({form.languages[0] || '—'}) is the one patient notes are translated into.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
