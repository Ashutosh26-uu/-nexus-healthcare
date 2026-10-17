import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pill, FileText, Search, Plus, Trash2, Store, Truck, MapPin, Clock, Check, ChevronDown, ArrowLeft, ArrowRight, Megaphone, Upload, CheckCircle2, Package, ShieldCheck, Phone, Info, BadgeIndianRupee } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, Empty, Field, Pills, cx, fmtDate, fmtMoney, useDebounced } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { ProtectedImg } from '../../components/Availability';
import VoiceInput from '../../components/VoiceInput';
import { usePatient, PageSkeleton } from './shared';
import { useDeviceLocation, LocationButton } from './NearbyDoctors';
import PaymentStep from './Payment';
import ShareButton from '../../components/ShareButton';

const STEPS = ['Medicines', 'Chemist', 'Pickup or delivery', 'Done'];

// Search the medicine list as you type (any medicine can still be entered by name).
function DrugField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const q = useDebounced(value.trim(), 250);
  useEffect(() => {
    if (q.length < 2 || !open) { setList([]); return undefined; }
    let alive = true; // a slow earlier query must not overwrite the newer suggestions
    api.get(`/drugs?q=${encodeURIComponent(q)}`).then((r) => alive && setList(r.slice(0, 6))).catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [q, open]);
  return (
    <div className="pt-om-drug">
      <div className="input-wrap"><Search /><input className="input" value={value} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => onChange(e.target.value)} placeholder="Medicine name, e.g. Paracetamol 650mg" /></div>
      {open && list.length > 0 && (
        <div className="pt-om-suggest">
          {list.map((x) => <button type="button" key={x.name} onMouseDown={() => { onChange(x.name); setOpen(false); }}>{x.name}{x.nearbyStock > 0 && <span className="tiny muted"> · in stock nearby</span>}</button>)}
        </div>
      )}
    </div>
  );
}

function Qty({ value, onChange }) {
  return (
    <span className="pt-qty">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Less">−</button>
      <input inputMode="numeric" value={value} onChange={(e) => onChange(Math.max(1, Math.min(500, parseInt(e.target.value.replace(/\D/g, ''), 10) || 1)))} aria-label="Quantity" />
      <button type="button" onClick={() => onChange(Math.min(500, value + 1))} aria-label="More">+</button>
    </span>
  );
}

export default function OrderMedicines() {
  const { home, homeLoading, patient, reloadHome } = usePatient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const device = useDeviceLocation();
  const prescriptions = useMemo(() => home?.prescriptions || [], [home]);
  const [step, setStep] = useState(0);
  // ?drug= comes from the public price checker: start on "other medicine" with that name filled in.
  const linkedDrug = (params.get('drug') || '').slice(0, 80);
  const [source, setSource] = useState(linkedDrug ? 'other' : 'rx');
  const [rxId, setRxId] = useState(params.get('rx') || '');
  const [picks, setPicks] = useState({}); // drug → { on, qty }
  // Rows carry a stable id so removing one doesn't hand its typed text / suggestions to the next row.
  const rowId = useRef(1);
  const newRow = (drug = '') => ({ id: rowId.current++, drug, qty: 1 });
  const [others, setOthers] = useState(() => [{ id: 0, drug: linkedDrug, qty: 1 }]);
  const [rxFile, setRxFile] = useState(null);
  const [quote, setQuote] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [openShop, setOpenShop] = useState(null);
  const [fulfilment, setFulfilment] = useState('pickup');
  const [address, setAddress] = useState('');
  const [result, setResult] = useState(null);
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const [subs, setSubs] = useState({}); // prescribed drug → cheaper same-salt option info
  const [confirmSub, setConfirmSub] = useState(null); // drug whose switch is waiting for the patient's yes
  const refill = params.get('refill') === '1';

  // No id, or a link/refill id that isn't on this profile (old link, another family member): fall back to the latest.
  useEffect(() => { if (source === 'rx' && prescriptions.length && !prescriptions.some((r) => r.id === rxId)) setRxId(prescriptions[0].id); }, [prescriptions, rxId, source]);
  useEffect(() => { if (!prescriptions.length && !homeLoading) setSource('other'); }, [prescriptions.length, homeLoading]);
  useEffect(() => { if (patient) setAddress((patient.address ? `${patient.address}, ` : '') + [patient.district, patient.state, patient.pincode].filter(Boolean).join(', ')); }, [patient?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const rx = prescriptions.find((r) => r.id === rxId);
  // Scan the prescription: every medicine on it, ticked, with the quantity for the full course.
  useEffect(() => {
    if (!rx) return undefined;
    let alive = true; // switching prescriptions quickly must not tick the previous one's medicines
    // A refill ticks only the regular medicines (28+ day courses, not "when needed").
    const regular = (drug) => { const it = rx.items.find((i) => i.drug === drug); return !refill || (Number(it?.days) >= 28 && !/sos|when needed|when breathless/i.test(it?.freq || '')); };
    api.post('/medicine-orders/quote', { rxId: rx.id }).then((q) => alive && setPicks(Object.fromEntries(q.items.map((i) => [i.drug, { on: regular(i.drug), qty: i.qty, unit: i.unit }])))).catch(() => {
      if (alive) setPicks(Object.fromEntries(rx.items.map((i) => [i.drug, { on: true, qty: 10, unit: 'unit' }])));
    });
    return () => { alive = false; };
  }, [rx?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cheaper same-salt-same-strength options, only for lines the doctor didn't mark "no substitution".
  useEffect(() => {
    setSubs({}); setConfirmSub(null);
    if (!rx) return undefined;
    let alive = true;
    rx.items.filter((it) => !it.noSub).forEach((it) => {
      api.get(`/medicines/substitutes?drug=${encodeURIComponent(it.drug)}`).then((s) => {
        const best = !s.noSwap && s.options.find((o) => o.saving > 0);
        if (alive && best) setSubs((m) => ({ ...m, [it.drug]: best }));
      }).catch(() => {});
    });
    return () => { alive = false; };
  }, [rx?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (homeLoading) return <PageSkeleton />;

  const items = source === 'rx' ? Object.entries(picks).filter(([, v]) => v.on).map(([drug, v]) => ({ drug, qty: v.qty, ...(v.sub ? { sub: v.sub } : {}) })) : others.filter((o) => o.drug.trim().length >= 2).map((o) => ({ drug: o.drug.trim(), qty: o.qty }));
  const shop = quote?.shops.find((s) => s.id === shopId);
  const open = shopId === 'any';
  const medicines = open ? quote?.estimate || 0 : shop?.total || 0;
  const deliveryFee = fulfilment === 'delivery' ? (quote?.deliveryFee || 0) : 0;
  const total = Math.round((medicines + deliveryFee) * 100) / 100;
  const advance = fulfilment === 'delivery' ? Math.ceil(total * (quote?.advanceShare || 0.35)) : 0;
  // What the generic swaps the patient accepted saved (shown + shareable on the "order sent" screen).
  const genericSaved = source === 'rx' ? Math.round(Object.entries(picks).filter(([, v]) => v.on && v.sub).reduce((s, [drug, v]) => s + (subs[drug]?.saving || 0) * (v.qty || 0), 0)) : 0;

  const findChemists = async () => {
    setError('');
    if (!items.length) { setError(source === 'rx' ? 'Tick at least one medicine.' : 'Add at least one medicine.'); return; }
    setBusy(true);
    try {
      const q = await api.post('/medicine-orders/quote', { ...(source === 'rx' ? { rxId } : {}), items, ...(device.loc ? { lat: device.loc.lat, lng: device.loc.lng } : {}) });
      setQuote(q);
      // A reorder goes back to the same chemist when it still has the medicines.
      const same = params.get('pharmacy') && q.shops.find((s) => s.id === params.get('pharmacy'));
      setShopId(same?.id || q.shops.find((s) => s.complete)?.id || q.shops[0]?.id || (q.chemistsNearby ? 'any' : null));
      setStep(1);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const uploadRx = async (file) => {
    if (!file) return;
    setBusy(true); setError('');
    try { const f = await api.upload(file); setRxFile({ id: f.id, name: file.name }); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const placeOrder = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post('/medicine-orders', {
        ...(source === 'rx' ? { rxId } : {}), items: open || !shop ? items : shop.lines.filter((l) => l.inStock).map((l) => ({ drug: l.switchedFrom || l.drug, qty: l.qty, ...(l.switchedFrom ? { sub: l.drug } : {}) })),
        pharmacyId: shopId, fulfilment, address, rxFileId: rxFile?.id, ...(device.loc ? { lat: device.loc.lat, lng: device.loc.lng } : {}),
      });
      setResult(r); setStep(3); reloadHome();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Medicines" title="Order medicines" subtitle="From your doctor's prescription or any medicine you need — we show chemists within 50 km that have it, with prices. Pick it up yourself, or get it delivered." />
      <div className="steps">{STEPS.map((s, i) => <span key={s} className={cx(i <= step && 'done')} />)}</div>

      {step === 0 && (
        <Card>
          <Field label="What do you want to order?">
            <div className="pt-bk-types two">
              <button type="button" disabled={!prescriptions.length} className={cx('pt-bk-type', source === 'rx' && 'on')} onClick={() => setSource('rx')}>
                <FileText /><span><strong>From a prescription</strong><span className="tiny muted block">{prescriptions.length ? 'We read the medicines for you' : 'No prescriptions yet'}</span></span>
              </button>
              <button type="button" className={cx('pt-bk-type', source === 'other' && 'on')} onClick={() => setSource('other')}>
                <Pill /><span><strong>Other medicine</strong><span className="tiny muted block">Tell us the name and how many</span></span>
              </button>
            </div>
          </Field>

          {source === 'rx' && prescriptions.length > 0 && (
            <div className="stack">
              <Field label="Which prescription?">
                <select className="select" value={rxId} onChange={(e) => setRxId(e.target.value)}>
                  {prescriptions.map((r) => <option key={r.id} value={r.id}>{r.doctorName} · {fmtDate(r.createdAt)} · {r.items.map((i) => i.drug).join(', ').slice(0, 60)}</option>)}
                </select>
              </Field>
              <div className="tiny muted">Tick what you want to buy and set how many:</div>
              {Object.keys(subs).length > 0 && <div className="tiny muted">Cheaper options have the same salt &amp; strength — ask your pharmacist/doctor if unsure. Prices are indicative.</div>}
              <div className="pt-om-list">
                {Object.entries(picks).map(([drug, v]) => {
                  const it = rx?.items.find((i) => i.drug === drug);
                  const alt = subs[drug];
                  const setSub = (sub) => { setPicks((p) => ({ ...p, [drug]: { ...v, sub } })); setConfirmSub(null); };
                  return (
                    <div key={drug}>
                      <label className={cx('pt-om-row', !v.on && 'off')}>
                        <input type="checkbox" checked={v.on} onChange={(e) => setPicks((p) => ({ ...p, [drug]: { ...v, on: e.target.checked } }))} />
                        <span className="grow"><strong translate="no">{v.sub || drug}</strong>{v.sub && <span className="tiny muted block">Instead of <span translate="no">{drug}</span></span>}{it && <span className="tiny muted block">{[it.dose, it.freq, it.days ? `${it.days} days` : null].filter(Boolean).join(' · ')}</span>}</span>
                        <Qty value={v.qty} onChange={(n) => setPicks((p) => ({ ...p, [drug]: { ...v, qty: n } }))} />
                        <span className="tiny muted pt-om-unit">{v.unit}{v.qty > 1 ? 's' : ''}</span>
                      </label>
                      {it?.noSub && <div className="tiny muted pt-om-sub">Your doctor asked for this exact medicine — no substitute offered.</div>}
                      {!it?.noSub && alt && v.on && (
                        <div className="pt-om-sub tiny">
                          {v.sub ? (
                            <span className="row wrap" style={{ gap: 6 }}><Check size={13} className="pt-green" /> Switched to the cheaper option. <button type="button" className="link-btn" onClick={() => setSub(undefined)}>Undo</button></span>
                          ) : confirmSub === drug ? (
                            <div className="callout sun"><Info /><span>
                              Switch <strong translate="no">{drug}</strong> to <strong translate="no">{alt.drug}</strong>? Same salt &amp; strength — ask your pharmacist/doctor if unsure.
                              <span className="row wrap mt-1" style={{ gap: 8 }}>
                                <Button size="sm" variant="ghost" onClick={() => setConfirmSub(null)}>Keep prescribed</Button>
                                <Button size="sm" onClick={() => setSub(alt.drug)}>Yes, switch</Button>
                              </span>
                            </span></div>
                          ) : (
                            <span className="row wrap" style={{ gap: 6 }}>
                              <BadgeIndianRupee size={13} className="pt-green" /> Cheaper option: <strong translate="no">{alt.drug}</strong> — save {fmtMoney(Math.round(alt.saving * v.qty))}
                              <button type="button" className="link-btn" onClick={() => setConfirmSub(drug)}>Switch</button>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {source === 'other' && (
            <div className="stack">
              <div className="pt-om-list">
                {others.map((o) => (
                  <div key={o.id} className="pt-om-row">
                    <DrugField value={o.drug} onChange={(v) => setOthers((l) => l.map((x) => (x.id === o.id ? { ...x, drug: v } : x)))} />
                    <Qty value={o.qty} onChange={(n) => setOthers((l) => l.map((x) => (x.id === o.id ? { ...x, qty: n } : x)))} />
                    <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setOthers((l) => (l.length > 1 ? l.filter((x) => x.id !== o.id) : [newRow()]))}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                <Button variant="secondary" size="sm" icon={Plus} onClick={() => setOthers((l) => [...l, newRow()].slice(0, 25))}>Add another medicine</Button>
                <VoiceInput label="Say the medicine names" onText={(t) => setOthers((l) => [...l.filter((x) => x.drug.trim()), ...t.split(/,| and | aur /i).map((s) => s.trim()).filter(Boolean).map((drug) => newRow(drug))].slice(0, 25))} />
              </div>
              <div className="pt-om-rxupload">
                <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { uploadRx(e.target.files?.[0]); e.target.value = ''; }} />
                <Button variant="ghost" size="sm" icon={rxFile ? CheckCircle2 : Upload} onClick={() => fileRef.current?.click()}>{rxFile ? rxFile.name : 'Attach a prescription photo'}</Button>
                <span className="tiny muted">Needed for prescription-only medicines (antibiotics, BP, sugar…). The chemist checks it before packing.</span>
              </div>
            </div>
          )}
          {error && <div className="form-error mt-1">{error}</div>}
          <div className="row between mt-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/patient/medicines')}>Back</Button>
            <Button icon={ArrowRight} loading={busy} onClick={findChemists}>Find chemists near me</Button>
          </div>
        </Card>
      )}

      {step === 1 && quote && (
        <Card>
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="tiny muted">Chemists within {quote.radiusKm} km that have {items.length > 1 ? 'these medicines' : 'this medicine'}: {quote.items.map((i) => `${i.drug} × ${i.qty}`).join(' · ')}</span>
            <LocationButton device={device} />
          </div>
          <div className="pt-wtb-list mt-1" role="radiogroup">
            {quote.shops.map((s) => (
              <div key={s.id} className={cx('pt-wtb-shop', shopId === s.id && 'on', !s.complete && 'partial')}>
                <button type="button" className="pt-wtb-head" role="radio" aria-checked={shopId === s.id} onClick={() => setShopId(s.id)}>
                  <span className="pt-radio" aria-hidden="true">{shopId === s.id && <Check size={12} strokeWidth={3} />}</span>
                  {s.photoFileId ? <ProtectedImg fileId={s.photoFileId} alt="" className="pt-wtb-photo" /> : <span className="pt-wtb-ic"><Store size={16} /></span>}
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="strong block" translate="no">{s.name}</span>
                    <span className="tiny muted pt-wtb-meta">
                      {s.distanceKm !== null && <span><MapPin size={12} /> {s.distanceKm} km</span>}
                      {s.hours && <span><Clock size={12} /> {s.hours}</span>}
                      {s.phone && <span><Phone size={12} /> <bdi dir="ltr">{s.phone}</bdi></span>}
                    </span>
                    <span className="pt-wtb-tags">
                      {quote.cheapestId === s.id && <span className="badge green">Cheapest</span>}
                      {quote.nearestId === s.id && <span className="badge sky">Nearest</span>}
                      {s.generic && <span className="badge clay">Generic</span>}
                      {s.delivery && <span className="badge"><Truck size={11} /> Own delivery</span>}
                      {s.complete ? <span className="badge green"><Check size={11} /> Has all {s.totalItems}</span> : <span className="badge sun">Has {s.availableCount} of {s.totalItems}</span>}
                    </span>
                  </span>
                  <span className="pt-wtb-price"><strong>{s.priced ? fmtMoney(s.total) : 'Ask'}</strong><span className="tiny muted">{s.complete ? 'total' : 'for what they have'}</span></span>
                </button>
                <button type="button" className="pt-wtb-more tiny" onClick={() => setOpenShop(openShop === s.id ? null : s.id)}>Price per medicine <ChevronDown size={13} style={{ transform: openShop === s.id ? 'rotate(180deg)' : 'none' }} /></button>
                {openShop === s.id && (
                  <table className="pt-wtb-table small"><tbody>
                    {s.lines.map((l) => <tr key={l.drug} className={cx(!l.inStock && 'muted')}><td translate="no">{l.drug}</td><td>{l.qty} {l.unit}{l.qty > 1 ? 's' : ''}{l.unitPrice !== null ? ` × ₹${l.unitPrice}` : ''}</td><td className="right">{l.inStock ? (l.lineTotal !== null ? fmtMoney(l.lineTotal) : 'Ask') : l.partial ? `Only ${l.available} left` : 'Not in stock'}</td></tr>)}
                  </tbody></table>
                )}
              </div>
            ))}
            {quote.chemistsNearby > 0 && (
              <div className={cx('pt-wtb-shop', open && 'on')}>
                <button type="button" className="pt-wtb-head" role="radio" aria-checked={open} onClick={() => setShopId('any')}>
                  <span className="pt-radio" aria-hidden="true">{open && <Check size={12} strokeWidth={3} />}</span>
                  <span className="pt-wtb-ic"><Megaphone size={16} /></span>
                  <span className="grow"><span className="strong block">Ask all {quote.chemistsNearby} chemists near me</span><span className="tiny muted">Every chemist within {quote.radiusKm} km gets your request — the first one who has it accepts.</span></span>
                  <span className="pt-wtb-price"><strong>~{fmtMoney(quote.estimate)}</strong><span className="tiny muted">estimate (MRP)</span></span>
                </button>
              </div>
            )}
          </div>
          {!quote.shops.length && !quote.chemistsNearby && <Empty icon={Store} title={`No chemist on Nexus within ${quote.radiusKm} km yet`}>We&apos;ve noted the demand. You can still buy from any chemist using your prescription.</Empty>}
          {error && <div className="form-error mt-1">{error}</div>}
          <div className="row between mt-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(0)}>Change medicines</Button>
            <Button icon={ArrowRight} disabled={!shopId} onClick={() => setStep(2)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 2 && quote && (
        <Card>
          <Field label="Will you pick it up yourself, or should we deliver?">
            <Pills value={fulfilment} onChange={setFulfilment} options={[{ value: 'pickup', label: 'I’ll pick it up myself' }, { value: 'delivery', label: 'Home delivery' }]} />
          </Field>
          {fulfilment === 'delivery' ? (
            <Field label="Deliver to" hint="Add a landmark so the rider finds you easily.">
              <textarea className="textarea" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House no., street, landmark, village/town" />
            </Field>
          ) : (
            <div className="callout green"><Store /><span>{open ? 'The chemist who accepts' : <strong translate="no">{shop?.name}</strong>} will pack it for you. You&apos;ll get a 4-digit pickup code — pay at the counter (cash or UPI).</span></div>
          )}
          <dl className="kv review mt-1">
            <dt>Medicines</dt><dd>{fmtMoney(medicines)}{open ? ' (estimate)' : ''}</dd>
            {fulfilment === 'delivery' && <><dt>Delivery</dt><dd>{fmtMoney(deliveryFee)}</dd></>}
            <dt>Total</dt><dd><strong>{fmtMoney(total)}</strong></dd>
            {fulfilment === 'delivery' && <><dt>Pay now (35%)</dt><dd><strong className="pt-green">{fmtMoney(advance)}</strong></dd><dt>On delivery</dt><dd>{fmtMoney(Math.round((total - advance) * 100) / 100)}</dd></>}
          </dl>
          {fulfilment === 'delivery' && <p className="tiny muted mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> A 35% advance confirms the order. If the chemist can&apos;t fulfil it, the advance is refunded.</p>}
          {error && <div className="form-error mt-1">{error}</div>}
          <div className="row between mt-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(1)}>Back</Button>
            <Button variant="clay" loading={busy} disabled={fulfilment === 'delivery' && address.trim().length < 8} onClick={placeOrder}>{fulfilment === 'delivery' ? `Continue to pay ${fmtMoney(advance)}` : open ? 'Send request to chemists' : 'Send order to chemist'}</Button>
          </div>
        </Card>
      )}

      {step === 3 && result && (
        <Card>
          {result.payment && !paid ? (
            <PaymentStep payment={result.payment} breakdown={{ medicines: result.order.medicines, deliveryFee: result.order.deliveryFee }} onPaid={() => { setPaid(true); reloadHome(); }} />
          ) : (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <div className="success-burst"><Check /></div>
              <h3 className="mb-0">Order {result.order.orderNo} sent</h3>
              <p className="small muted mb-0">{result.order.pharmacyName ? <><strong translate="no">{result.order.pharmacyName}</strong> has your order.</> : 'Every chemist near you has your request — we’ll tell you who accepts.'} We&apos;ll notify you at every step.</p>
              <div className="pt-bk-id"><span className="tiny muted">{result.order.fulfilment === 'delivery' ? 'Delivery code — share it with the rider' : 'Pickup code — show it at the counter'}</span><strong className="mono">{result.order.otp}</strong></div>
              {result.order.fulfilment === 'delivery' && <p className="small mb-0"><Truck size={14} style={{ verticalAlign: '-2px' }} /> Advance {fmtMoney(result.order.advance)} paid · {fmtMoney(result.order.balance)} on delivery</p>}
              {genericSaved > 0 && (
                <div className="callout green small" style={{ textAlign: 'left' }}><BadgeIndianRupee /><div className="stack" style={{ gap: 8 }}>
                  <span>You saved <strong>{fmtMoney(genericSaved)}</strong> by choosing same-salt generics.</span>
                  {/* The amount only — never which medicines. */}
                  <ShareButton label="Share the tip" url={window.location.origin} text={`I saved ${fmtMoney(genericSaved)} on medicines with Nexus Healthcare — it shows cheaper same-salt, same-strength options your doctor allows:`} />
                </div></div>
              )}
              <Button icon={Package} onClick={() => navigate('/patient/medicines')}>Track my order</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
