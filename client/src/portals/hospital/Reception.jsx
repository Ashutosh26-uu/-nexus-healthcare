import { useEffect, useState } from 'react';
import { Search, UserPlus, Ticket, Printer, Tv, RefreshCw, Copy, ExternalLink, Megaphone, QrCode } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Field, Modal, Empty, Loading, StatusBadge, Pills, fmtTime, useAction, useToast, cx } from '../../components/ui';
import { useLive } from '../../live';
import { api } from '../../api';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// A small slip for a thermal / A6 printer: its own window, so the portal chrome never prints.
function printSlip(s) {
  const w = window.open('', '_blank', 'width=380,height=560');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Token ${esc(s.token)}</title><style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 12px; text-align: center; color: #000; }
    .f { font-weight: 700; font-size: 15px; } .t { font-size: 13px; color: #333; }
    .n { font-size: 64px; font-weight: 800; line-height: 1; margin: 10px 0 4px; letter-spacing: -1px; }
    .l { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 10px 0; }
    .r { display: flex; justify-content: space-between; font-size: 13px; margin: 3px 0; text-align: left; } .r b { text-align: right; }
  </style></head><body>
    <div class="f">${esc(s.facilityName)}</div><div class="t">OPD token · टोकन</div>
    <div class="n">${esc(s.token)}</div><div class="l">Token number</div><hr>
    <div class="r"><span>Doctor</span><b>${esc(s.doctorName)}</b></div>
    ${s.room ? `<div class="r"><span>Room</span><b>${esc(s.room)}</b></div>` : ''}
    <div class="r"><span>Patient</span><b>${esc(s.patientName)}</b></div>
    <div class="r"><span>Time</span><b>${esc(new Date(s.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</b></div>
    ${s.ahead != null ? `<div class="r"><span>Ahead of you</span><b>${esc(s.ahead)}</b></div>` : ''}
    ${s.feeCollected ? `<div class="r"><span>Fee paid</span><b>₹${esc(s.feeCollected)}</b></div>` : ''}
    <hr><div class="t">Please wait until your number shows on the screen.<br>कृपया स्क्रीन पर अपना नंबर आने तक प्रतीक्षा करें।</div>
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
  </body></html>`);
  w.document.close();
  return true;
}

export default function Reception({ home }) {
  const live = useLive('/hospital/reception', ['queue', 'consults']);
  const { reload } = live;
  // Doctors start consults from their own portal; a light poll keeps "now seeing" honest on this screen too.
  useEffect(() => { const t = setInterval(reload, 15000); return () => clearInterval(t); }, [reload]);
  const [slip, setSlip] = useState(null);
  const desk = live.data;
  if (live.loading && !desk) return <Loading />;
  if (!desk) return <Empty title="Couldn't load the reception desk">{live.error || 'Please refresh in a moment.'}</Empty>;

  return (
    <>
      <PageHeader title="Reception desk" subtitle="Give walk-ins a token, check in online bookings, and keep the waiting-room screen moving." />
      <div className="grid side">
        <div className="stack lg">
          <NewToken desk={desk} defaultFee={home.facility?.opdFee ?? ''} onIssued={(s) => { setSlip(s); reload(); }} />
          <CheckIn desk={desk} onDone={(s) => { setSlip(s); reload(); }} />
        </div>
        <div className="stack lg">
          <DoctorsToday desk={desk} setData={live.setData} />
          <DisplayLink desk={desk} setData={live.setData} />
        </div>
      </div>
      <TokensToday desk={desk} />
      <SlipModal slip={slip} onClose={() => setSlip(null)} />
    </>
  );
}

function NewToken({ desk, defaultFee, onIssued }) {
  const [run, busy] = useAction();
  const [mode, setMode] = useState('find');
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [patient, setPatient] = useState(null);
  const [reg, setReg] = useState({ name: '', age: '', gender: 'Female', phone: '' });
  const [doctorId, setDoctorId] = useState('');
  const [complaint, setComplaint] = useState('');
  const [fee, setFee] = useState(String(defaultFee));

  const search = async (e) => {
    e.preventDefault();
    const r = await run('find', () => api.get(`/hospital/reception/lookup?q=${encodeURIComponent(q.trim())}`));
    if (r) { setResults(r); if (r.length === 1) setPatient(r[0]); }
  };
  const register = async (e) => {
    e.preventDefault();
    const p = await run('reg', () => api.post('/hospital/reception/patients', reg), 'Health Passport created');
    if (p) { setPatient(p); setMode('find'); setResults([p]); setReg({ name: '', age: '', gender: 'Female', phone: '' }); }
  };
  const issue = async () => {
    const s = await run('issue', () => api.post('/hospital/reception/visits', { patientId: patient.id, doctorId, complaint, feeCollected: fee }));
    if (s) { onIssued(s); setPatient(null); setResults(null); setQ(''); setComplaint(''); }
  };
  const setR = (k) => (e) => setReg({ ...reg, [k]: e.target.value });

  return (
    <Card title="New walk-in token" action={<Ticket size={18} className="muted" />}>
      <Pills value={mode} onChange={setMode} options={[{ value: 'find', label: 'Find patient' }, { value: 'new', label: 'New patient' }]} />
      {mode === 'find' ? (
        <form className="rcp-search mt-2" onSubmit={search}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mobile, passport ID or name" aria-label="Search patient" minLength={3} required />
          <Button type="submit" icon={Search} loading={busy === 'find'}>Find</Button>
        </form>
      ) : (
        <form className="stack mt-2" onSubmit={register}>
          <Field label="Full name"><input className="input" value={reg.name} onChange={setR('name')} required minLength={2} autoComplete="off" /></Field>
          <div className="rcp-reg-row">
            <Field label="Age"><input className="input" type="number" min="0" max="120" inputMode="numeric" value={reg.age} onChange={setR('age')} required /></Field>
            <Field label="Sex">
              <select className="select" value={reg.gender} onChange={setR('gender')}>
                <option>Female</option><option>Male</option><option>Other</option>
              </select>
            </Field>
          </div>
          <Field label="Mobile" hint="Optional — lets them find this passport later"><input className="input" type="tel" inputMode="tel" value={reg.phone} onChange={setR('phone')} autoComplete="off" /></Field>
          <Button type="submit" icon={UserPlus} loading={busy === 'reg'}>Create passport</Button>
        </form>
      )}

      {mode === 'find' && results && (results.length === 0
        ? <p className="small muted mt-2 mb-0">No one found. Check the number, or switch to <button type="button" className="link-btn" onClick={() => setMode('new')}>New patient</button>.</p>
        : (
          <div className="rcp-results mt-2" role="listbox" aria-label="Matching patients">
            {results.map((p) => (
              <button key={p.id} type="button" role="option" aria-selected={patient?.id === p.id} className={cx('rcp-result', patient?.id === p.id && 'active')} onClick={() => setPatient(p)}>
                <strong translate="no">{p.name}</strong>
                <span className="tiny muted">{[p.age != null && `${p.age} y`, p.gender, p.phone].filter(Boolean).join(' · ')} · <span className="mono" translate="no">{p.id}</span></span>
              </button>
            ))}
          </div>
        ))}

      {patient && (
        <div className="stack mt-2 rcp-issue">
          <div className="small">Token for <strong translate="no">{patient.name}</strong></div>
          {desk.doctors.length === 0 ? <p className="small muted mb-0">No verified doctors are listed at this facility yet — add them under Staff roster.</p> : (
            <div className="rcp-docs" role="radiogroup" aria-label="Doctor">
              {desk.doctors.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={doctorId === x.id} className={cx('rcp-doc', doctorId === x.id && 'active')} onClick={() => setDoctorId(x.id)}>
                  <strong translate="no">{x.name}</strong>
                  <span className="tiny muted">{x.specialty}{x.room ? ` · ${x.room}` : ''}</span>
                  <span className="tiny">{x.waiting} waiting{x.available ? '' : ' · off duty'}</span>
                </button>
              ))}
            </div>
          )}
          <div className="rcp-reg-row">
            <Field label="Complaint" hint="Optional"><input className="input" value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="e.g. fever 3 days" /></Field>
            <Field label="Fee collected ₹"><input className="input" type="number" min="0" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
          </div>
          <Button icon={Ticket} disabled={!doctorId} loading={busy === 'issue'} onClick={issue}>Give token</Button>
        </div>
      )}
    </Card>
  );
}

// Online in-person bookings: the patient's rotating 6-digit code (or booking ID + code) → checked in + next token.
function CheckIn({ desk, onDone }) {
  const [run, busy] = useAction();
  const [code, setCode] = useState('');
  const [bookingNo, setBookingNo] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const c = await run('ci', () => api.post('/visits/check-in', { code, bookingNo: bookingNo || undefined }), 'Checked in');
    if (!c) return;
    const doc = desk.doctors.find((x) => x.id === c.doctorId);
    setCode(''); setBookingNo('');
    onDone({ consultId: c.id, token: c.token, doctorName: c.doctorName, room: doc?.room || '', facilityName: desk.facility.name, patientName: c.patientName, at: c.checkedInAt, ahead: doc ? doc.waiting : null });
  };
  return (
    <Card title="Check in an online booking" action={<QrCode size={18} className="muted" />}>
      <form className="stack" onSubmit={submit}>
        <div className="rcp-reg-row">
          <Field label="6-digit code" hint="Under the patient's visit QR"><input className="input mono" inputMode="numeric" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required /></Field>
          <Field label="Booking ID" hint="Optional"><input className="input mono" value={bookingNo} onChange={(e) => setBookingNo(e.target.value)} placeholder="NX-…" /></Field>
        </div>
        <Button type="submit" variant="secondary" loading={busy === 'ci'}>Check in &amp; give token</Button>
      </form>
    </Card>
  );
}

function DoctorsToday({ desk, setData }) {
  const toast = useToast();
  const [run, busy] = useAction();
  const callNext = async (x) => {
    const d = await run(`call-${x.id}`, () => api.post('/hospital/reception/call-next', { doctorId: x.id }));
    if (d) { setData(d); toast(`Calling token ${d.doctors.find((y) => y.id === x.id)?.nowSeeing} for ${x.name}`); }
  };
  const saveRoom = async (x, room) => {
    if (room.trim() === x.room) return;
    try { setData(await api.put('/hospital/reception/rooms', { doctorId: x.id, room: room.trim() })); toast(room.trim() ? `${x.name} · ${room.trim()}` : 'Room cleared'); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Card title="Doctors today">
      {desk.doctors.length === 0 ? <Empty title="No doctors listed">Add your doctors under Staff roster first.</Empty> : (
        <div className="stack">
          {desk.doctors.map((x) => (
            <div key={x.id} className="rcp-doc-row">
              <div className="grow">
                <strong translate="no">{x.name}</strong>
                <div className="tiny muted">{x.specialty} · {x.waiting} waiting{x.avgWaitMin != null ? ` · ~${x.avgWaitMin} min` : ''}</div>
                <input key={x.room} className="input sm rcp-room" defaultValue={x.room} placeholder="Room (e.g. OPD 3)" aria-label={`Room for ${x.name}`} maxLength={24}
                  onBlur={(e) => saveRoom(x, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              </div>
              <div className="rcp-now">
                <span className="tiny muted">Now</span>
                <strong>{x.nowSeeing ?? '—'}</strong>
                {x.next.length > 0 && <span className="tiny muted">Next {x.next.join(', ')}</span>}
              </div>
              <Button size="sm" variant="secondary" icon={Megaphone} disabled={!x.waiting} loading={busy === `call-${x.id}`} onClick={() => callNext(x)} title="Show the next token on the waiting-room screen">Call next</Button>
            </div>
          ))}
          <p className="tiny muted mb-0">When a doctor starts a consult from their queue, the screen moves on by itself. Use “Call next” for doctors who call patients in by voice.</p>
        </div>
      )}
    </Card>
  );
}

function DisplayLink({ desk, setData }) {
  const toast = useToast();
  const [run, busy] = useAction();
  const url = desk.displayCode ? `${window.location.origin}/display/${desk.displayCode}` : '';
  const rotate = async () => {
    if (desk.displayCode && !window.confirm('Make a new link? Screens using the old link will stop updating until you open the new one on them.')) return;
    const d = await run('rot', () => api.post('/hospital/reception/display-code'), desk.displayCode ? 'New link made — the old one no longer works' : 'Display link ready');
    if (d) setData(d);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Copy failed — select the link and copy it', 'error'); }
  };
  return (
    <Card title="Waiting-room screen" action={<Tv size={18} className="muted" />}>
      <p className="small muted">Open this link on the TV in your waiting room. It shows only token numbers and doctors — never patient names. Keep the link private; make a new one if it leaks.</p>
      {url ? (
        <>
          <input className="input sm mono rcp-link" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Display link" />
          <div className="row wrap mt-1">
            <Button size="sm" variant="secondary" icon={Copy} onClick={copy}>Copy</Button>
            <a className="btn sm secondary" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open</a>
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy === 'rot'} onClick={rotate}>New link</Button>
          </div>
        </>
      ) : <Button icon={Tv} loading={busy === 'rot'} onClick={rotate}>Create display link</Button>}
    </Card>
  );
}

function TokensToday({ desk }) {
  if (!desk.tokens.length) return null;
  return (
    <Card title={`Tokens today (${desk.tokens.length})`} className="mt-3">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Came</th><th>Status</th></tr></thead>
          <tbody>
            {desk.tokens.map((t) => (
              <tr key={t.consultId}>
                <td><strong className="rcp-token-cell">{t.token}</strong></td>
                <td translate="no">{t.patientName}</td>
                <td className="nowrap"><span translate="no">{t.doctorName}</span>{t.room && <span className="tiny muted"> · {t.room}</span>}</td>
                <td className="nowrap">{t.source === 'walk_in' ? 'Walk-in' : 'Online'} · {fmtTime(t.checkedInAt)}</td>
                <td>{t.status === 'completed' ? <StatusBadge status="completed">Done</StatusBadge> : t.status === 'in_progress' ? <StatusBadge status="in_progress">With doctor</StatusBadge> : t.calledAt ? <span className="badge sun">Called</span> : t.status === 'cancelled' ? <span className="badge rose">Cancelled</span> : <span className="badge sky">Waiting</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SlipModal({ slip, onClose }) {
  const toast = useToast();
  if (!slip) return null;
  return (
    <Modal open onClose={onClose} title="Token issued">
      <div className="rcp-slip">
        <span className="tiny muted" translate="no">{slip.facilityName}</span>
        <div className="rcp-slip-no">{slip.token}</div>
        <div className="small"><strong translate="no">{slip.doctorName}</strong>{slip.room ? ` · ${slip.room}` : ''}</div>
        <div className="small muted"><span translate="no">{slip.patientName}</span> · {fmtTime(slip.at)}{slip.ahead != null ? ` · ${slip.ahead} ahead` : ''}</div>
      </div>
      <div className="row mt-2" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Done</Button>
        <Button icon={Printer} onClick={() => { if (!printSlip(slip)) toast('Allow pop-ups for this site to print the slip', 'error'); }}>Print slip</Button>
      </div>
    </Modal>
  );
}
