import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, MapPin, Clock, Home as HomeIcon, BadgeCheck, Check, Droplet, Utensils, FileText, Building2, Phone, Smartphone, CalendarClock, ArrowRight, Download, Stethoscope } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { Button, Card, Empty, Field, Modal, Switch, fmtDate, fmtDateTime, fmtMoney, useAction, cx } from '../../components/ui';
import { usePatient, firstName, PageSkeleton } from './shared';
import { useDeviceLocation, LocationButton } from './NearbyDoctors';

const STEP_LABEL = { ordered: 'Test advised', collected: 'Sample collected', processing: 'Being tested', reported: 'Report ready' };
const hrs = (h) => (h == null ? '—' : h < 24 ? `${h} hours` : `${Math.round(h / 24)} day${h >= 48 ? 's' : ''}`);

function Timeline({ order, steps }) {
  return (
    <ol className="pt-lab-steps">
      {steps.map((s, i) => (
        <li key={s} className={cx(i < order.stepIndex && 'done', i === order.stepIndex && 'now')}>
          <span>{i <= order.stepIndex ? <Check size={12} strokeWidth={3} /> : i + 1}</span>{STEP_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

// How reporting works at this lab — the part people most often ask about.
function ReportingInfo({ quote, booking }) {
  if (!quote) return null;
  return (
    <div className="pt-lab-report small">
      <FileText size={15} />
      <span>
        Report in about <strong>{hrs(booking?.reportInHours ?? quote.reportInHours)}</strong> after the sample is collected.
        {' '}You&apos;ll get it on {quote.reportVia.join(', ')} — and it&apos;s saved to <strong>My records</strong> automatically. Your doctor is told the moment it&apos;s ready; critical values are flagged straight away.
      </span>
    </div>
  );
}

function LabChooser({ order, onClose, onBooked }) {
  const device = useDeviceLocation();
  const [data, setData] = useState(null);
  const [labId, setLabId] = useState(order?.labId || null);
  const [home, setHome] = useState(false);
  const [slot, setSlot] = useState('');
  const [shareRx, setShareRx] = useState(true);
  const [run, busy] = useAction();

  useEffect(() => {
    if (!order) return undefined;
    let alive = true;
    const qs = device.loc ? `?lat=${device.loc.lat}&lng=${device.loc.lng}` : '';
    api.get(`/lab-orders/${order.id}/labs${qs}`).then((r) => { if (alive) { setData(r); setLabId((cur) => (r.labs.some((l) => l.id === cur && l.offersAll) ? cur : r.labs.find((l) => l.offersAll)?.id || null)); } }).catch(() => alive && setData({ labs: [], tests: [] }));
    return () => { alive = false; };
  }, [order, device.loc]);

  const lab = data?.labs.find((l) => l.id === labId);
  useEffect(() => { if (lab && !lab.homeCollection) setHome(false); }, [lab]);
  const book = () => run('book', async () => {
    const r = await api.post(`/lab-orders/${order.id}/book`, { labId, homeCollection: home, slot: slot || undefined, shareRx });
    onBooked(r);
  }, home ? 'Booked! A technician will come home to collect the sample.' : 'Booked! Show your Health Passport QR at the lab.');

  return (
    <Modal open={!!order} onClose={onClose} wide title="Where can I get this test?" subtitle={order ? order.tests.map((t) => t.name).join(' · ') : ''}
      footer={<>
        {lab && <span className="small grow"><strong>{fmtMoney(lab.total + (home ? 50 : 0))}</strong> <span className="muted">at {lab.name}{home ? ' incl. ₹50 home collection' : ''}</span></span>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button icon={Check} disabled={!lab || !lab.offersAll} loading={busy === 'book'} onClick={book}>Book this lab</Button>
      </>}>
      {!data ? <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}</div> : (
        <div className="stack">
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="tiny muted">Sorted by labs that do all your tests, then distance.</span>
            <LocationButton device={device} />
          </div>
          {data.labs.length === 0 && <Empty icon={FlaskConical} title="No lab nearby does these tests yet">Ask your doctor or call 1800-200-4455 — we&apos;ll arrange it.</Empty>}
          <div className="pt-lab-list" role="radiogroup">
            {data.labs.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={labId === l.id} disabled={!l.offersAll} className={cx('pt-lab-opt', labId === l.id && 'on', !l.offersAll && 'partial')} onClick={() => setLabId(l.id)}>
                <span className="pt-radio" aria-hidden="true">{labId === l.id && <Check size={12} strokeWidth={3} />}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="strong block" translate="no">{l.name}</span>
                  <span className="tiny muted pt-wtb-meta">
                    {l.distanceKm !== null && <span><MapPin size={12} /> {l.distanceKm} km</span>}
                    {l.hours && <span><Clock size={12} /> {l.hours}</span>}
                    <span><FileText size={12} /> Report in {hrs(l.reportInHours)}</span>
                  </span>
                  <span className="pt-wtb-tags">
                    {data.cheapestId === l.id && <span className="badge green">Cheapest</span>}
                    {data.fastestId === l.id && <span className="badge sky">Fastest report</span>}
                    {l.government && <span className="badge clay">Government</span>}
                    {l.nabl && <span className="badge"><BadgeCheck size={11} /> NABL</span>}
                    {l.homeCollection && <span className="badge"><HomeIcon size={11} /> Home collection</span>}
                    {!l.offersAll && <span className="badge sun">Doesn&apos;t do {l.missing.join(', ')}</span>}
                  </span>
                  <span className="pt-lab-lines tiny">
                    {l.lines.map((t) => <span key={t.code}>{t.name}: <strong>{t.price !== null ? fmtMoney(t.price) : 'ask'}</strong></span>)}
                  </span>
                </span>
                <span className="pt-wtb-price"><strong>{fmtMoney(l.total)}</strong><span className="tiny muted">total</span></span>
              </button>
            ))}
          </div>
          {lab && (
            <div className="grid two">
              <div className="row between pt-lab-home">
                <span><strong className="small">Home sample collection</strong><span className="tiny muted block">{lab.homeCollection ? '+₹50 · a trained technician visits you' : 'Not offered by this lab'}</span></span>
                <Switch checked={home} onChange={lab.homeCollection ? setHome : () => {}} label="Home collection" />
              </div>
              <Field label="Preferred time (optional)"><input className="input" type="datetime-local" value={slot} min={new Date().toISOString().slice(0, 16)} onChange={(e) => setSlot(e.target.value)} /></Field>
            </div>
          )}
          {lab && (
            <label className="check small pt-share-rx">
              <input type="checkbox" checked={shareRx} onChange={(e) => setShareRx(e.target.checked)} />
              <span><strong>Share my prescription with {lab.name}</strong><span className="tiny muted block">They see the doctor&apos;s order and notes, so nothing is missed. You can change this later.</span></span>
            </label>
          )}
          {data.tests?.length > 0 && (
            <div className="pt-lab-prep">
              {data.tests.map((t) => <span key={t.code} className="tiny"><Droplet size={12} /> <strong>{t.name}:</strong> {t.sample} · <Utensils size={12} /> {t.prep}</span>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Tests() {
  const { patient, profiles } = usePatient();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [choosing, setChoosing] = useState(null);
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;
  const load = useCallback(() => api.get('/patient/tests').then(setData).catch(() => setData({ orders: [], steps: [] })), []);
  useEffect(() => { load(); }, [load, patient?.id]);

  if (!data) return <PageSkeleton />;
  const open = data.orders.filter((o) => o.status !== 'reported');
  const done = data.orders.filter((o) => o.status === 'reported');

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Tests & reports" title={isSelf ? 'Your lab tests' : `${firstName(patient?.name)}’s lab tests`}
        subtitle="Tests your doctor advised — where you can get them done, what they cost, and when the report will be ready." />
      {data.orders.length === 0 && (
        <Card><Empty icon={FlaskConical} title="No tests advised yet">When a doctor orders a test, it shows up here with nearby labs and prices.</Empty></Card>
      )}
      {open.length > 0 && <h3 className="pt-section-title">To do</h3>}
      {open.map((o, i) => (
        <article key={o.id} className={cx('card pt-lab-card', i < 6 && 'fade-in')}>
          <div className="row top between wrap" style={{ gap: 10 }}>
            <div>
              <strong>{o.tests.map((t) => t.name).join(' · ')}</strong>
              <div className="small muted">Advised by <span translate="no">{o.doctorName}</span> · {fmtDate(o.createdAt)}</div>
            </div>
            {o.quote && <div className="pt-wtb-price"><strong>{fmtMoney(o.booking?.price ?? o.quote.total)}</strong><span className="tiny muted">{o.booking ? 'booked' : 'at current lab'}</span></div>}
          </div>
          <Timeline order={o} steps={data.steps} />
          <div className="pt-lab-at small">
            <Building2 size={15} />
            <span>{o.booking ? 'Booked at' : 'Suggested lab'}: <strong translate="no">{o.labName || '—'}</strong>
              {o.quote?.distanceKm != null && <> · {o.quote.distanceKm} km</>}{o.quote?.hours && <> · {o.quote.hours}</>}
              {o.booking?.homeCollection && <> · <HomeIcon size={13} style={{ verticalAlign: '-2px' }} /> home collection</>}
              {o.booking?.slot && <> · <CalendarClock size={13} style={{ verticalAlign: '-2px' }} /> {fmtDateTime(o.booking.slot)}</>}
            </span>
            {o.quote?.phone && <a href={`tel:${o.quote.phone}`} className="tiny"><Phone size={12} /> Call lab</a>}
          </div>
          <div className="pt-lab-prep">
            {o.tests.map((t) => <span key={t.code} className="tiny"><Droplet size={12} /> <strong>{t.name}:</strong> {t.sample} · <Utensils size={12} /> {t.prep}</span>)}
          </div>
          {(o.referredByDoctor || o.sharedRx) && (
            <div className="row wrap tiny" style={{ gap: 6 }}>
              {o.referredByDoctor && <span className="badge sky">Referred by your doctor</span>}
              {o.sharedRx && <span className="badge green"><FileText size={11} /> Prescription shared with this centre</span>}
            </div>
          )}
          <ReportingInfo quote={o.quote} booking={o.booking} />
          {o.canChangeLab && (
            <div className="row wrap mt-1" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <Button variant={o.booking ? 'secondary' : 'clay'} icon={MapPin} onClick={() => setChoosing(o)}>{o.booking ? 'Change lab' : 'Compare labs & book'}</Button>
            </div>
          )}
        </article>
      ))}
      {done.length > 0 && <h3 className="pt-section-title">Reports ready</h3>}
      {done.map((o, i) => (
        <article key={o.id} className={cx('card pt-lab-card done', i < 6 && 'fade-in')}>
          <div className="row top between wrap" style={{ gap: 10 }}>
            <div>
              <strong>{o.tests.map((t) => t.name).join(' · ')}</strong>
              <div className="small muted"><span translate="no">{o.labName}</span> · report {fmtDate(o.reportedAt)}</div>
            </div>
            <span className="badge green"><Smartphone size={12} /> In My records</span>
          </div>
          {o.results?.length > 0 && (
            <table className="pt-wtb-table small mt-1">
              <tbody>
                {o.results.map((r) => (
                  <tr key={r.name} className={cx(r.flag && r.flag !== 'normal' && 'flag')}>
                    <td>{r.name}</td><td><strong>{r.value}</strong> {r.unit}</td><td className="muted">{r.range}</td><td className="right">{r.flag && r.flag !== 'normal' ? <span className="badge rose">{r.flag}</span> : <span className="badge green">normal</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {o.insights?.length > 0 && (
            <div className="pt-insights">
              <span className="tiny strong">What this means</span>
              {o.insights.map((x, i) => <div key={i} className={cx('pt-insight', x.level)}>{x.test && <strong className="small">{x.test}: </strong>}<span className="small">{x.text}</span></div>)}
              <span className="tiny muted">General guidance, not a diagnosis — your doctor will advise what&apos;s right for you.</span>
            </div>
          )}
          {o.doctorNote ? (
            <div className="pt-docnote"><Stethoscope size={16} /><div><span className="tiny muted">Advice from <span translate="no">{o.doctorNote.by}</span> · {fmtDate(o.doctorNote.at)}</span><p className="small mb-0">{o.doctorNote.text}</p></div></div>
          ) : <p className="tiny muted mb-0">Your doctor ({o.doctorName}) has been sent this report and will add advice here.</p>}
          <div className="row wrap mt-1" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" icon={Download} onClick={() => window.open(`/lab-report/${o.id}`, '_blank', 'noopener')}>Download report</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/patient/records')}>Open in My records <ArrowRight size={14} /></Button>
          </div>
        </article>
      ))}
      <LabChooser order={choosing} onClose={() => setChoosing(null)} onBooked={() => { setChoosing(null); load(); }} />
    </div>
  );
}
