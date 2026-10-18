import { useEffect, useState } from 'react';
import { Store, Truck, Stethoscope, Megaphone, ShieldAlert } from 'lucide-react';
import { api } from '../../api';
import { Modal, Button, Field, useAction } from '../../components/ui';
import { alertTitle } from './shared';

const COPY = {
  confirm: { title: 'Confirm this alert', verb: 'Confirm alert', done: 'Alert confirmed — doctors and pharmacies notified', prefix: 'Confirmed' },
  dismiss: { title: 'Dismiss as a false signal', verb: 'Dismiss alert', done: 'Alert dismissed', prefix: 'Dismissed' },
  acknowledge: { title: 'Acknowledge — under review', verb: 'Acknowledge', done: 'Acknowledged. The team can see you are on it.', prefix: 'Acknowledged' },
  resolve: { title: 'Mark as resolved', verb: 'Mark resolved', done: 'Alert resolved', prefix: 'Resolved' },
};

const CONFIRM_STEPS = [
  { icon: Store, title: 'Pharmacies get a stock advisory', body: 'Every verified pharmacy in the district gets a notification to review stock of related medicines and test kits.' },
  { icon: Truck, title: 'Rapid kits requested (dengue)', body: 'For dengue, a transfer of NS1 rapid kits is requested from the state warehouse to a local pharmacy — if both are on the network.' },
  { icon: Stethoscope, title: 'Doctors get a clinical heads-up', body: 'Doctors in the district get a notification to consider testing patients with matching symptoms.' },
  { icon: Megaphone, title: 'You can then send a public advisory', body: 'Nothing goes to the public automatically — you will review and publish it yourself.' },
];

export default function AlertAction({ alert, action, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [run, busy] = useAction();
  useEffect(() => { setNote(''); }, [alert?.id, action]);
  if (!alert || !action) return null;
  const c = COPY[action];
  const outbreakConfirm = action === 'confirm' && alert.type === 'outbreak';

  const submit = async () => {
    const body = note.trim() ? { note: `${c.prefix} — ${note.trim()}` } : {};
    const r = await run('go', () => api.post(`/alerts/${alert.id}/${action}`, body), c.done);
    if (r) { onDone?.(r, action); onClose(); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={c.title}
      subtitle={alertTitle(alert)}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={action === 'dismiss' ? 'secondary' : action === 'confirm' ? 'clay' : undefined} loading={busy === 'go'} onClick={submit}>{c.verb}</Button>
        </>
      )}
    >
      <div className="stack">
        <p className="small mb-0">{alert.message}</p>
        {outbreakConfirm && (
          <>
            <div className="small" style={{ fontWeight: 600 }}>When you confirm, this happens straight away:</div>
            <ol className="cc-steps">
              {CONFIRM_STEPS.map((s) => (
                <li key={s.title}>
                  <span className="cc-step-icon"><s.icon /></span>
                  <div>
                    <div className="small" style={{ fontWeight: 600 }}>{s.title}</div>
                    <div className="tiny muted">{s.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
        {action === 'dismiss' && (
          <div className="callout small"><ShieldAlert /> Dismissing closes the signal for everyone in your scope. The engine will raise it again if counts keep rising.</div>
        )}
        <Field label={action === 'dismiss' ? 'Why is this a false signal?' : 'Note for the action log (optional)'} hint="Visible to other officials and kept in the audit trail.">
          <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={action === 'dismiss' ? 'e.g. Duplicate lab upload from one camp' : 'e.g. Spoke to CMO, fogging scheduled'} />
        </Field>
      </div>
    </Modal>
  );
}
