import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FlaskConical, MapPin, Home as HomeIcon, BadgeCheck, Check, Droplet, Utensils, FileText, Building2, Phone, Smartphone, CalendarClock, ArrowRight, ArrowLeft, Download, Stethoscope, Star, Users, LocateFixed, ShieldCheck, Ambulance, Repeat, Search, Hourglass, CreditCard, Bike, Gift, Stamp, HeartPulse } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { Button, Card, Empty, Field, Modal, Switch, fmtDate, fmtDateTime, fmtMoney, useAction, cx } from '../../components/ui';
import { usePatient, usePatientLive, firstName, localISO, PageSkeleton } from './shared';
import { useDeviceLocation } from './NearbyDoctors';
import PaymentStep from './Payment';
import ShareButton from '../../components/ShareButton';
import BookingFlow from './BookingFlow';
import { getLocale } from '../../i18n';
import './tests.css';

const STEP_LABEL = { ordered: 'Booked', collected: 'Test done', received: 'At the lab', processing: 'Being tested', review: 'Pathologist check', reported: 'Report ready' };
const hrs = (h) => (h == null ? '—' : h < 24 ? `${h} hours` : `${Math.round(h / 24)} day${h >= 48 ? 's' : ''}`);

function Timeline({ order, steps }) {
  const booked = !['to_book', 'awaiting_payment'].includes(order.bookingState);
  const at = booked ? order.stepIndex : -1; // not booked yet: "Book a lab" is the current step
  return (
    <ol className="pt-lab-steps">
      {steps.map((s, i) => (
        <li key={s} className={cx(i < at && 'done', (i === at || (!booked && i === 0)) && 'now')}>
          <span>{i <= at ? <Check size={12} strokeWidth={3} /> : i + 1}</span>{i === 0 && !booked ? 'Book a lab' : STEP_LABEL[s]}
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

const SORTS = [{ value: 'distance', label: 'Nearest' }, { value: 'cost', label: 'Lowest cost' }, { value: 'rating', label: 'Top rated' }, { value: 'popularity', label: 'Most popular' }];
const PLACE_ICON = { doctor: Stethoscope, home: HomeIcon, current: LocateFixed };
const PLACE_TITLE = { doctor: 'Near the clinic where I saw the doctor', home: 'Near my home', current: 'Near where I am now' };

// Book a lab in three steps: where to test → choose a lab that does every test (sort by distance, cost,
// rating or popularity) → collection & 20% advance. The tests come straight from the doctor's prescription.
function LabChooser({ order, onClose, onBooked }) {
  const device = useDeviceLocation();
  const [step, setStep] = useState(0);
  const [near, setNear] = useState(null);
  const [sort, setSort] = useState('distance');
  const [data, setData] = useState(null);
  // A test the patient booked themselves (from the public price page) starts on the lab they picked there.
  const [labId, setLabId] = useState(() => (order?.selfBooked ? order.labId || null : null));
  const [home, setHome] = useState(false);
  const [slot, setSlot] = useState('');
  const [shareRx, setShareRx] = useState(!order?.selfBooked);
  const [pay, setPay] = useState(null);
  const [expired, setExpired] = useState(false); // advance refused with 409: the booking changed, choose again
  const [run, busy] = useAction();

  // Mounted fresh per order (keyed in <Tests>), so every field starts clean. The first response also
  // decides `near`, which would re-run this effect for the very same query — the key check skips that.
  const fetched = useRef('');
  useEffect(() => {
    if (!order) return undefined;
    const key = (n) => `${n || ''}|${sort}|${device.loc?.lat ?? ''}|${device.loc?.lng ?? ''}`;
    if (fetched.current === key(near)) return undefined;
    let alive = true;
    const qs = new URLSearchParams({ sort, ...(near ? { near } : {}), ...(device.loc ? { lat: device.loc.lat, lng: device.loc.lng } : {}) });
    api.get(`/lab-orders/${order.id}/labs?${qs}`).then((r) => {
      if (!alive) return;
      fetched.current = key(r.near);
      setData(r);
      if (!near) setNear(r.near);
      setLabId((cur) => (r.labs.some((l) => l.id === cur) ? cur : r.labs[0]?.id || null));
    }).catch(() => alive && setData({ labs: [], tests: [], places: {} }));
    return () => { alive = false; };
  }, [order, near, sort, device.loc]);

  const lab = data?.labs.find((l) => l.id === labId);
  useEffect(() => { if (lab && !lab.homeCollection) setHome(false); }, [lab]);
  const price = lab ? lab.total + (home ? 50 : 0) : 0;
  const advance = lab ? Math.max(1, Math.ceil(price * (data?.advanceShare || 0.2))) : 0;
  const book = () => run('book', async () => {
    const r = await api.post(`/lab-orders/${order.id}/book`, { labId, homeCollection: home, slot: slot || undefined, shareRx, near });
    setPay(r.payment); setStep(3);
  });

  const title = ['Where would you like to get tested?', 'Choose a lab', 'Collection & payment', 'Pay 20% to confirm'][step];
  const footer = step === 3 ? (
    <>
      <Button variant="ghost" onClick={onClose}>Pay later</Button>
      {expired && <Button icon={ArrowLeft} onClick={() => { setExpired(false); setPay(null); setStep(1); }}>Choose again</Button>}
    </>
  ) : (
    <>
      {step > 0 ? <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)}>Back</Button> : <Button variant="ghost" onClick={onClose}>Cancel</Button>}
      {step === 0 && <Button icon={ArrowRight} disabled={!near} onClick={() => setStep(1)}>Show labs</Button>}
      {step === 1 && <Button icon={ArrowRight} disabled={!lab} onClick={() => setStep(2)}>Continue</Button>}
      {step === 2 && <Button variant="clay" loading={busy === 'book'} disabled={!lab} onClick={book}>Pay {fmtMoney(advance)} & book</Button>}
    </>
  );

  return (
    <Modal open={!!order} onClose={onClose} wide title={title} subtitle={order ? `${order.selfBooked ? 'Your test' : 'From your prescription'}: ${order.tests.map((t) => t.name).join(' · ')}` : ''} footer={footer}>
      {!data ? <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}</div> : (
        <div className="stack">
          <div className="steps">{[0, 1, 2, 3].map((i) => <span key={i} className={cx(i <= step && 'done')} />)}</div>

          {step === 0 && (
            <div className="pt-bk-types">
              {['doctor', 'home', 'current'].map((k) => {
                const P = PLACE_ICON[k];
                const place = data.places?.[k];
                return (
                  <button key={k} type="button" disabled={!place} className={cx('pt-bk-type', near === k && 'on')} onClick={() => { setNear(k); if (k === 'current' && !device.loc) device.request(); }}>
                    <P /><span><strong>{PLACE_TITLE[k]}</strong><span className="tiny muted block" translate="no">{place ? place.label : 'Not available'}</span></span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <>
              <div className="pt-lab-sort" role="radiogroup" aria-label="Sort labs">
                {SORTS.map((x) => <button key={x.value} type="button" role="radio" aria-checked={sort === x.value} className={cx('chip', sort === x.value && 'on')} onClick={() => setSort(x.value)}>{x.label}</button>)}
              </div>
              <span className="tiny muted">Only labs that do all {order.tests.length} of your tests · {PLACE_TITLE[near]?.toLowerCase()}</span>
              {data.labs.length === 0 && <Empty icon={FlaskConical} title="No lab does all these tests yet">Try another place, ask your doctor, or call 1800-200-4455 — we&apos;ll arrange it.</Empty>}
              <div className="pt-lab-list" role="radiogroup">
                {data.labs.map((l) => (
                  <button key={l.id} type="button" role="radio" aria-checked={labId === l.id} className={cx('pt-lab-opt', labId === l.id && 'on')} onClick={() => setLabId(l.id)}>
                    <span className="pt-radio" aria-hidden="true">{labId === l.id && <Check size={12} strokeWidth={3} />}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="strong block" translate="no">{l.name}</span>
                      <span className="tiny pt-wtb-meta">
                        <span><Star size={12} className="pt-sun" /> <strong>{l.rating ? l.rating.toFixed(1) : 'New'}</strong>{l.reviewCount ? <span className="muted"> ({l.reviewCount})</span> : null}</span>
                        <span className="muted"><Users size={12} /> {Number(l.testsDone).toLocaleString(getLocale())} tests done</span>
                        {l.distanceKm !== null && <span className="muted"><MapPin size={12} /> {l.distanceKm} km</span>}
                        <span className="muted"><FileText size={12} /> Report in {hrs(l.reportInHours)}</span>
                      </span>
                      <span className="pt-wtb-tags">
                        {data.cheapestId === l.id && <span className="badge green">Cheapest</span>}
                        {data.topRatedId === l.id && <span className="badge sun">Top rated</span>}
                        {data.fastestId === l.id && <span className="badge sky">Fastest report</span>}
                        {l.government && <span className="badge clay">Government</span>}
                        {l.nabl && <span className="badge"><BadgeCheck size={11} /> NABL</span>}
                        {l.homeCollection && <span className="badge"><HomeIcon size={11} /> Home collection</span>}
                      </span>
                      <span className="pt-lab-lines tiny">{l.lines.map((t) => <span key={t.code}>{t.name}: <strong>{t.price !== null ? fmtMoney(t.price) : 'ask'}</strong></span>)}</span>
                    </span>
                    <span className="pt-wtb-price"><strong>{fmtMoney(l.total)}</strong><span className="tiny muted">total</span></span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && lab && (
            <>
              <div className="pt-lab-at small"><Building2 size={15} /><span><strong translate="no">{lab.name}</strong> · {lab.distanceKm != null ? `${lab.distanceKm} km · ` : ''}{lab.hours}</span></div>
              <div className="row between pt-lab-home">
                <span><strong className="small">Home sample collection</strong><span className="tiny muted block">{lab.homeCollection ? '+₹50 · a trained technician visits you' : 'Not offered by this lab'}</span></span>
                <Switch checked={home} onChange={lab.homeCollection ? setHome : () => {}} label="Home collection" />
              </div>
              <Field label="Preferred time (optional)"><input className="input" type="datetime-local" value={slot} min={localISO().slice(0, 16)} onChange={(e) => setSlot(e.target.value)} /></Field>
              {!order.selfBooked && <label className="check small pt-share-rx">
                <input type="checkbox" checked={shareRx} onChange={(e) => setShareRx(e.target.checked)} />
                <span><strong>Share my prescription with {lab.name}</strong><span className="tiny muted block">They see the doctor&apos;s order, so nothing is missed.</span></span>
              </label>}
              <div className="pt-lab-prep">{data.tests.map((t) => <span key={t.code} className="tiny"><Droplet size={12} /> <strong>{t.name}:</strong> {t.sample} · <Utensils size={12} /> {t.prep}</span>)}</div>
              <dl className="kv review">
                <dt>Tests</dt><dd>{fmtMoney(lab.total)}</dd>
                {home && <><dt>Home collection</dt><dd>{fmtMoney(50)}</dd></>}
                <dt>Total</dt><dd><strong>{fmtMoney(price)}</strong></dd>
                <dt>Pay now (20%)</dt><dd><strong className="pt-green">{fmtMoney(advance)}</strong></dd>
                <dt>At the lab</dt><dd>{fmtMoney(price - advance)}</dd>
              </dl>
              <p className="tiny muted mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> The 20% advance confirms your slot and keeps fake bookings away. It counts towards your bill.</p>
            </>
          )}

          {step === 3 && pay && <PaymentStep payment={pay} onPaid={() => onBooked()} onError={(e) => setExpired(e.status === 409)} />}
        </div>
      )}
    </Modal>
  );
}

export default function Tests() {
  const { patient, profiles } = usePatient();
  const navigate = useNavigate();
  // Live: the lab's "sample collected" / "report ready" updates land here without a refresh.
  const { data, error, reload } = usePatientLive('/patient/tests', ['lab']);
  const [choosing, setChoosing] = useState(null);
  const [rebook, setRebook] = useState(null);
  const [packages, setPackages] = useState(false);
  const [payFor, setPayFor] = useState(null); // an unpaid package booking to finish
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;
  // Links from the public price pages: ?book=<test>&lab=<lab> opens the lab booking for that test (no prescription
  // needed), ?package=<id> opens that check-up package.
  const [params, setParams] = useSearchParams();
  const [preselect, setPreselect] = useState(null);
  const [linkError, setLinkError] = useState('');
  const bookCode = params.get('book');
  const pkgId = params.get('package');
  useEffect(() => {
    if (!bookCode && !pkgId) return undefined;
    let alive = true;
    const done = () => setParams((p) => { const n = new URLSearchParams(p); ['book', 'lab', 'package'].forEach((k) => n.delete(k)); return n; }, { replace: true });
    if (pkgId) { setPreselect(pkgId); setPackages(true); done(); return undefined; }
    api.post('/patient/tests/self-order', { code: bookCode, lab: params.get('lab') || undefined })
      .then((r) => { if (alive) { setChoosing(r.order); reload(); } })
      .catch((e) => { if (alive) setLinkError(e.message); })
      .finally(() => { if (alive) done(); });
    return () => { alive = false; };
  }, [bookCode, pkgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <Empty title="We couldn't load your tests">{error}</Empty>;
  if (!data) return <PageSkeleton />;
  const open = data.orders.filter((o) => o.status !== 'reported');
  const done = data.orders.filter((o) => o.status === 'reported');

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Tests & reports" title={isSelf ? 'Your lab tests' : `${firstName(patient?.name)}’s lab tests`}
        subtitle="Tests your doctor advised — where you can get them done, what they cost, and when the report will be ready." />
      <div className="card pt-pkg-cta">
        <HeartPulse size={22} />
        <span className="grow"><strong>Book a health check-up</strong><span className="tiny muted block">Packages from labs near you — fixed price, home collection where offered.</span></span>
        <Button variant="secondary" icon={Gift} onClick={() => setPackages(true)}>See packages</Button>
      </div>
      {linkError && <div className="callout rose"><FlaskConical /><span>{linkError}</span></div>}
      {data.orders.length === 0 && (
        <Card><Empty icon={FlaskConical} title="No tests advised yet">When a doctor orders a test, it shows up here with nearby labs and prices.</Empty></Card>
      )}
      {open.length > 0 && <h3 className="pt-section-title">To do</h3>}
      {open.map((o, i) => (
        <article key={o.id} className={cx('card pt-lab-card', i < 6 && 'fade-in')}>
          <div className="row top between wrap" style={{ gap: 10 }}>
            <div>
              <strong>{o.tests.map((t) => t.name).join(' · ')}</strong>
              <div className="small muted">{o.packageName ? <><Gift size={12} /> {o.packageName} · booked by you</> : o.selfBooked && !o.doctorName ? <>Booked by you</> : <>Advised by <span translate="no">{o.doctorName}</span></>} · {fmtDate(o.createdAt)}</div>
            </div>
            {o.quote && <div className="pt-wtb-price"><strong>{fmtMoney(o.booking?.price ?? o.quote.total)}</strong><span className="tiny muted">{o.bookingState === 'paid' || o.bookingState === 'in_lab' ? 'booked' : 'estimate'}</span></div>}
          </div>
          <Timeline order={o} steps={data.steps} />
          <CollectionStatus order={o} />
          {o.status === 'review' && (
            <div className="callout sky"><Stamp /><span><strong>Results are in.</strong> The lab&apos;s pathologist is checking and signing your report — it appears here as soon as it&apos;s approved.</span></div>
          )}
          {o.reportDueAt && !['reported', 'review'].includes(o.status) && (
            <div className="callout green pt-lab-due"><Hourglass /><span><strong>Your test is done.</strong> Report expected by <strong>{fmtDateTime(o.reportDueAt)}</strong> ({timeLeft(o.reportDueAt)}). We&apos;ll notify you — it appears right here, online and as a PDF.</span></div>
          )}
          {o.bookingState === 'paid' && o.status === 'ordered' && (
            <div className="callout sky"><CreditCard /><span>Booked · <strong>{fmtMoney(o.booking.advancePaid || o.booking.advance)}</strong> paid online · pay <strong>{fmtMoney(o.booking.balance)}</strong> at the lab.{o.booking.homeCollection ? ' A technician will come home to collect the sample.' : ' Show your Health Passport QR at the counter.'}</span></div>
          )}
          {o.bookingState === 'paid' && o.status === 'ordered' && (
            /* Where and when only — the test names stay private. */
            <div><ShareButton label="Tell family on WhatsApp" text={`My lab visit is booked on Nexus Healthcare${o.booking.homeCollection ? ' — home sample collection' : ` at ${o.labName}`}${o.booking.slot ? `, ${fmtDateTime(o.booking.slot)}` : ''}.`} /></div>
          )}
          {o.bookingState === 'awaiting_payment' && (
            <div className="callout"><CreditCard /><span>Your booking at <strong translate="no">{o.labName}</strong> isn&apos;t confirmed yet — pay the 20% advance ({fmtMoney(o.booking.advance)}) to confirm.</span></div>
          )}
          <div className="pt-lab-at small">
            <Building2 size={15} />
            <span>{o.bookingState === 'paid' || o.bookingState === 'in_lab' ? 'Booked at' : 'Nearest lab'}: <strong translate="no">{o.labName || '—'}</strong>
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
          {o.packageId && o.bookingState === 'awaiting_payment' && (
            <div className="row wrap mt-1" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="clay" icon={CreditCard} onClick={() => setPayFor(o)}>Finish booking</Button>
            </div>
          )}
          {o.canChangeLab && (
            <div className="row wrap mt-1" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="clay" icon={MapPin} onClick={() => setChoosing(o)}>{o.bookingState === 'awaiting_payment' ? 'Finish booking' : 'Choose a lab & book'}</Button>
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
          {o.signedBy && <div className="tiny muted pt-signed"><Stamp size={12} /> Approved by <strong translate="no">{o.signedBy.name}</strong> (Reg {o.signedBy.regNo})</div>}
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
          {o.nextSteps?.length > 0 && (
            <div className="pt-next">
              <span className="tiny strong">What to do next</span>
              {o.nextSteps.map((x, i) => (
                <div key={i} className={cx('pt-next-step', x.kind)}>
                  <span className="small">{x.text}</span>
                  {x.action === 'call108' && <a className="btn sm danger" href="tel:108"><Ambulance size={14} /> Call 108</a>}
                  {x.action === 'book_doctor' && o.doctorId && <Button size="sm" icon={Repeat} onClick={() => setRebook({ id: o.doctorId, name: o.doctorName })}>Book follow-up</Button>}
                  {x.action === 'find_specialist' && <Button size="sm" variant="secondary" icon={Search} onClick={() => navigate('/patient/consult', { state: { department: x.department } })}>Find {x.department}</Button>}
                </div>
              ))}
            </div>
          )}
          {o.doctorNote ? (
            <div className="pt-docnote"><Stethoscope size={16} /><div><span className="tiny muted">Advice from <span translate="no">{o.doctorNote.by}</span> · {fmtDate(o.doctorNote.at)}</span><p className="small mb-0">{o.doctorNote.text}</p></div></div>
          ) : o.doctorName ? <p className="tiny muted mb-0">Your doctor ({o.doctorName}) has been sent this report and will add advice here.</p> : null}
          <div className="row wrap mt-1" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <RateLab order={o} />
            <Button variant="secondary" size="sm" icon={Download} onClick={() => window.open(`/lab-report/${o.id}`, '_blank', 'noopener')}>Download PDF</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/patient/records')}>Open in My records <ArrowRight size={14} /></Button>
          </div>
        </article>
      ))}
      <LabChooser key={choosing?.id || 'none'} order={choosing} onClose={() => { setChoosing(null); reload(); }} onBooked={() => { setChoosing(null); reload(); }} />
      <BookingFlow doctor={rebook} onClose={() => setRebook(null)} />
      {(packages || payFor) && <PackagePicker resume={payFor} preselect={preselect} onClose={() => { setPackages(false); setPayFor(null); setPreselect(null); reload(); }} />}
    </div>
  );
}

const timeLeft = (iso) => {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'any moment now';
  const h = Math.floor(ms / 3600000); const m = Math.round((ms % 3600000) / 60000);
  return h >= 24 ? `in about ${Math.round(h / 24)} day${h >= 48 ? 's' : ''}` : h ? `in about ${h} h ${m} min` : `in about ${m} min`;
};

// Rate the lab once (feeds the rating other patients sort by).
function RateLab({ order }) {
  const [stars, setStars] = useState(order.review?.stars || 0);
  const [done, setDone] = useState(!!order.reviewed);
  const rate = (n) => { if (done) return; api.post(`/lab-orders/${order.id}/review`, { stars: n }).then(() => { setStars(n); setDone(true); }).catch(() => {}); };
  return (
    <span className="pt-rate" title={done ? 'Thanks for rating the lab' : 'Rate this lab'}>
      <span className="tiny muted">{done ? 'You rated' : 'Rate the lab'}</span>
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" disabled={done} className={cx(stars >= n && 'on')} onClick={() => rate(n)} aria-label={`${n} stars`}>★</button>)}
    </span>
  );
}

// Home collection: "Raju assigned · 9:00–10:00" → "on the way · ~20 min". The phone is the lab's,
// or the technician's own only if the lab chose to share it. ETA only — no live map.
function CollectionStatus({ order }) {
  const c = order.collection;
  if (!c || order.status !== 'ordered' || c.status === 'collected') return null;
  const when = c.window ? `${fmtDateTime(c.window.from)} – ${new Date(c.window.to).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })}` : null;
  const phone = c.phone || c.labPhone;
  return (
    <div className={cx('callout pt-collect', c.status === 'on_the_way' ? 'green' : 'sky')}>
      <Bike />
      <span className="grow">
        {c.status === 'on_the_way'
          ? <><strong translate="no">Technician {c.name}</strong> is on the way · arriving in <strong>~{c.etaLeftMin ?? c.etaMin} min</strong></>
          : <><strong translate="no">Technician {c.name}</strong> assigned{when ? <> · visit {when}</> : null}</>}
      </span>
      {phone && <a className="btn sm secondary" href={`tel:${phone}`}><Phone size={13} /> {c.phone ? `Call ${c.name}` : 'Call lab'}</a>}
    </div>
  );
}

// Health check-up packages: browse → collection & time → 20% advance (same payment flow as any lab booking).
function PackagePicker({ resume, preselect, onClose }) {
  const [data, setData] = useState(null);
  const [pick, setPick] = useState(null);
  const [home, setHome] = useState(!!resume?.booking?.homeCollection);
  const [slot, setSlot] = useState('');
  const [pay, setPay] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => {
    let alive = true;
    api.get('/patient/packages').then((r) => {
      if (!alive) return;
      setData(r);
      if (resume) setPick(r.packages.find((k) => k.id === resume.packageId && k.labId === resume.labId) || null);
      else if (preselect) { const k = r.packages.find((x) => x.id === preselect); if (k) { setPick(k); setHome(!!k.lab.homeCollection); } }
    }).catch(() => alive && setData({ packages: [] }));
    return () => { alive = false; };
  }, [resume, preselect]);
  const total = pick ? pick.price + (home && pick.lab.homeCollection ? data.homeFee : 0) : 0;
  const advance = Math.max(1, Math.ceil(total * (data?.advanceShare || 0.2)));
  const book = () => run('book', async () => {
    const r = await api.post('/patient/packages/book', { labId: pick.labId, packageId: pick.id, homeCollection: home && pick.lab.homeCollection, slot: slot || undefined, orderId: resume?.id });
    setPay(r.payment);
  });
  const title = pay ? 'Pay 20% to confirm' : pick ? pick.name : 'Book a health check-up';
  const footer = pay ? <Button variant="ghost" onClick={onClose}>Pay later</Button> : pick ? (
    <>
      {!resume && <Button variant="ghost" icon={ArrowLeft} onClick={() => setPick(null)}>Back</Button>}
      <Button variant="clay" loading={busy === 'book'} onClick={book}>Pay {fmtMoney(advance)} &amp; book</Button>
    </>
  ) : <Button variant="ghost" onClick={onClose}>Close</Button>;
  return (
    <Modal open onClose={onClose} wide title={title} subtitle={pick && !pay ? pick.lab.name : undefined} footer={footer}>
      {!data ? <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}</div>
        : pay ? <PaymentStep payment={pay} onPaid={onClose} />
          : pick ? (
            <div className="stack">
              {pick.description && <p className="small mb-0">{pick.description}</p>}
              <div className="pt-lab-prep">{pick.tests.map((t) => <span key={t.code} className="tiny"><Droplet size={12} /> <strong>{t.name}:</strong> {t.sample} · <Utensils size={12} /> {t.prep}</span>)}</div>
              <div className="row between pt-lab-home">
                <span><strong className="small">Home sample collection</strong><span className="tiny muted block">{pick.lab.homeCollection ? `+${fmtMoney(data.homeFee)} · a trained technician visits you` : 'Not offered by this lab'}</span></span>
                <Switch checked={home && pick.lab.homeCollection} onChange={pick.lab.homeCollection ? setHome : () => {}} label="Home collection" />
              </div>
              <Field label="Preferred time (optional)"><input className="input" type="datetime-local" value={slot} min={localISO().slice(0, 16)} onChange={(e) => setSlot(e.target.value)} /></Field>
              <dl className="kv review">
                <dt>Package</dt><dd>{fmtMoney(pick.price)}{pick.savings > 0 && <span className="tiny muted"> (tests separately {fmtMoney(pick.listPrice)})</span>}</dd>
                {home && pick.lab.homeCollection && <><dt>Home collection</dt><dd>{fmtMoney(data.homeFee)}</dd></>}
                <dt>Total</dt><dd><strong>{fmtMoney(total)}</strong></dd>
                <dt>Pay now (20%)</dt><dd><strong className="pt-green">{fmtMoney(advance)}</strong></dd>
                <dt>At the lab</dt><dd>{fmtMoney(total - advance)}</dd>
              </dl>
              <p className="tiny muted mb-0"><FileText size={12} style={{ verticalAlign: '-2px' }} /> Report in about {hrs(pick.reportInHours)} after the sample, checked and signed by the lab&apos;s pathologist.</p>
            </div>
          ) : data.packages.length === 0 ? <Empty icon={Gift} title="No packages near you yet">Labs on Nexus add check-ups here. Ask your doctor which tests you need.</Empty> : (
            <div className="pt-lab-list">
              {data.packages.map((k) => (
                <button key={`${k.labId}-${k.id}`} type="button" className="pt-lab-opt" onClick={() => { setPick(k); setHome(!!k.lab.homeCollection); }}>
                  <Gift size={18} className="pt-pkg-icon" />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="strong block">{k.name}</span>
                    <span className="tiny muted block" translate="no">{k.lab.name}{k.lab.distanceKm != null ? ` · ${k.lab.distanceKm} km` : ''}</span>
                    <span className="tiny pt-wtb-meta">
                      <span><Star size={12} className="pt-sun" /> <strong>{k.lab.rating ? k.lab.rating.toFixed(1) : 'New'}</strong></span>
                      <span className="muted">{k.tests.length} tests · report in {hrs(k.reportInHours)}</span>
                      {k.lab.homeCollection && <span className="muted"><HomeIcon size={12} /> Home collection</span>}
                      {k.lab.nabl && <span className="muted"><BadgeCheck size={12} /> NABL</span>}
                    </span>
                    <span className="pt-lab-lines tiny">{k.tests.map((t) => <span key={t.code}>{t.name}</span>)}</span>
                  </span>
                  <span className="pt-wtb-price"><strong>{fmtMoney(k.price)}</strong>{k.savings > 0 ? <span className="tiny pt-green">save {fmtMoney(k.savings)}</span> : <span className="tiny muted">package</span>}</span>
                </button>
              ))}
            </div>
          )}
    </Modal>
  );
}
