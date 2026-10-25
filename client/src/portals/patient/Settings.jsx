import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Plus, Trash2, ShieldCheck, Bell, Lock, UserX, Languages, ChevronRight } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Button, Card, Field, Modal, PreviewBadge, Switch, fmtDate, useAction } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import AadhaarVerify from '../../components/AadhaarVerify';
import { usePatient, firstName, splitList, BLOOD_GROUPS, PageSkeleton } from './shared';
import { LANGUAGES as APP_LANGUAGES, useI18n, codeForName } from '../../i18n';
import { useEasyMode } from '../../components/easyMode';

const NOTIFS = [
  { key: 'consults', label: 'Consult reminders', hint: '30 minutes and 5 minutes before a booked consult' },
  { key: 'medicines', label: 'Medicine reminders', hint: 'A gentle nudge at dose times' },
  { key: 'orders', label: 'Order updates', hint: 'When medicines are packed, on the way, or delivered' },
  { key: 'reports', label: 'Lab results', hint: 'As soon as a report is ready' },
  { key: 'alerts', label: 'Health alerts in my area', hint: 'Outbreaks, heatwaves and vaccination camps' },
];
const DEFAULT_NOTIFS = { consults: true, medicines: true, orders: true, reports: true, alerts: true };

const toForm = (p) => ({
  name: p.name || '',
  language: p.language || 'Hindi',
  bloodGroup: p.bloodGroup || 'Unknown',
  gender: p.gender || '',
  dob: p.dob || '',
  pincode: p.pincode || '',
  abha: p.abha || '',
  allergies: (p.allergies || []).join(', '),
  conditions: (p.conditions || []).join(', '),
  currentMeds: (p.currentMeds || []).join(', '),
  // The 'Mobile' entry is the patient's own number, kept by the server — not an emergency contact to edit here.
  emergencyContacts: (() => { const list = (p.emergencyContacts || []).filter((c) => c.relation !== 'Mobile'); return (list.length ? list : [{ name: '', relation: '', phone: '' }]).map((c) => ({ ...c })); })(),
});

export default function Settings() {
  const { patient, homeLoading, reloadHome, profiles } = usePatient();
  const { refresh } = useAuth();
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  // Saved on the account, so they apply on every phone and the server honours them.
  const [notifs, setNotifs] = useState(DEFAULT_NOTIFS);
  useEffect(() => { api.get('/me/notify-prefs').then((p) => setNotifs({ ...DEFAULT_NOTIFS, ...p })).catch(() => {}); }, []);
  const [privacyDraft, setPrivacyDraft] = useState(null); // optimistic value while a save is in flight
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const navigate = useNavigate();
  const isSelf = profiles.find((x) => x.id === patient?.id)?.self;
  const { setLang } = useI18n();

  // Reset the form when the profile changes; don't clobber unsaved edits on live refreshes.
  useEffect(() => { if (patient) { setForm(toForm(patient)); setDirty(false); } }, [patient?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (homeLoading || !form) return <PageSkeleton />;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const india = (patient.country || 'IN') === 'IN';
  const setContact = (i, k, v) => { setForm((f) => ({ ...f, emergencyContacts: f.emergencyContacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) })); setDirty(true); };

  const save = (e) => {
    e.preventDefault();
    run('save', async () => {
      await api.put('/patient/profile', {
        ...form,
        dob: form.dob || undefined, // no date of birth yet (quick sign-up) — leave it out rather than send ""
        allergies: splitList(form.allergies),
        conditions: splitList(form.conditions),
        currentMeds: splitList(form.currentMeds),
        emergencyContacts: form.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim()),
      });
      setDirty(false);
      await reloadHome();
      if (isSelf) refresh?.();
    }, 'Saved. Your passport and emergency card are up to date.');
  };

  const toggleNotif = (k, v) => {
    const prev = notifs;
    setNotifs({ ...notifs, [k]: v });
    api.put('/me/notify-prefs', { [k]: v }).then((p) => setNotifs({ ...DEFAULT_NOTIFS, ...p })).catch(() => setNotifs(prev));
  };

  // Saved on the server per profile (defaults: research off, kiosk OTP on).
  const privacy = privacyDraft || { research: !!patient.privacy?.research, kioskOtp: patient.privacy?.kioskOtp !== false };
  const setPrivacy = (k, v, msg) => {
    if (privacyDraft) return; // one change at a time, so the switch can't flicker back mid-save
    run(`privacy-${k}`, async () => {
      setPrivacyDraft({ ...privacy, [k]: v });
      try { await api.put('/patient/privacy', { [k]: v }); await reloadHome(); } finally { setPrivacyDraft(null); }
    }, msg);
  };

  const deletion = patient.deletionRequest?.status === 'requested' ? patient.deletionRequest : null;
  const requestDeletion = () => run('delete', async () => {
    await api.post('/patient/deletion-request', { reason: reason.trim() || undefined });
    await reloadHome();
    setDeleting(false); setReason('');
  }, 'Deletion scheduled for 90 days from today. You can cancel it any time before then.');
  const cancelDeletion = () => run('undelete', async () => { await api.del('/patient/deletion-request'); await reloadHome(); }, 'Deletion request cancelled. Nothing will be removed.');

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Settings" title={isSelf ? 'Settings' : `Settings for ${firstName(patient.name)}`} subtitle="Keep these up to date — they show on the emergency card and help doctors keep you safe." />

      <form onSubmit={save} className="stack lg">
        <Card title="Health passport">
          <div className="grid two">
            <Field label="Full name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
            <Field label="Preferred language" hint="Doctors who speak it are shown first.">
              <div className="input-wrap">
                <Languages />
                <select className="select" style={{ paddingInlineStart: 40 }} value={form.language} onChange={(e) => {
                  set('language', e.target.value);
                  const code = codeForName(e.target.value);
                  if (code && (isSelf || !profiles.length)) setLang(code);
                }}>
                  {!APP_LANGUAGES.some((l) => l.name === form.language) && <option value={form.language}>{form.language}</option>}
                  {APP_LANGUAGES.map((l) => <option key={l.code} value={l.name} translate="no">{l.native === l.name ? l.name : `${l.native} — ${l.name}`}</option>)}
                </select>
              </div>
            </Field>
            <Field label="Date of birth"><input className="input" type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
            <Field label="Gender">
              <select className="select" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option>
              </select>
            </Field>
            <Field label="Blood group">
              <select className="select" value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
                {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b === 'Unknown' ? 'Don’t know' : b}</option>)}
              </select>
            </Field>
            {/* Same rule as Complete profile: 6 digits in India, letters and spaces elsewhere ("SW1A 1AA" used to save as "11"). */}
            <Field label={india ? 'PIN code' : 'Postal code'}><input className="input" inputMode={india ? 'numeric' : 'text'} maxLength={india ? 6 : 12} value={form.pincode} onChange={(e) => set('pincode', india ? e.target.value.replace(/\D/g, '') : e.target.value.slice(0, 12))} /></Field>
            <Field label="ABHA number" hint="Your national health ID. Links records from government hospitals." className="pt-span-2">
              <input className="input mono" dir="ltr" value={form.abha} onChange={(e) => set('abha', e.target.value)} placeholder="91-XXXX-XXXX-XXXX" />
            </Field>
            <Field label="Aadhaar" hint="Optional. Scanning the QR on the card proves it's genuine — we keep only 'verified', the last 4 digits and year of birth." className="pt-span-2">
              <AadhaarVerify verification={patient.aadhaarVerification} onVerified={() => reloadHome()} />
            </Field>
          </div>
        </Card>

        <Card title="Medical details">
          <div className="stack">
            <Field label="Allergies" hint="Separate with commas — e.g. Penicillin, Sulfa drugs. This is the most important field on your card."><input className="input" value={form.allergies} onChange={(e) => set('allergies', e.target.value)} /></Field>
            <Field label="Long-term conditions" hint="Separate with commas."><input className="input" value={form.conditions} onChange={(e) => set('conditions', e.target.value)} /></Field>
            <Field label="Medicines taken regularly" hint="Separate with commas, with strength if you know it."><input className="input" value={form.currentMeds} onChange={(e) => set('currentMeds', e.target.value)} /></Field>
          </div>
        </Card>

        <Card title="Emergency contacts" action={form.emergencyContacts.length < 3 && (
          <Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => { setForm((f) => ({ ...f, emergencyContacts: [...f.emergencyContacts, { name: '', relation: '', phone: '' }] })); setDirty(true); }}>Add</Button>
        )}>
          <p className="small muted">They&apos;re told if someone uses emergency access on your records.</p>
          <div className="stack">
            {form.emergencyContacts.map((c, i) => (
              <div key={i} className="pt-contact-row">
                <Field label="Name"><input className="input" value={c.name} onChange={(e) => setContact(i, 'name', e.target.value)} /></Field>
                <Field label="Relation"><input className="input" value={c.relation} onChange={(e) => setContact(i, 'relation', e.target.value)} placeholder="e.g. Husband" /></Field>
                <Field label="Phone"><input className="input" dir="ltr" type="tel" inputMode="tel" value={c.phone} onChange={(e) => setContact(i, 'phone', e.target.value)} /></Field>
                <button type="button" className="icon-btn" aria-label={`Remove contact ${c.name || i + 1}`} disabled={form.emergencyContacts.length === 1}
                  onClick={() => { setForm((f) => ({ ...f, emergencyContacts: f.emergencyContacts.filter((_, j) => j !== i) })); setDirty(true); }}><Trash2 /></button>
              </div>
            ))}
          </div>
        </Card>

        <div className={`pt-savebar ${dirty ? 'show' : ''}`}>
          <span className="small">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
          <div className="row">
            {dirty && <Button type="button" variant="ghost" onClick={() => { setForm(toForm(patient)); setDirty(false); }}>Discard</Button>}
            <Button type="submit" icon={Save} loading={busy === 'save'} disabled={!dirty}>Save changes</Button>
          </div>
        </div>
      </form>

      <div className="grid two">
        <EasyCard />
        <Card title={<h3 className="row" style={{ gap: 8 }}><Bell size={18} /> Notifications</h3>}>
          <p className="tiny muted mt-0">Turn off the updates you don&apos;t want. Emergency alerts (SOS, urgent lab results), payments and security messages always come through.</p>
          <div className="list">
            {NOTIFS.map((n) => (
              <div key={n.key} className="list-item">
                <div className="grow"><div className="small strong">{n.label}</div><div className="tiny muted">{n.hint}</div></div>
                <Switch checked={notifs[n.key]} onChange={(v) => toggleNotif(n.key, v)} label={n.label} />
              </div>
            ))}
          </div>
        </Card>

        <Card title={<h3 className="row" style={{ gap: 8 }}><Lock size={18} /> Privacy</h3>}>
          <div className="list">
            <button type="button" className="list-item pt-linkrow" onClick={() => navigate('/patient/consents')}>
              <ShieldCheck size={18} className="pt-green" />
              <div className="grow"><div className="small strong">Who can see my data</div><div className="tiny muted">Approve requests, revoke access, see every view</div></div>
              <ChevronRight size={16} className="muted" />
            </button>
            <div className="list-item">
              <div className="grow"><div className="small strong">Help spot outbreaks early <PreviewBadge>Coming soon</PreviewBadge></div><div className="tiny muted">Share anonymised symptoms and PIN code — never your name. Your choice is saved now and will apply when this launches.</div></div>
              <Switch checked={privacy.research} onChange={(v) => setPrivacy('research', v, 'Preference saved')} label="Share anonymised data for outbreak detection" />
            </div>
            <div className="list-item">
              <div className="grow"><div className="small strong">Ask for a code at kiosks</div><div className="tiny muted">When an E-Clinic finds you by mobile number, we email you a 6-digit code and your passport opens only after you tell it to the operator. Showing your Health Passport card always works without a code.</div></div>
              <Switch checked={privacy.kioskOtp} onChange={(v) => setPrivacy('kioskOtp', v, 'Preference saved')} label="Ask for an emailed code at kiosks" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="pt-danger-zone">
        <div className="row wrap between">
          <div className="grow">
            <strong>Delete {isSelf ? 'my account' : `${firstName(patient.name)}’s profile`}</strong>
            {deletion
              ? <p className="small mb-0">Deletion requested on <strong>{fmtDate(deletion.at)}</strong>. Everything will be erased on <strong>{fmtDate(deletion.scheduledFor || new Date(Date.parse(deletion.at) + 90 * 86400000).toISOString())}</strong>. Until then nothing is removed and you can cancel.</p>
              : <p className="small muted mb-0">Erases the passport and its records from Sehatra 90 days after you ask — you can change your mind until then.</p>}
          </div>
          {deletion
            ? <Button variant="secondary" loading={busy === 'undelete'} onClick={cancelDeletion}>Cancel request</Button>
            : <Button variant="secondary" icon={UserX} onClick={() => setDeleting(true)}>Delete…</Button>}
        </div>
      </Card>

      <Modal open={deleting} onClose={() => setDeleting(false)} title="Are you sure?" subtitle="We’re sorry to see you go."
        footer={<>
          <Button variant="ghost" onClick={() => setDeleting(false)}>Keep my account</Button>
          <Button variant="danger" loading={busy === 'delete'} onClick={requestDeletion}>Request deletion</Button>
        </>}>
        <div className="stack">
          <p className="mb-0">Here&apos;s what happens:</p>
          <ul className="small pt-plain-list">
            <li>Deletion happens automatically <strong>90 days</strong> after today. Until then nothing is lost — you can cancel it from this page.</li>
            <li>On that day {isSelf ? 'your' : 'this'} name, contacts, uploads, health readings, consents and {isSelf ? 'your sign-in' : 'profile details'} are permanently erased.</li>
            <li>Visit, prescription, lab and payment entries that doctors, labs and chemists must legally keep stay with them — with nothing left that identifies {isSelf ? 'you' : 'them'}.</li>
            {isSelf && profiles.length > 1 && <li>Family profiles you manage that don&apos;t have their own login ({profiles.filter((x) => !x.self).map((x) => firstName(x.name)).join(', ')}) are erased with your account.</li>}
          </ul>
          <Field label="Why are you leaving? (optional)">
            <input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Anything we could do better" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

// Bigger text, bigger buttons and a "Listen" button on every page — on this phone only.
function EasyCard() {
  const [easy, toggle] = useEasyMode();
  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><Languages size={18} /> Easier to read</h3>}>
      <div className="row" style={{ gap: 10 }}>
        <Switch checked={easy} onChange={toggle} label="Bigger text and read aloud" />
        <span className="small grow">Bigger text, bigger buttons, and a <strong>Listen</strong> button that reads each page aloud. Only on this phone.</span>
      </div>
    </Card>
  );
}
