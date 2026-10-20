import { useEffect, useState } from 'react';
import { UserPlus, Video, Stethoscope } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Avatar, Button, Field, Modal, Switch, Empty, Pills, useAction, useToast } from '../../components/ui';
import { api } from '../../api';
import { useLive } from '../../live';
import { AvailBadge, AvailLine, availClass } from '../../components/Availability';
import { ClinicDoctors } from '../doctor/Clinic';

const SHIFTS = ['08:00 – 16:00', '09:00 – 17:00', '10:00 – 18:00', '16:00 – 00:00', '00:00 – 08:00'];

export default function Roster({ home, setData, reload }) {
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const roster = home.roster || [];
  const depts = [...new Set([...(home.facility.departments || []), ...roster.map((r) => r.department)])];

  const toggle = async (r, key, value) => {
    // Optimistic — the switch should feel instant on a busy ward round.
    setData((d) => ({ ...d, roster: d.roster.map((x) => (x.id === r.id ? { ...x, [key]: value } : x)) }));
    try {
      await api.put(`/hospital/roster/${r.id}`, { [key]: value });
      if (key === 'teleconsult') toast(value ? `${r.name} is now visible for teleconsults` : `${r.name} removed from the teleconsult pool`);
    } catch (e) {
      toast(e.message, 'error');
      reload();
    }
  };

  const list = roster.filter((r) => (filter === 'duty' ? r.onDuty : filter === 'tele' ? r.teleconsult : true));
  const byDept = depts.map((d) => ({ dept: d, people: list.filter((r) => r.department === d) })).filter((g) => g.people.length);

  return (
    <>
      <PageHeader title="Staff roster" subtitle="Who's in today, and who can take a video consult for the network when they have a free moment.">
        <Button icon={UserPlus} onClick={() => setAdding(true)}>Add staff</Button>
      </PageHeader>

      <ListedDoctors />

      {(home.doctors || []).length > 0 && (
        <div className="card mb-2">
          <div className="row between wrap mb-1">
            <h4 className="mb-0 row" style={{ gap: 8 }}><Stethoscope size={17} />Our doctors on Sehatra</h4>
            <span className="tiny muted">Availability follows each doctor&apos;s own hours — automatically</span>
          </div>
          <div className="hs-docs">
            {(home.doctors || []).map((d) => (
              <div key={d.id} className={`hs-doc ${availClass(d.availability)}`}>
                <Avatar name={d.name} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <strong className="small" translate="no">{d.name}</strong>
                  <div className="tiny muted">{d.specialty}</div>
                  <AvailLine a={d.availability} />
                </div>
                <AvailBadge a={d.availability} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row wrap between mb-2">
        <Pills value={filter} onChange={setFilter} options={[
          { value: 'all', label: `Everyone (${roster.length})` },
          { value: 'duty', label: `On duty (${roster.filter((r) => r.onDuty).length})` },
          { value: 'tele', label: `Teleconsult (${roster.filter((r) => r.teleconsult).length})` },
        ]} />
        <span className="tiny muted">Changes save as you flip the switch.</span>
      </div>

      {byDept.length === 0 ? <div className="card"><Empty icon={Stethoscope} title="Nobody here">Try another filter, or add a staff member.</Empty></div> : (
        <div className="stack lg">
          {byDept.map((g) => (
            <section key={g.dept} className="card roster-group">
              <div className="roster-dept">
                <h4 className="mb-0">{g.dept}</h4>
                <span className="tiny muted">{g.people.filter((p) => p.onDuty).length} on duty</span>
              </div>
              {g.people.map((r) => (
                <div key={r.id} className="roster-row">
                  <Avatar name={r.name} />
                  <div className="grow">
                    <strong className="small">{r.name}</strong>
                    <div className="tiny muted">Shift {r.shift}</div>
                  </div>
                  <div className="roster-toggle">
                    <span className="tiny">{r.onDuty ? 'On duty' : 'Off duty'}</span>
                    <Switch checked={r.onDuty} onChange={(v) => toggle(r, 'onDuty', v)} label={`${r.name} on duty`} />
                  </div>
                  <div className="roster-toggle">
                    <span className="tiny row" style={{ gap: 4 }}><Video size={13} /> Teleconsult</span>
                    <Switch checked={r.teleconsult} onChange={(v) => toggle(r, 'teleconsult', v)} label={`${r.name} available for teleconsult`} />
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <AddStaff open={adding} onClose={() => setAdding(false)} depts={depts} onAdded={reload} />
    </>
  );
}

function AddStaff({ open, onClose, depts, onAdded }) {
  const [run, busy] = useAction();
  const blank = () => ({ name: '', department: depts[0] || '', shift: SHIFTS[1] });
  const [form, setForm] = useState(blank);
  useEffect(() => { if (open) setForm(blank()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- a cancelled form starts clean next time
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run('add', () => api.post('/hospital/roster', form), `${form.name} added to the roster`);
    if (ok) { onAdded(); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a staff member" subtitle="They'll show up as on duty straight away. You can switch that off later.">
      <form className="stack" onSubmit={submit}>
        <Field label="Full name"><input className="input" value={form.name} onChange={set('name')} placeholder="Dr. Anjali Verma" required autoFocus /></Field>
        <div className="grid two" style={{ gap: 12 }}>
          <Field label="Department">
            <select className="select" value={form.department} onChange={set('department')}>
              {depts.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Shift">
            <select className="select" value={form.shift} onChange={set('shift')}>
              {SHIFTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy === 'add'}>Add to roster</Button>
        </div>
      </form>
    </Modal>
  );
}

// Doctors this hospital lists on Sehatra — patients within 20 km can find and book them.
function ListedDoctors() {
  // Live: a listed doctor who signs up, gets verified or is removed updates this list without a refresh.
  const { data, setData } = useLive('/hospital/doctors', ['doctors', 'hospital']);
  const [open, setOpen] = useState(false);
  const [run, busy] = useAction();
  if (!data) return null;
  return (
    <div className="card mb-2">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div><h4 className="mb-0 row" style={{ gap: 8 }}><Stethoscope size={17} />Doctors patients can book ({(data.doctors || []).length})</h4><span className="tiny muted">List every doctor here — patients within 20 km see them with timings, fees and reviews.</span></div>
        <Button size="sm" variant={open ? 'ghost' : 'secondary'} icon={UserPlus} onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Manage list'}</Button>
      </div>
      {open && (
        <div className="mt-2">
          <ClinicDoctors who="hospital" doctors={data.doctors || []} specialties={data.specialties} busy={busy}
            onAdd={(body) => run('add', async () => { const r = await api.post('/hospital/doctors', body); setData((d) => ({ ...d, doctors: r.doctors })); return true; }, 'Doctor listed')}
            onRemove={(x) => run(`rm-${x.id}`, async () => { const r = await api.del(`/hospital/doctors/${x.id}`); setData((d) => ({ ...d, doctors: r.doctors })); }, 'Removed')} />
        </div>
      )}
    </div>
  );
}
