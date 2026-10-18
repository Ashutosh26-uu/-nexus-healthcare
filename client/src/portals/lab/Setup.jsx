import { useState } from 'react';
import { Users, UserPlus, Gift, PackagePlus, Phone } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Empty, Field, Loading, Switch, fmtMoney, useAction, cx } from '../../components/ui';
import { api } from '../../api';
import { useLive } from '../../live';

// The lab's own setup: home-collection technicians and check-up packages patients can book.
// Live: a colleague adding a technician or package on another screen shows up here straight away.
export default function Setup() {
  const { data, error, setData, reload } = useLive('/lab/setup', ['lab']);
  if (!data) return error ? <Empty title="Couldn't load your setup">{error}</Empty> : <Loading />;
  return (
    <>
      <PageHeader title="Team & packages" subtitle="Your home-collection technicians and the health check-up packages patients can book from their app." />
      <div className="stack lg">
        <Collectors data={data} setData={setData} />
        <Packages data={data} refresh={reload} />
      </div>
    </>
  );
}

function Collectors({ data, setData }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [run, busy] = useAction();
  const add = async (e) => {
    e.preventDefault();
    const r = await run('add', () => api.post('/lab/collectors', { name, phone }), `${name} added to your team`);
    if (r) { setData((d) => ({ ...d, collectors: r })); setName(''); setPhone(''); }
  };
  const toggle = async (c) => {
    const r = await run(c.id, () => api.put(`/lab/collectors/${c.id}`, { active: !c.active }));
    if (r) setData((d) => ({ ...d, collectors: r }));
  };
  return (
    <Card title={<span className="row" style={{ gap: 8 }}><Users size={18} /> Collection technicians</span>}>
      {!data.homeCollection && <p className="tiny muted">Home collection is switched off for your lab, so patients can&apos;t book home visits yet. You can still keep your team here.</p>}
      {data.collectors.length === 0 ? <p className="small muted">No technicians yet. Add the people who visit patients&apos; homes to collect samples.</p> : (
        <ul className="lab-team">
          {data.collectors.map((c) => (
            <li key={c.id} className={cx(!c.active && 'off')}>
              <span className="grow"><strong className="small" translate="no">{c.name}</strong><span className="tiny muted block"><Phone size={11} /> {c.phone}</span></span>
              <span className="tiny muted">{c.active ? 'Active' : 'Inactive'}</span>
              <Switch checked={c.active} onChange={() => toggle(c)} label={`${c.name} active`} />
            </li>
          ))}
        </ul>
      )}
      <form className="lab-team-add" onSubmit={add}>
        <Field label="Name"><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Raju Prasad" /></Field>
        <Field label="Phone"><input className="input sm" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" /></Field>
        <Button type="submit" size="sm" icon={UserPlus} loading={busy === 'add'} disabled={name.trim().length < 2 || phone.trim().length < 8}>Add</Button>
      </form>
      <p className="tiny muted mb-0">Patients see only the technician&apos;s first name and your lab&apos;s number — you can choose to share a technician&apos;s own number per visit.</p>
    </Card>
  );
}

function Packages({ data, refresh }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [codes, setCodes] = useState([]);
  const [run, busy] = useAction();
  const listPrice = data.tests.filter((t) => codes.includes(t.code)).reduce((s, t) => s + (t.price || 0), 0);
  const add = async (e) => {
    e.preventDefault();
    const r = await run('add', () => api.post('/lab/packages', { name, description, price: Number(price), codes }), `"${name}" is now bookable`);
    if (r) { setName(''); setDescription(''); setPrice(''); setCodes([]); refresh(); }
  };
  const toggle = async (k) => { if (await run(k.id, () => api.put(`/lab/packages/${k.id}`, { active: !k.active }))) refresh(); };
  const testName = (code) => data.tests.find((t) => t.code === code)?.name || code;
  return (
    <Card title={<span className="row" style={{ gap: 8 }}><Gift size={18} /> Health check-up packages</span>}>
      {data.packages.length === 0 ? <p className="small muted">No packages yet.</p> : (
        <div className="lab-pkgs">
          {data.packages.map((k) => (
            <div key={k.id} className={cx('lab-pkg', !k.active && 'off')}>
              <div className="row between top" style={{ gap: 8 }}>
                <span><strong>{k.name}</strong>{k.description && <span className="tiny muted block">{k.description}</span>}</span>
                <Switch checked={k.active} onChange={() => toggle(k)} label={`${k.name} bookable`} />
              </div>
              <div className="tiny">{k.codes.map(testName).join(' · ')}</div>
              <div className="row wrap" style={{ gap: 8 }}><strong>{fmtMoney(k.price)}</strong>{k.listPrice > k.price && <span className="tiny muted"><s>{fmtMoney(k.listPrice)}</s> · saves {fmtMoney(k.listPrice - k.price)}</span>}<span className="tiny muted">{k.active ? 'Bookable' : 'Hidden from patients'}</span></div>
            </div>
          ))}
        </div>
      )}
      <form className="stack mt-2" onSubmit={add}>
        <strong className="small">Add a package</strong>
        <div className="lab-collect-grid">
          <Field label="Package name"><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diabetes panel" /></Field>
          <Field label="Package price (₹)" hint={codes.length ? `Tests separately: ${fmtMoney(listPrice)}` : undefined}><input className="input sm" type="number" min={1} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        </div>
        <Field label="Short description (optional)"><input className="input sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who it's for, in one line" /></Field>
        <div className="lab-pkg-tests" role="group" aria-label="Tests in the package">
          {data.tests.map((t) => (
            <label key={t.code} className={cx('chip', codes.includes(t.code) && 'on')}>
              <input type="checkbox" hidden checked={codes.includes(t.code)} onChange={(e) => setCodes((c) => (e.target.checked ? [...c, t.code] : c.filter((x) => x !== t.code)))} />
              {t.name}{t.price ? ` · ${fmtMoney(t.price)}` : ''}
            </label>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="submit" size="sm" icon={PackagePlus} loading={busy === 'add'} disabled={name.trim().length < 3 || !codes.length || !(Number(price) >= 1)}>Add package</Button>
        </div>
      </form>
    </Card>
  );
}
