import { useState } from 'react';
import { MonitorSmartphone, Wifi, WifiOff, Wrench, DownloadCloud, Power, MapPin, Users, Plus } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, Pills, Empty, Button, Progress, Modal, Field, useAction, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';

const DEVICE_LABEL = { bp: 'BP cuff', spo2: 'Pulse oximeter', thermometer: 'Thermometer', scale: 'Weighing scale', glucometer: 'Glucometer', printer: 'Printer', camera: 'Camera' };
const DEVICE_STATE = { ok: { label: 'OK', tone: 'ok' }, fault: { label: 'Fault', tone: 'fault' }, paper_low: { label: 'Paper low', tone: 'warn' } };

const cmpVer = (a = '0', b = '0') => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const LATEST = '1.4.3';
const issues = (k) => Object.values(k.devices || {}).filter((s) => s !== 'ok').length;

function KioskCard({ k, onAction, busy }) {
  const outdated = cmpVer(k.version, LATEST) < 0;
  const faults = issues(k);
  const restarting = busy === `restart-${k.id}`;
  return (
    <div className={cx('ad-kiosk', k.status, faults && 'issue')}>
      <div className="row between top" style={{ gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className={cx('dot', k.status === 'online' ? 'green' : 'rose', k.status === 'online' && 'pulse')} />
            <strong className="ad-kiosk-name">{k.name.replace('E-Clinic · ', '')}</strong>
          </div>
          <div className="tiny muted row" style={{ gap: 4, marginTop: 2 }}><MapPin size={12} /> {k.district} · pin {k.pincode}</div>
        </div>
        <span className={cx('badge', k.status === 'online' ? 'green' : 'rose')}>{restarting ? 'Restarting…' : k.status}</span>
      </div>

      <div className="ad-kiosk-stats">
        <div><span className="tiny muted">Uptime</span><strong>{k.uptime}%</strong></div>
        <div><span className="tiny muted">Visits today</span><strong>{k.visitsToday ?? 0}</strong></div>
        <div><span className="tiny muted">Software</span><strong className={cx(outdated && 'ad-text-clay')}>{k.version}</strong></div>
      </div>
      <Progress value={k.uptime} tone={k.uptime < 95 ? 'danger' : k.uptime < 99 ? 'warn' : 'ok'} />

      <div className="ad-devices">
        {Object.entries(k.devices || {}).map(([d, s]) => (
          <span key={d} className={cx('ad-device', DEVICE_STATE[s]?.tone || 'warn')} title={`${DEVICE_LABEL[d] || d}: ${DEVICE_STATE[s]?.label || s}`}>
            {DEVICE_LABEL[d] || d}{s !== 'ok' && <em>{DEVICE_STATE[s]?.label || s}</em>}
          </span>
        ))}
      </div>

      <div className="row wrap" style={{ gap: 8, marginTop: 'auto' }}>
        <Button size="sm" variant={outdated ? undefined : 'secondary'} icon={DownloadCloud} disabled={!outdated} loading={busy === `update-${k.id}`} onClick={() => onAction(k, 'update')}>
          {outdated ? `Push ${LATEST}` : 'Up to date'}
        </Button>
        <Button size="sm" variant="ghost" icon={Power} loading={restarting} onClick={() => onAction(k, 'restart')}>Remote restart</Button>
      </div>
    </div>
  );
}

function AddClinic({ open, onClose, onAdded }) {
  const [f, setF] = useState({ name: '', address: '', district: '', state: '', pincode: '', phone: '' });
  const [run, busy] = useAction();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = () => run('add', async () => { const r = await api.post('/admin/facilities', { ...f, type: 'kiosk' }); onAdded(r); setF({ name: '', address: '', district: '', state: '', pincode: '', phone: '' }); }, 'E-Clinic added — create an operator for it in Users & roles');
  return (
    <Modal open={open} onClose={onClose} title="Add an E-Clinic" subtitle="A Nexus-owned clinic. Partner doctors can then pick it and check in there."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={Plus} loading={busy === 'add'} disabled={f.name.trim().length < 3 || !f.district.trim() || !f.state.trim()} onClick={save}>Add E-Clinic</Button></>}>
      <div className="stack">
        <Field label="Name / location"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Dewa PHC" autoFocus /></Field>
        <Field label="Address"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <div className="grid three">
          <Field label="District"><input className="input" value={f.district} onChange={(e) => set('district', e.target.value)} /></Field>
          <Field label="State"><input className="input" value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
          <Field label="Pin code"><input className="input" value={f.pincode} onChange={(e) => set('pincode', e.target.value)} /></Field>
        </div>
        <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function Kiosks() {
  const live = useLive('/admin/kiosks', ['kiosks', 'admin']);
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [run, busy] = useAction();

  const onAction = async (k, action) => {
    const short = k.name.replace('E-Clinic · ', '');
    const r = await run(`${action}-${k.id}`, async () => {
      if (action === 'restart') await new Promise((res) => setTimeout(res, 1200)); // a restart takes a moment; let the operator see it
      return api.post(`/admin/kiosks/${k.id}/${action}`);
    }, action === 'update' ? `Update ${LATEST} pushed to ${short} — installs at next idle moment` : `${short} restarted · devices re-checked`);
    if (r) live.reload();
  };

  return (
    <LiveGate live={live}>
      {(kiosks) => {
        const online = kiosks.filter((k) => k.status === 'online').length;
        const attention = kiosks.filter((k) => k.status !== 'online' || issues(k) || cmpVer(k.version, LATEST) < 0);
        const list = kiosks.filter((k) => (filter === 'all' ? true : filter === 'online' ? k.status === 'online' : filter === 'offline' ? k.status !== 'online' : attention.includes(k)));
        return (
          <>
            <PageHeader eyebrow="Kiosk fleet" title="E-Clinic kiosks" subtitle="Each kiosk reports its devices every few minutes. Push updates and restart remotely — no site visit needed.">
              <Button icon={Plus} onClick={() => setAdding(true)}>Add E-Clinic</Button>
            </PageHeader>
            <AddClinic open={adding} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); live.reload(); }} />
            <div className="grid four mb-2">
              <Stat label="Online now" icon={Wifi} value={`${online}/${kiosks.length}`} sub="reporting in the last 5 min" />
              <Stat label="Offline" icon={WifiOff} value={kiosks.length - online} sub={kiosks.length - online ? 'check power or network' : 'none'} />
              <Stat label="Device issues" icon={Wrench} value={kiosks.reduce((s, k) => s + issues(k), 0)} sub="faults or low paper" />
              <Stat label="Patients today" icon={Users} value={kiosks.reduce((s, k) => s + (k.visitsToday || 0), 0)} sub="kiosk visits" />
            </div>

            <Card className="mb-2 ad-fleet-strip">
              <div className="row between wrap" style={{ gap: 10 }}>
                <div className="ad-fleet-dots" aria-label="Fleet status at a glance">
                  {kiosks.map((k) => <span key={k.id} className={cx('ad-fleet-dot', k.status, issues(k) && 'issue')} title={`${k.name} · ${k.status}`} />)}
                  <span className="tiny muted" style={{ marginInlineStart: 8 }}>{attention.length} need attention · latest software {LATEST}</span>
                </div>
                <Pills value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'attention', label: 'Needs attention' }, { value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]} />
              </div>
            </Card>

            {list.length === 0
              ? <Card><Empty icon={MonitorSmartphone} title="Nothing here">No kiosks match this filter.</Empty></Card>
              : <div className="ad-kiosks">{list.map((k) => <KioskCard key={k.id} k={k} busy={busy} onAction={onAction} />)}</div>}
          </>
        );
      }}
    </LiveGate>
  );
}
