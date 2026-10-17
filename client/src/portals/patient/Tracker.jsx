import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Trash2, ShieldCheck, Plus, Info } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, Empty, Field, LineChart, Pills, Switch, fmtDateTime, useAction } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, usePatientLive, firstName, localISO, PageSkeleton } from './shared';
import { READING_KINDS, SUGAR_WHEN, FlagBadge, FlagNote, readingValue } from './health';
import { getLocale } from '../../i18n';

const RANGES = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }];
const KIND_OPTIONS = Object.entries(READING_KINDS).map(([value, k]) => ({ value, label: k.short }));
const EMPTY = { sys: '', dia: '', pulse: '', value: '', context: 'fasting', unit: 'F', heightCm: '', at: '', note: '' };

export default function Tracker() {
  const { patient, profiles } = usePatient();
  const [params] = useSearchParams();
  const [kind, setKind] = useState(() => (READING_KINDS[params.get('kind')] ? params.get('kind') : 'bp'));
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = usePatientLive(`/patient/vitals-log?days=${days}`, ['vitals']);
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [run, busy] = useAction();
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;
  const who = isSelf ? 'your' : `${firstName(patient?.name)}’s`;

  const rows = useMemo(() => (data?.entries || []).filter((e) => e.kind === kind), [data, kind]);
  const chart = useMemo(() => {
    const asc = [...rows].reverse();
    const step = Math.max(1, Math.ceil(asc.length / 6)); // ~6 date labels whatever the number of points
    const labels = asc.map((e, i) => (i % step === 0 || i === asc.length - 1 ? new Date(e.at).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }) : ''));
    if (kind === 'bp') return { labels, series: [{ name: 'Top (systolic)', data: asc.map((e) => e.sys), color: 'var(--rose)' }, { name: 'Bottom (diastolic)', data: asc.map((e) => e.dia), color: 'var(--sky)' }] };
    return { labels, series: [{ name: `${READING_KINDS[kind].label} (${READING_KINDS[kind].unit})`, data: asc.map((e) => e.value), color: 'var(--green-2)' }] };
  }, [rows, kind]);

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <Empty title="Couldn't load your readings">{error}</Empty>;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    const body = { kind, note: form.note || undefined, at: form.at ? new Date(form.at).toISOString() : undefined };
    if (kind === 'bp') Object.assign(body, { sys: Number(form.sys), dia: Number(form.dia), pulse: form.pulse ? Number(form.pulse) : undefined });
    else Object.assign(body, { value: Number(form.value) });
    if (kind === 'sugar') body.context = form.context;
    if (kind === 'temp') body.unit = form.unit;
    if (kind === 'spo2' && form.pulse) body.pulse = Number(form.pulse);
    if (kind === 'weight' && form.heightCm) body.heightCm = Number(form.heightCm);
    run('add', async () => {
      const r = await api.post('/patient/vitals-log', body);
      setResult(r);
      setForm((f) => ({ ...EMPTY, context: f.context, unit: f.unit }));
      reload();
    }, 'Reading saved');
  };
  const remove = (r) => run(`del-${r.id}`, async () => { await api.del(`/patient/vitals-log/${r.id}`); if (result?.id === r.id) setResult(null); reload(); }, 'Reading deleted');

  const latest = data.latest || [];
  const reminder = data.reminder || { on: false, time: '08:00', kind: 'bp' };
  const saveReminder = (patch) => run('rem', async () => { await api.put('/patient/vitals-log/reminder', { ...reminder, ...patch }); reload(); }, patch.on === false ? 'Reminder off' : 'Reminder saved');

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Health tracker" title={isSelf ? 'Your home readings' : `${firstName(patient?.name)}’s home readings`}
        subtitle="Log BP, sugar, weight, oxygen and temperature at home. We'll show the trend and tell you plainly when something needs a doctor." />

      {latest.length > 0 && (
        <div className="hl-latest" role="group" aria-label="Latest readings">
          {latest.map((r) => (
            <button key={r.kind} type="button" className={`hl-latest-item${r.kind === kind ? ' on' : ''}`} onClick={() => setKind(r.kind)}>
              <span className="tiny muted">{READING_KINDS[r.kind].label}</span>
              <strong translate="no" dir="ltr">{readingValue(r)} <span className="tiny muted">{READING_KINDS[r.kind].unit}</span></strong>
              <span className="tiny muted">{fmtDateTime(r.at)}</span>
              <FlagBadge flag={r.flag} />
            </button>
          ))}
        </div>
      )}

      <div className="hl-scroll-x"><Pills options={KIND_OPTIONS} value={kind} onChange={(k) => { setKind(k); setResult(null); }} /></div>

      <div className="grid side">
        <div className="stack lg">
          <Card title={READING_KINDS[kind].label} action={<Pills options={RANGES} value={days} onChange={setDays} />}>
            {rows.length === 0 ? (
              <Empty title={`No ${READING_KINDS[kind].label.toLowerCase()} readings in the last ${days} days`}>Add one with the form — it takes a few seconds.</Empty>
            ) : (
              <>
                <LineChart labels={chart.labels} series={chart.series} height={190} />
                {kind === 'weight' && data.heightCm && rows[0]?.bmi && <p className="small muted mb-0 mt-1">Latest BMI {rows[0].bmi} (height {data.heightCm} cm).</p>}
                <div className="mt-2">
                  {rows.map((r) => (
                    <div key={r.id} className="hl-reading">
                      <div className="grow">
                        <strong translate="no" dir="ltr">{readingValue(r)} {READING_KINDS[r.kind].unit}</strong>
                        {r.context && <span className="small muted"> · {SUGAR_WHEN[r.context]}</span>}
                        {r.pulse ? <span className="small muted" dir="ltr"> · pulse {r.pulse}</span> : null}
                        <div className="tiny muted">{fmtDateTime(r.at)}{r.by && r.by !== patient?.name ? ` · by ${r.by}` : ''}{r.note ? ` · ${r.note}` : ''}</div>
                        <FlagBadge flag={r.flag} />
                      </div>
                      <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete reading" loading={busy === `del-${r.id}`} onClick={() => remove(r)} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="stack lg">
          <Card title={`Add ${READING_KINDS[kind].label.toLowerCase()}`}>
            <form className="stack" onSubmit={submit}>
              {kind === 'bp' && (
                <div className="hl-form-row">
                  <Field label="Top (systolic)"><input className="input" inputMode="numeric" required value={form.sys} onChange={set('sys')} placeholder="120" /></Field>
                  <Field label="Bottom (diastolic)"><input className="input" inputMode="numeric" required value={form.dia} onChange={set('dia')} placeholder="80" /></Field>
                  <Field label="Pulse" hint="Optional"><input className="input" inputMode="numeric" value={form.pulse} onChange={set('pulse')} placeholder="72" /></Field>
                </div>
              )}
              {kind === 'sugar' && (
                <div className="hl-form-row">
                  <Field label="Sugar (mg/dL)"><input className="input" inputMode="numeric" required value={form.value} onChange={set('value')} placeholder="110" /></Field>
                  <Field label="When">
                    <select className="select" value={form.context} onChange={set('context')}>
                      {Object.entries(SUGAR_WHEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                </div>
              )}
              {kind === 'weight' && (
                <div className="hl-form-row">
                  <Field label="Weight (kg)"><input className="input" inputMode="decimal" required value={form.value} onChange={set('value')} placeholder="65" /></Field>
                  <Field label="Height (cm)" hint={data.heightCm ? `Saved: ${data.heightCm} cm` : 'Once, for BMI'}><input className="input" inputMode="decimal" value={form.heightCm} onChange={set('heightCm')} placeholder={data.heightCm ? String(data.heightCm) : '160'} /></Field>
                </div>
              )}
              {kind === 'spo2' && (
                <div className="hl-form-row">
                  <Field label="Oxygen SpO₂ (%)"><input className="input" inputMode="numeric" required value={form.value} onChange={set('value')} placeholder="98" /></Field>
                  <Field label="Pulse" hint="Optional"><input className="input" inputMode="numeric" value={form.pulse} onChange={set('pulse')} placeholder="72" /></Field>
                </div>
              )}
              {kind === 'temp' && (
                <div className="hl-form-row">
                  <Field label="Temperature"><input className="input" inputMode="decimal" required value={form.value} onChange={set('value')} placeholder={form.unit === 'C' ? '37.0' : '98.6'} /></Field>
                  <Field label="Unit">
                    <select className="select" value={form.unit} onChange={set('unit')}><option value="F">°F</option><option value="C">°C</option></select>
                  </Field>
                </div>
              )}
              <div className="hl-form-row">
                <Field label="When was it taken?" hint="Leave blank for now"><input className="input" type="datetime-local" value={form.at} max={localISO().slice(0, 16)} onChange={set('at')} /></Field>
                <Field label="Note" hint="Optional"><input className="input" value={form.note} maxLength={200} onChange={set('note')} placeholder="e.g. after a walk" /></Field>
              </div>
              <Button type="submit" icon={Plus} loading={busy === 'add'}>Save reading</Button>
            </form>
            {result && result.kind === kind && (
              <div className="stack mt-2" aria-live="polite">
                <div className="row wrap" style={{ gap: 8 }}><span className="small">Saved <strong translate="no" dir="ltr">{readingValue(result)} {READING_KINDS[result.kind].unit}</strong></span><FlagBadge flag={result.flag} /></div>
                <FlagNote flag={result.flag} />
              </div>
            )}
          </Card>

          <Card title={<h3 className="row" style={{ gap: 8 }}><Bell size={18} className="pt-green" /> Daily reminder</h3>}>
            <div className="row between" style={{ gap: 12 }}>
              <span className="small">Remind me to log {who} reading every day</span>
              <Switch checked={reminder.on} label="Daily reading reminder" onChange={(on) => saveReminder({ on })} />
            </div>
            <div className="hl-form-row mt-2">
              <Field label="What"><select className="select" value={reminder.kind} onChange={(e) => saveReminder({ kind: e.target.value })}>{Object.entries(READING_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
              <Field label="At"><input className="input" type="time" value={reminder.time} onChange={(e) => e.target.value && saveReminder({ time: e.target.value })} /></Field>
            </div>
            <p className="tiny muted mb-0">An in-app reminder, once a day (India time).</p>
          </Card>

          <Card className="tint">
            <div className="row top"><ShieldCheck className="pt-green" /><div className="grow small">
              <strong>Shared only with doctors you allow</strong>
              <p className="muted mb-0">Doctors you&apos;ve given access to see a short summary of these readings before your consult. Change this anytime in Who sees my data.</p>
            </div></div>
          </Card>
          <div className="callout small"><Info /><span>These guides use standard adult ranges and don&apos;t replace your doctor. For children, ask your paediatrician. In an emergency, call 108.</span></div>
        </div>
      </div>
    </div>
  );
}
