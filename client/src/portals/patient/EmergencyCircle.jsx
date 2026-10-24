import { useState } from 'react';
import { Users, UserPlus, MessageCircle, Copy, X } from 'lucide-react';
import { Button, Card, Field, timeAgo, useAction, useToast } from '../../components/ui';
import { api } from '../../api';
import { usePatientLive } from './shared';
import { useLive } from '../../live';

// Grown-up family and friends with their own Sehatra account join by an invite link; they get every SOS at once.
export default function EmergencyCircle() {
  const { data, reload } = usePatientLive('/patient/circle', ['patients', 'notifications']);
  const mine = useLive('/circle/mine', ['patients', 'notifications']);
  const [run, busy] = useAction();
  const toast = useToast();
  const [name, setName] = useState('');
  const [link, setLink] = useState(null);
  if (!data) return null;
  const invite = async () => {
    const r = await run('inv', () => api.post('/patient/circle/invite', { name }));
    if (r) { setLink(r.url); setName(''); reload(); }
  };
  const msg = link ? `Please join my emergency circle on Sehatra, so you're alerted if I ever press SOS: ${link}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(msg); toast('Copied — paste it in WhatsApp or SMS'); } catch { toast('Copy failed — press and hold the link to copy', 'error'); } };
  const remove = async (id, who) => { if (window.confirm(`Remove ${who}?`) && await run(`rm-${id}`, () => api.delete(`/patient/circle/${id}`))) reload(); };
  const leave = async (c) => { if (window.confirm(`Leave ${c.name}'s emergency circle? You won't get their SOS alerts any more.`) && await run(`lv-${c.patientId}`, () => api.post(`/circle/leave/${c.patientId}`), `You left ${c.name}'s circle`)) mine.reload(); };
  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><Users size={18} /> Emergency circle</h3>}>
      <p className="small mt-0">Grown-up family or friends who have their own Sehatra account. They get your SOS alert at once, with your location. Children and elders you look after are already on your Family page.</p>
      {data.members.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {data.members.map((m) => (
            <div key={m.userId} className="row" style={{ gap: 8 }}>
              <span className="grow small"><strong translate="no">{m.name}</strong> <span className="tiny muted">joined {timeAgo(m.since)}</span></span>
              <button type="button" className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => remove(m.userId, m.name)} disabled={busy === `rm-${m.userId}`}><X size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {data.invites.length > 0 && <p className="tiny muted">Waiting for: {data.invites.map((i) => i.name || 'someone').join(', ')} (links work for 7 days)</p>}
      {link ? (
        <div className="callout sky small mt-1">
          <span className="grow" style={{ wordBreak: 'break-all' }}>Send this link — it works once, for 7 days:<br /><strong>{link}</strong></span>
          <div className="row wrap mt-1" style={{ gap: 8 }}>
            <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>
            <a className="btn sm secondary" href={`sms:?body=${encodeURIComponent(msg)}`}>SMS</a>
            <button type="button" className="btn sm ghost" onClick={copy}><Copy size={15} /> Copy</button>
          </div>
        </div>
      ) : (
        <div className="row wrap mt-1" style={{ gap: 8, alignItems: 'flex-end' }}>
          <Field label="Their name (optional)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramesh (brother)" maxLength={60} /></Field>
          <Button icon={UserPlus} loading={busy === 'inv'} onClick={invite}>Invite someone</Button>
        </div>
      )}
      {(mine.data || []).length > 0 && (
        <div className="mt-2">
          <div className="tiny muted">You’ll get SOS alerts from:</div>
          {mine.data.map((c) => (
            <div key={c.patientId} className="row" style={{ gap: 8 }}>
              <span className="grow small" translate="no">{c.name}</span>
              <button type="button" className="link-btn tiny" onClick={() => leave(c)} disabled={busy === `lv-${c.patientId}`}>Leave</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
