import { useEffect, useState } from 'react';
import { BellRing, BellOff, Smartphone, Trash2, Send } from 'lucide-react';
import { api } from '../api';
import { Button, Modal, Switch, useToast, timeAgo } from './ui';
import { pushSupported, isIos, isStandalone, currentSubscription, enablePush, disablePush } from '../push';

// "Phone alerts", from the account menu of every portal: get notifications even when Sehatra is closed.
export default function PushAlertsModal({ open, onClose }) {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [here, setHere] = useState(null); // this browser's subscription endpoint, if any
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const [i, sub] = await Promise.all([api.get('/push'), currentSubscription()]);
    setInfo(i); setHere(sub?.endpoint || null);
  };
  useEffect(() => { if (open) { setErr(''); setInfo(null); load().catch((e) => setErr(e.message)); } }, [open]);

  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const turnOn = () => run(async () => { await enablePush(info.publicKey); await load(); toast('Alerts are on for this device.'); });
  const turnOff = () => run(async () => { await disablePush(); await load(); toast('Alerts are off for this device.'); });
  const remove = (id) => run(async () => { await api.post('/push/unsubscribe', { id }); await load(); });
  const test = () => run(async () => { const r = await api.post('/push/test'); toast(r.sent ? 'Test alert sent — check your notifications.' : 'The alert could not be delivered.'); await load(); });
  const setDetail = (detail) => run(async () => { const r = await api.put('/push/detail', { detail }); setInfo((x) => ({ ...x, detail: r.detail })); });

  const supported = pushSupported();
  const blocked = supported && Notification.permission === 'denied';
  const onHere = Boolean(here && info?.devices?.length);

  return (
    <Modal open={open} onClose={onClose} title="Phone alerts" subtitle="Get notified about reports, appointments, medicines and emergencies — even when Sehatra is closed.">
      {!info && !err && <p className="muted">Loading…</p>}
      {info && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="card tint flat" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {onHere ? <BellRing size={22} style={{ color: "var(--green)" }} /> : <BellOff size={22} className="muted" />}
            <div style={{ flex: 1 }}>
              <strong>{onHere ? 'On for this device' : 'Off for this device'}</strong>
              {!supported && (isIos() && !isStandalone()
                ? <p className="muted small">On iPhone, first add Sehatra to your Home Screen (Share → Add to Home Screen), open it from there, then turn alerts on.</p>
                : <p className="muted small">This browser can't receive alerts. Try Chrome, Edge, Firefox or Samsung Internet.</p>)}
              {blocked && <p className="muted small">Notifications are blocked for this site. Allow them in your browser's site settings, then come back here.</p>}
            </div>
            {supported && !blocked && (onHere
              ? <Button variant="ghost" size="sm" onClick={turnOff} loading={busy}>Turn off</Button>
              : <Button size="sm" onClick={turnOn} loading={busy} disabled={!info.publicKey}>Turn on</Button>)}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <strong>Show details on the lock screen</strong>
              <p className="muted small">Off: alerts only say "New update on Sehatra". On: they show what it's about, like "Lab report ready" — anyone who sees your phone can read it.</p>
            </div>
            <Switch checked={info.detail} onChange={setDetail} label="Show details on the lock screen" />
          </div>

          {info.devices.length > 0 && (
            <div>
              <strong>Devices getting alerts</strong>
              <ul className="list" style={{ marginTop: 8 }}>
                {info.devices.map((dv) => (
                  <li key={dv.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0' }}>
                    <Smartphone size={18} className="muted" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>{dv.label}</div>
                      <div className="muted small">Added {timeAgo(dv.at)}{dv.lastOkAt ? ` · last alert ${timeAgo(dv.lastOkAt)}` : ''}</div>
                    </div>
                    <button type="button" className="icon-btn" onClick={() => remove(dv.id)} aria-label={`Stop alerts on ${dv.label}`} disabled={busy}><Trash2 size={16} /></button>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" icon={Send} onClick={test} loading={busy}>Send a test alert</Button>
            </div>
          )}
          <p className="muted small">Emergency (SOS) and safety alerts always come through. Routine ones follow your notification settings.</p>
        </div>
      )}
      {err && <div className="form-error mt-2" role="alert">{err}</div>}
    </Modal>
  );
}
