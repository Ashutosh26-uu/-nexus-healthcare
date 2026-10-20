import { useState } from 'react';
import { MonitorSmartphone, Wifi, WifiOff, DownloadCloud, Power, MapPin, Plus } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, Pills, Empty, Button, Modal, Field, PreviewBadge, useAction, cx } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';

// Only what is real: the operator switches a kiosk online/offline from its own screen. Device health, uptime,
// software version and remote restart/update aren't connected to any hardware yet — labelled, not faked.
function KioskCard({ k }) {
  const online = k.status === 'online';
  return (
    <div className={cx('ad-kiosk', k.status)}>
      <div className="row between top" style={{ gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className={cx('dot', online ? 'green' : 'rose', online && 'pulse')} />
            <strong className="ad-kiosk-name">{k.name.replace('E-Clinic · ', '')}</strong>
          </div>
          <div className="tiny muted row" style={{ gap: 4, marginTop: 2 }}><MapPin size={12} /> {k.district || '—'}{k.pincode ? ` · pin ${k.pincode}` : ''}</div>
        </div>
        <span className={cx('badge', online ? 'green' : 'rose')}>{online ? 'online' : 'offline'}</span>
      </div>
      <p className="tiny muted mb-0">{online ? 'The operator has opened this E-Clinic.' : 'Closed — the operator turns it online from the kiosk screen.'}</p>
      <div className="row wrap" style={{ gap: 8, marginTop: 'auto', alignItems: 'center' }}>
        <Button size="sm" variant="secondary" icon={DownloadCloud} disabled>Push update</Button>
        <Button size="sm" variant="ghost" icon={Power} disabled>Remote restart</Button>
        <PreviewBadge>Coming soon</PreviewBadge>
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
    <Modal open={open} onClose={onClose} title="Add an E-Clinic" subtitle="A Sehatra-owned clinic. Partner doctors can then pick it and check in there."
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
  return (
    <LiveGate live={live}>
      {(kiosks) => {
        const online = kiosks.filter((k) => k.status === 'online').length;
        const list = kiosks.filter((k) => (filter === 'all' ? true : filter === 'online' ? k.status === 'online' : k.status !== 'online'));
        return (
          <>
            <PageHeader eyebrow="Kiosk fleet" title="E-Clinic kiosks" subtitle="Every Sehatra E-Clinic and whether its operator has it open right now. Device health and remote updates are coming soon.">
              <Button icon={Plus} onClick={() => setAdding(true)}>Add E-Clinic</Button>
            </PageHeader>
            <AddClinic open={adding} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); live.reload(); }} />
            <div className="grid four mb-2">
              <Stat label="Online now" icon={Wifi} value={`${online}/${kiosks.length}`} sub="opened by their operator" />
              <Stat label="Offline" icon={WifiOff} value={kiosks.length - online} sub={kiosks.length - online ? 'closed or not yet opened' : 'none'} />
            </div>

            <Card className="mb-2 ad-fleet-strip">
              <div className="row between wrap" style={{ gap: 10 }}>
                <div className="ad-fleet-dots" aria-label="Fleet status at a glance">
                  {kiosks.map((k) => <span key={k.id} className={cx('ad-fleet-dot', k.status)} title={`${k.name} · ${k.status}`} />)}
                  <span className="tiny muted" style={{ marginInlineStart: 8 }}>{kiosks.length - online} offline</span>
                </div>
                <Pills value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]} />
              </div>
            </Card>

            {list.length === 0
              ? <Card><Empty icon={MonitorSmartphone} title={kiosks.length ? 'Nothing here' : 'No E-Clinics yet'}>{kiosks.length ? 'No kiosks match this filter.' : 'Add the first E-Clinic to see it here.'}</Empty></Card>
              : <div className="ad-kiosks">{list.map((k) => <KioskCard key={k.id} k={k} />)}</div>}
          </>
        );
      }}
    </LiveGate>
  );
}
