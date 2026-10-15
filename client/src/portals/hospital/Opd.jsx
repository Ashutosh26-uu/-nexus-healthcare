import { useState } from 'react';
import { CalendarPlus, CalendarClock, Smartphone } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Field, Modal, Progress, Empty, Stat, useAction, useToast } from '../../components/ui';
import { api } from '../../api';
import { getLocale } from '../../i18n';

const dayLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(getLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
};
const fmt12 = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export default function Opd({ home, setData, reload }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const slots = [...home.opd].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const booked = slots.reduce((s, o) => s + o.booked, 0);
  const cap = slots.reduce((s, o) => s + o.capacity, 0);

  const saveCap = async (o, value) => {
    const n = Math.max(o.booked, Number(value) || 0);
    if (n === o.capacity) return;
    setData((d) => ({ ...d, opd: d.opd.map((x) => (x.id === o.id ? { ...x, capacity: n } : x)) }));
    try {
      await api.put(`/hospital/opd/${o.id}`, { capacity: n });
      toast(`${o.department} slot now takes ${n} patients`);
    } catch (e) { toast(e.message, 'error'); reload(); }
  };

  return (
    <>
      <PageHeader title="OPD & appointments" subtitle="These slots are what patients see in the Nexus Healthcare app when they book a hospital visit.">
        <Button icon={CalendarPlus} onClick={() => setAdding(true)}>Open a slot</Button>
      </PageHeader>

      <div className="grid three mb-2">
        <Stat label="Upcoming slots" icon={CalendarClock} value={slots.length} />
        <Stat label="Patients booked" value={booked} sub={`${cap - booked} places still open`} />
        <div className="card opd-tip">
          <Smartphone size={20} />
          <span className="small">Full slots disappear from the app automatically. Raise capacity if a doctor can stay late.</span>
        </div>
      </div>

      {slots.length === 0 ? <div className="card"><Empty icon={CalendarClock} title="No OPD slots yet">Open your first slot so patients can book.</Empty></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Day</th><th>Time</th><th>Department</th><th style={{ minWidth: 200 }}>Booked</th><th>Capacity</th></tr></thead>
            <tbody>
              {slots.map((o) => (
                <tr key={o.id}>
                  <td className="nowrap"><strong>{dayLabel(o.date)}</strong></td>
                  <td className="nowrap">{fmt12(o.time)}</td>
                  <td>{o.department}</td>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <div className="grow"><Progress value={o.booked} max={o.capacity} /></div>
                      <span className="small nowrap">{o.booked}/{o.capacity}</span>
                      {o.booked >= o.capacity && <span className="badge rose">Full</span>}
                    </div>
                  </td>
                  <td>
                    <input key={o.capacity} className="input sm opd-cap" type="number" min={o.booked} defaultValue={o.capacity}
                      onBlur={(e) => saveCap(o, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label={`Capacity for ${o.department}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddSlot open={adding} onClose={() => setAdding(false)} depts={home.facility.departments || []} onAdded={reload} />
    </>
  );
}

function AddSlot({ open, onClose, depts, onAdded }) {
  const [run, busy] = useAction();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const blank = { department: depts[0] || '', date: tomorrow, time: '10:00', capacity: 20 };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run('add', () => api.post('/hospital/opd', form), 'Slot opened — patients can book it now');
    if (ok) { onAdded(); onClose(); setForm(blank); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Open an OPD slot">
      <form className="stack" onSubmit={submit}>
        <Field label="Department">
          <select className="select" value={form.department} onChange={set('department')}>
            {depts.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <div className="grid three" style={{ gap: 12 }}>
          <Field label="Date"><input className="input" type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={set('date')} required /></Field>
          <Field label="Start time"><input className="input" type="time" value={form.time} onChange={set('time')} required /></Field>
          <Field label="Patients" hint="How many can be seen"><input className="input" type="number" min="1" value={form.capacity} onChange={set('capacity')} required /></Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy === 'add'}>Open slot</Button>
        </div>
      </form>
    </Modal>
  );
}
