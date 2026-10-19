import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, Ban, RotateCcw, Globe2, Lock, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Empty, Button, Modal, Field, Avatar, StatusBadge, useAction, fmtDate, cx } from '../../components/ui';
import { useLive } from '../../live';
import { useAuth, ROLE_LABEL } from '../../auth';
import { LiveGate, RoleBadge } from './shared';

const FACILITY_ROLE = { kiosk_operator: 'kiosk', hospital_admin: 'hospital', lab_tech: 'lab', pharmacist: 'pharmacy', distributor: 'warehouse' };
const CREATABLE = ['official', 'doctor', 'hospital_admin', 'lab_tech', 'pharmacist', 'distributor', 'kiosk_operator', 'delivery', 'super_admin'];
// Every state and union territory — officials can be created for any of them.
const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

function CreateUserModal({ open, onClose, facilities, onCreated }) {
  const blank = { name: '', email: '', phone: '', role: 'official', scope: 'district', district: '', state: '', facilityId: '', password: '' };
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState('');
  const [run, busy] = useAction();
  // A cancelled form (with its temporary password) must not reappear the next time the modal opens.
  useEffect(() => { if (open) { setForm(blank); setErr(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const facType = FACILITY_ROLE[form.role];
  const facOptions = facType ? facilities.filter((f) => f.type === facType) : [];

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (facType && !form.facilityId) { setErr('Pick the facility this person works at.'); return; }
    const body = { name: form.name, email: form.email, phone: form.phone, role: form.role, password: form.password || undefined };
    if (form.role === 'official') Object.assign(body, { scope: form.scope, district: form.scope === 'national' ? 'New Delhi' : form.district, state: form.scope === 'national' ? 'Delhi' : form.state });
    if (facType) {
      const f = facilities.find((x) => x.id === form.facilityId);
      Object.assign(body, { facilityId: form.facilityId, district: f?.district, state: f?.state });
    }
    const r = await run('create', () => api.post('/admin/users', body), `${form.name} can now sign in`);
    if (r) { setForm(blank); onCreated(); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create an account" subtitle="Share the temporary password privately — they can change it from their profile menu.">
      <form className="stack" onSubmit={submit}>
        {err && <div className="form-error">{err}</div>}
        <div className="grid two" style={{ gap: 12 }}>
          <Field label="Full name"><input className="input" value={form.name} onChange={set('name')} required placeholder="e.g. Dr. R. Srivastava" /></Field>
          <Field label="Role">
            <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, facilityId: '' })}>
              {CREATABLE.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid two" style={{ gap: 12 }}>
          <Field label="Work email"><input className="input" type="email" value={form.email} onChange={set('email')} required placeholder="name@health.gov.in" /></Field>
          <Field label="Mobile"><input className="input" dir="ltr" inputMode="numeric" value={form.phone} onChange={set('phone')} placeholder="10-digit mobile" /></Field>
        </div>

        {form.role === 'official' && (
          <div className="ad-subform">
            <Field label="What can they see?">
              <div className="ad-scope-pick">
                <button type="button" className={cx('ad-scope-opt', form.scope === 'district' && 'on')} onClick={() => setForm({ ...form, scope: 'district' })}>
                  <Lock /><span><strong>One district</strong><span className="tiny muted">District officer — sees only their district</span></span>
                </button>
                <button type="button" className={cx('ad-scope-opt', form.scope === 'national' && 'on')} onClick={() => setForm({ ...form, scope: 'national' })}>
                  <Globe2 /><span><strong>National</strong><span className="tiny muted">Ministry officer — sees every state</span></span>
                </button>
              </div>
            </Field>
            {form.scope === 'district' && (
              <div className="grid two" style={{ gap: 12 }}>
                <Field label="District"><input className="input" value={form.district} onChange={set('district')} placeholder="e.g. Barabanki" required /></Field>
                <Field label="State">
                  <select className="select" value={form.state} onChange={set('state')} required><option value="" disabled>Choose a state</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select>
                </Field>
              </div>
            )}
          </div>
        )}

        {facType && (
          <Field label="Facility" hint={facOptions.length ? 'Only verified facilities can be assigned staff.' : 'No facilities of this type yet.'}>
            <select className="select" value={form.facilityId} onChange={set('facilityId')} required>
              <option value="">Choose…</option>
              {facOptions.map((f) => <option key={f.id} value={f.id} disabled={!f.verified}>{f.name} · {f.district}{f.verified ? '' : ' (unverified)'}</option>)}
            </select>
          </Field>
        )}

        <Field label="Temporary password" hint="At least 8 characters.">
          <input className="input" type="text" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={8} />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" icon={UserPlus} loading={busy === 'create'}>Create account</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Users() {
  const live = useLive('/admin/users', ['admin']);
  const onboarding = useLive('/admin/onboarding', ['admin']);
  const deletions = useLive('/admin/deletions', ['admin', 'patients']);
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [run, busy] = useAction();
  const facilities = onboarding.data?.facilities || [];
  const facName = (id) => facilities.find((f) => f.id === id)?.name;

  const users = useMemo(() => live.data || [], [live.data]);
  const rows = useMemo(() => users
    .filter((u) => !role || u.role === role)
    .filter((u) => !status || u.status === status)
    .filter((u) => !q || `${u.name} ${u.email} ${u.phone} ${u.region?.district || ''}`.toLowerCase().includes(q.toLowerCase())), [users, q, role, status]);

  const setUserStatus = async (u, next) => {
    const r = await run(u.id, () => api.put(`/admin/users/${u.id}/status`, { status: next }), next === 'suspended' ? `${u.name} suspended` : `${u.name} reactivated`);
    if (r) { setConfirm(null); live.reload(); }
  };
  // Lost phone, no backup codes: after checking who is asking, switch their two-step login off.
  const resetMfa = async (u) => {
    if (!window.confirm(`Turn off two-step login for ${u.name}? Only do this after confirming it is really them. They will be signed out everywhere and can set it up again.`)) return;
    const r = await run(`mfa-${u.id}`, () => api.del(`/admin/users/${u.id}/mfa`), `Two-step login turned off for ${u.name}`);
    if (r) live.reload();
  };
  const roleCounts = useMemo(() => { const m = {}; for (const u of users) m[u.role] = (m[u.role] || 0) + 1; return m; }, [users]);

  return (
    <LiveGate live={live}>
      {() => (
        <>
          <PageHeader eyebrow="Access" title="Users & roles" subtitle={`${users.length} accounts. Roles decide what each person can see — officials are scoped to a district or the whole country.`}>
            <Button icon={UserPlus} onClick={() => setCreating(true)}>Create user</Button>
          </PageHeader>

          <Card>
            <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
              <div className="input-wrap grow" style={{ minWidth: 220 }}>
                <Search />
                <input className="input sm" placeholder="Search name, email, phone or district" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className="select sm" style={{ width: 'auto' }} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
                <option value="">All roles</option>
                {Object.keys(ROLE_LABEL).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]} ({roleCounts[r] || 0})</option>)}
              </select>
              <select className="select sm" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
                <option value="deleted">Deleted</option>
              </select>
            </div>
            {rows.length === 0 ? <Empty title="No one matches">Try a different search or clear the filters.</Empty> : (
              <div className="table-wrap">
                <table className="table ad-users">
                  <thead><tr><th>Person</th><th>Role</th><th>Scope / workplace</th><th>Status</th><th>Joined</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {rows.map((u) => (
                      <tr key={u.id} className={cx(['suspended', 'deleted'].includes(u.status) && 'ad-row-muted')}>
                        <td>
                          <div className="row" style={{ gap: 10 }}>
                            <Avatar name={u.name} size="sm" />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>{u.name}{u.id === me?.id && <span className="tiny muted"> (you)</span>}{u.mfaEnabled && <span className="badge green tiny" title="Two-step login is on" style={{ marginInlineStart: 6 }}><ShieldCheck size={11} style={{ verticalAlign: '-1px' }} /> 2-step</span>}</div>
                              <div className="tiny muted" translate="no">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td><RoleBadge role={u.role} /></td>
                        <td className="small">
                          {u.role === 'official'
                            ? (u.scope === 'national' ? <span className="row" style={{ gap: 5 }}><Globe2 size={14} /> National</span> : <span className="row" style={{ gap: 5 }}><Lock size={14} /> {u.region?.district}</span>)
                            : u.facilityId ? (facName(u.facilityId) || u.facilityId) : <span className="muted">{u.region?.district || '—'}</span>}
                        </td>
                        <td><StatusBadge status={u.status} /></td>
                        <td className="small muted nowrap">{fmtDate(u.createdAt)}</td>
                        <td className="right">
                          {u.id !== me?.id && u.mfaEnabled && <Button size="sm" variant="ghost" icon={ShieldOff} loading={busy === `mfa-${u.id}`} onClick={() => resetMfa(u)}>Reset 2-step</Button>}
                          {u.id !== me?.id && u.status !== 'deleted' && (u.status === 'active'
                            ? <Button size="sm" variant="ghost" icon={Ban} onClick={() => setConfirm(u)}>Suspend</Button>
                            : <Button size="sm" variant="soft" icon={RotateCcw} loading={busy === u.id} onClick={() => setUserStatus(u, 'active')}>{u.status === 'pending' ? 'Activate' : 'Reactivate'}</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <DeletionSchedule rows={deletions.data} />

          <CreateUserModal open={creating} onClose={() => setCreating(false)} facilities={facilities} onCreated={live.reload} />
          <Modal
            open={!!confirm}
            onClose={() => setConfirm(null)}
            title={`Suspend ${confirm?.name}?`}
            subtitle="They won’t be able to sign in until reactivated. Their records and history stay intact."
            footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" icon={Ban} loading={busy === confirm?.id} onClick={() => setUserStatus(confirm, 'suspended')}>Suspend account</Button></>}
          >
            <p className="small mb-0">This action is written to the audit log with your name.</p>
          </Modal>
        </>
      )}
    </LiveGate>
  );
}

// Patients' deletion requests: each is carried out automatically 90 days after it was made, unless the patient
// cancels first. Read-only here — the waiting period belongs to the patient.
function DeletionSchedule({ rows }) {
  if (!rows?.length) return null;
  const pending = rows.filter((r) => r.status === 'requested');
  const done = rows.filter((r) => r.status === 'completed');
  const daysLeft = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400000));
  return (
    <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Trash2 size={17} />Account deletions</h4>}>
      <p className="small muted">Carried out automatically 90 days after the request. The patient can cancel any time before then.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Health Passport</th><th>Requested</th><th>Erased on</th><th>Status</th></tr></thead>
          <tbody>
            {[...pending, ...done].map((r) => (
              <tr key={r.patientId} className={cx(r.status === 'completed' && 'ad-row-muted')}>
                <td><div style={{ fontWeight: 600 }} translate="no">{r.name}</div><div className="tiny muted mono" translate="no">{r.patientId}</div>{r.reason && <div className="tiny muted">“{r.reason}”</div>}</td>
                <td className="small nowrap">{fmtDate(r.requestedAt)}</td>
                <td className="small nowrap">{fmtDate(r.completedAt || r.scheduledFor)}</td>
                <td>{r.status === 'completed' ? <span className="badge tiny">Erased</span> : <span className="badge sun tiny">In {daysLeft(r.scheduledFor)} day{daysLeft(r.scheduledFor) === 1 ? '' : 's'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
