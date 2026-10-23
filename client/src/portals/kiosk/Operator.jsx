import { useNavigate } from 'react-router-dom';
import { Gauge, Activity, Thermometer, Scale, Droplet, Printer, Camera, Wifi, WifiOff, RotateCcw, Users, Server, CloudOff, ArrowRight, Inbox, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../../api';
import { Avatar, TriageBadge, StatusBadge, PreviewBadge, useAction, fmtTime, cx } from '../../components/ui';
import { usePublicConfig } from '../../config';
import { useKiosk } from './context';
import { KButton } from './KUi';
import { AvailBadge, AvailLine, availClass } from '../../components/Availability';
import OfflineIntakes from './OfflineIntakes';

const DEVICE_META = {
  bp: { label: 'BP monitor', icon: Gauge },
  spo2: { label: 'Pulse oximeter', icon: Activity },
  thermometer: { label: 'Thermometer', icon: Thermometer },
  scale: { label: 'Weighing scale', icon: Scale },
  glucometer: { label: 'Glucometer', icon: Droplet },
  printer: { label: 'Printer', icon: Printer },
  camera: { label: 'HD camera', icon: Camera },
};

export default function Operator() {
  const { home, kiosk, offline, reset, flow, user } = useKiosk();
  const navigate = useNavigate();
  const [run, busy] = useAction();
  const queue = home.data?.queue || [];
  // Device status is only simulated on the demo network — a live kiosk has no device monitoring yet.
  const demo = usePublicConfig()?.demo === true;
  const devices = (demo && kiosk?.devices) || {};
  const faults = Object.values(devices).filter((s) => s && s !== 'ok').length;
  const done = queue.filter((c) => c.status === 'completed').length;

  const toggleOffline = () => run('status', async () => {
    const k = await api.put('/kiosk/status', { status: offline ? 'online' : 'offline' });
    home.setData((d) => (d ? { ...d, kiosk: k } : d));
  }, offline ? 'Back online' : 'Offline mode on — the network now shows this kiosk as offline.');

  const next = () => { reset(); navigate('/kiosk'); };

  return (
    <div className="k-op">
      <div className="k-op-head">
        <div>
          <span className="k-eyebrow">Operator panel</span>
          <h1 className="k-title">Namaste, {user?.name?.split(' ')[0]} didi</h1>
          <p className="k-sub">{kiosk?.name}{kiosk?.version ? ` · software ${kiosk.version}` : ''}</p>
        </div>
        <div className="k-op-actions">
          {flow.patient && <KButton variant="ghost" icon={ArrowRight} onClick={() => navigate('/kiosk')}>Back to {flow.patient.name.split(' ')[0]}'s visit</KButton>}
          <KButton icon={RotateCcw} className="xl" onClick={next}>Finish & next patient</KButton>
        </div>
      </div>

      {offline && (
        <div className="k-op-offline">
          <CloudOff />
          <div className="grow">
            <strong>Offline mode is on</strong>
            <span>Doctors and the district team see this kiosk as offline. Looking up patients, saving visits and teleconsults need the internet — switch back when it returns.</span>
          </div>
        </div>
      )}

      <OfflineIntakes />

      <div className="k-op-stats">
        <div className="k-op-stat"><Users /><small>Teleconsults today</small><strong>{queue.length}</strong></div>
        <div className="k-op-stat"><CheckCircle2 /><small>Completed today</small><strong>{done}</strong></div>
        <div className="k-op-stat"><Activity /><small>Waiting for doctor</small><strong>{queue.filter((c) => c.status === 'queued').length}</strong></div>
        {demo
          ? <div className={cx('k-op-stat', faults && 'warn')}><Server /><small>Device faults</small><strong>{faults}</strong></div>
          : <div className="k-op-stat"><Server /><small>Device faults</small><strong>—</strong></div>}
      </div>

      <section className="k-op-card k-docs">
        <div className="k-op-card-h"><h3>E-Clinic doctors</h3><span className="k-fine">Doctors switch themselves on when they arrive</span></div>
        {(home.data?.doctors || []).length === 0 ? (
          <div className="k-op-empty"><Inbox /><span>No partner doctors linked to this E-Clinic yet.</span></div>
        ) : (
          <div className="k-docs-grid">
            {home.data.doctors.map((d) => (
              <div key={d.id} className={cx('k-doc', d.here && 'here', availClass(d.availability))}>
                <Avatar name={d.name} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <strong className="k-doc-name" translate="no">{d.name}</strong>
                  <div className="k-fine">{d.specialty} · {(d.languages || []).slice(0, 3).join(', ')}</div>
                  <div className="k-doc-status"><AvailBadge a={d.availability} />{d.availability?.available && <AvailLine a={d.availability} />}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="k-op-grid">
        <section className="k-op-card">
          <div className="k-op-card-h"><h3>Today's patients</h3><span className="k-fine">{queue.length} through Sehatra</span></div>
          {queue.length === 0 ? (
            <div className="k-op-empty"><Inbox /><span>No teleconsults yet today.</span></div>
          ) : (
            <div className="k-op-list">
              {queue.map((c) => (
                <div key={c.id} className="k-op-row">
                  <Avatar name={c.patientName} />
                  <div className="grow">
                    <strong>{c.patientName}</strong>
                    <span>{c.triage?.symptoms}</span>
                  </div>
                  <div className="k-op-row-meta">
                    <TriageBadge level={c.triage?.level} />
                    <span className="k-fine">{c.doctorName} · {fmtTime(c.createdAt)}</span>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="k-op-side">
          <section className="k-op-card">
            <div className="k-op-card-h"><h3>Connection</h3></div>
            <div className="k-op-net">
              <span className={cx('k-op-net-icon', offline ? 'off' : 'on')}>{offline ? <WifiOff /> : <Wifi />}</span>
              <div className="grow">
                <strong>{offline ? 'Offline mode' : 'Online'}</strong>
                <span>{offline ? 'Shown as offline to the network' : 'Connected to Sehatra'}</span>
              </div>
              <button type="button" className={cx('k-switch', offline && 'on')} role="switch" aria-checked={offline} onClick={toggleOffline} disabled={busy === 'status'}>
                <span />
              </button>
            </div>
            <p className="k-fine">Turn on offline mode when the network is down for a while, so doctors and the district team know.</p>
          </section>

          <section className="k-op-card">
            <div className="k-op-card-h"><h3>Device health</h3>{!demo ? <PreviewBadge>Coming soon</PreviewBadge> : faults ? <span className="k-badge warn"><AlertTriangle size={14} />{faults} need attention</span> : <span className="k-badge ok"><CheckCircle2 size={14} />All good</span>}</div>
            {!demo && <p className="k-fine">Automatic device monitoring isn&apos;t connected yet. Check the BP cuff, oximeter, thermometer, scale, glucometer and printer by hand at the start of the day.</p>}
            <div className="k-devices">
              {Object.entries(devices).map(([k, s]) => {
                const m = DEVICE_META[k] || { label: k, icon: Server };
                return (
                  <div key={k} className={cx('k-device', s !== 'ok' && 'bad')}>
                    <m.icon />
                    <strong>{m.label}</strong>
                    <span>{s === 'ok' ? 'Working' : String(s || 'unknown').replace(/_/g, ' ')}</span>
                  </div>
                );
              })}
            </div>
            {faults > 0 && <p className="k-fine">Please tell the district kiosk team about any device that needs attention.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
