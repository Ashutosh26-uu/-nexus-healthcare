import { useEffect, useRef, useState } from 'react';
import { Store, MapPin, FileBadge, Camera, Upload, CheckCircle2, Hourglass, AlertTriangle, LocateFixed, Lock, Mail, Phone, UserRound, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Button, Card, Field, Progress, useAction, cx } from '../../components/ui';
import { ProtectedImg } from '../../components/Availability';
import { COUNTRIES } from '../../i18n/countries';

function PhotoBox({ label, hint, fileId, onUploaded, accept = 'image/*', icon }) {
  const Icon = icon || Upload;
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pick = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Please choose a file under 10 MB.'); return; }
    setBusy(true); setError('');
    try { const r = await api.upload(file); if (file.type.startsWith('image/')) setPreview(URL.createObjectURL(file)); onUploaded(r.id); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="small strong mb-1">{label}</div>
      <button type="button" className={cx('ph-photo', fileId && 'done')} onClick={() => input.current?.click()} disabled={busy}>
        {preview ? <img src={preview} alt="" /> : fileId ? <ProtectedImg fileId={fileId} alt="" /> : <span className="ph-photo-ic">{busy ? <span className="spinner sm" /> : <Icon />}</span>}
        <span className="ph-photo-text"><strong>{fileId ? 'Uploaded — tap to replace' : busy ? 'Uploading…' : 'Tap to upload'}</strong><span className="tiny muted">{hint}</span></span>
        {fileId && <CheckCircle2 className="ph-photo-ok" />}
      </button>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
      {error && <div className="form-error small mt-1">{error}</div>}
    </div>
  );
}

// After the quick sign-up (name, email, mobile, store name) the chemist completes the store profile:
// location, a photo of the store and a photo of the drug licence. Orders unlock after verification.
export default function StoreSetup({ home, reload }) {
  const { user } = useAuth();
  const p = home.pharmacy;
  const [run, busy] = useAction();
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({
    storeName: p.name || '', address: p.address || '', district: p.district || '', state: p.state || '', pincode: p.pincode || '', country: p.country || 'IN',
    licenceNo: p.licenceNo || '', gstin: p.gstin || '', hours: p.hours || '', phone: p.phone || user?.phone || '', delivery: !!p.delivery, generic: !!p.generic,
    storePhotoFileId: p.storePhotoFileId || null, licenceFileId: p.licenceFileId || null, lat: p.lat ?? null, lng: p.lng ?? null,
  }));
  const [locState, setLocState] = useState(p.lat ? 'ok' : 'idle');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const locate = () => {
    if (!navigator.geolocation) { setLocState('error'); return; }
    setLocState('asking');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = Math.round(pos.coords.latitude * 1000) / 1000; const lng = Math.round(pos.coords.longitude * 1000) / 1000;
      setForm((f) => ({ ...f, lat, lng })); setLocState('ok');
      if (form.country === 'IN') api.get(`/geo/reverse?lat=${lat}&lng=${lng}`).then((r) => setForm((f) => ({ ...f, district: f.district || r.district, state: f.state || r.state, pincode: f.pincode || r.pincode }))).catch(() => {});
    }, (e) => setLocState(e.code === 1 ? 'denied' : 'error'), { timeout: 12000 });
  };
  const checks = [form.address.trim().length >= 5, !!(form.district && form.state), form.licenceNo.trim().length >= 4, !!form.storePhotoFileId, !!form.licenceFileId, locState === 'ok' || !!form.lat];
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const submitted = p.profileComplete && !p.verified && !p.verificationNote;
  const submit = () => { setError(''); run('save', async () => { try { await api.put('/pharmacy/profile', form); reload(); } catch (e) { setError(e.message); throw e; } }, 'Store profile submitted — we\'ll verify your licence shortly'); };

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Store setup" title={`Welcome, ${(user?.name || '').split(' ')[0]} 👋`} subtitle="Complete your store profile so patients within 50 km can find you and send orders. Takes about 3 minutes." />
      {submitted && <div className="callout"><Hourglass /><div><strong>Submitted — under review.</strong> We usually verify the drug licence within 48 hours. You&apos;ll get a notification the moment orders are switched on.</div></div>}
      {p.verificationNote && !p.verified && <div className="callout rose"><AlertTriangle /><div><strong>Needs changes:</strong> {p.verificationNote}. Update the details below and resubmit.</div></div>}
      <Card><div className="row between"><strong>Store profile {pct}% complete</strong><span className="tiny muted">{checks.filter((c) => !c).length ? `${checks.filter((c) => !c).length} things left` : 'Ready to submit'}</span></div><Progress value={pct} tone="ok" /></Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><UserRound size={17} />Your account</h4>} action={<span className="tiny muted row" style={{ gap: 4 }}><Lock size={12} /> from your sign-up</span>}>
        <div className="grid three">
          <Field label="Name"><div className="input readonly" translate="no"><UserRound size={15} />{user?.name}</div></Field>
          <Field label="Email"><div className="input readonly" dir="ltr" translate="no"><Mail size={15} />{user?.email}</div></Field>
          <Field label="Mobile"><div className="input readonly" dir="ltr" translate="no"><Phone size={15} />{user?.phone}</div></Field>
        </div>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><MapPin size={17} />Store &amp; location</h4>} action={<Button size="sm" variant={locState === 'ok' ? 'soft' : 'secondary'} icon={LocateFixed} onClick={locate} disabled={locState === 'asking'}>{locState === 'ok' ? 'Store location saved ✓' : locState === 'asking' ? 'Finding…' : 'I’m at the store — use my location'}</Button>}>
        {locState === 'denied' && <p className="tiny muted">Allow location for this site in your browser, or we&apos;ll use your district.</p>}
        <div className="grid two">
          <Field label="Medical store name"><input className="input" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} /></Field>
          <Field label="Country"><select className="select" value={form.country} onChange={(e) => set('country', e.target.value)}>{COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.name}</option>)}</select></Field>
        </div>
        <Field label="Address"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Shop no., market, street, landmark" /></Field>
        <div className="grid three">
          <Field label="City / district"><input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} /></Field>
          <Field label="State"><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} /></Field>
          <Field label="Pin code"><input className="input" value={form.pincode} onChange={(e) => set('pincode', e.target.value.slice(0, 12))} /></Field>
        </div>
        <div className="grid two">
          <Field label="Opening hours"><input className="input" value={form.hours} onChange={(e) => set('hours', e.target.value)} placeholder="e.g. 8:00 – 22:00" /></Field>
          <Field label="Store phone"><input className="input" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        </div>
        <div className="row wrap" style={{ gap: 18 }}>
          <label className="check small"><input type="checkbox" checked={form.delivery} onChange={(e) => set('delivery', e.target.checked)} /> We have our own home-delivery service</label>
          <label className="check small"><input type="checkbox" checked={form.generic} onChange={(e) => set('generic', e.target.checked)} /> We sell generic / Jan Aushadhi medicines</label>
        </div>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><FileBadge size={17} />Licence &amp; photos</h4>}>
        <Field label="Drug licence number" hint="e.g. Form 20B/21B retail licence number"><input className="input mono" dir="ltr" value={form.licenceNo} onChange={(e) => set('licenceNo', e.target.value.toUpperCase().slice(0, 60))} placeholder="UP-LKO-20B/21B-2019-0457" /></Field>
        <Field label="GSTIN (optional)" hint="15 characters — printed on your patients' bills"><input className="input mono" dir="ltr" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 15))} placeholder="09AAACH7409R1ZZ" /></Field>
        <div className="grid two">
          <PhotoBox label="Photo of the store" hint="Front of the shop with the board visible" icon={Camera} fileId={form.storePhotoFileId} onUploaded={(id) => set('storePhotoFileId', id)} />
          <PhotoBox label="Photo of the drug licence" hint="Clear photo or PDF of the licence" accept="image/*,application/pdf" icon={FileBadge} fileId={form.licenceFileId} onUploaded={(id) => set('licenceFileId', id)} />
        </div>
        <p className="tiny muted mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> The licence photo is seen only by our verification team. Patients see the store photo.</p>
      </Card>

      <div className="row wrap" style={{ gap: 10, justifyContent: 'flex-end' }}>
        {error && <div className="form-error grow">{error}</div>}
        <Button size="lg" icon={Store} loading={busy === 'save'} onClick={submit}>{p.profileComplete ? 'Resubmit for verification' : 'Submit for verification'}</Button>
      </div>
    </div>
  );
}
