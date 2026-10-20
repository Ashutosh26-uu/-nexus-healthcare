import { useMemo, useState } from 'react';
import { Stethoscope, Pill, FlaskConical, Upload, Syringe, FolderHeart, ChevronRight, ScanLine, AlertTriangle, Check, FileText, ExternalLink } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, Empty, Field, Modal, StatusBadge, cx, fmtDate, fmtDateTime, safeUrl, useAction, useToast } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, usePatientLive, firstName, localISO, Skeleton, isAbnormal } from './shared';
import { getLocale } from '../../i18n';

const KINDS = {
  visit: { label: 'Visits', one: 'Visit', icon: Stethoscope, tone: 'green' },
  prescription: { label: 'Prescriptions', one: 'Prescription', icon: Pill, tone: 'sun' },
  lab: { label: 'Lab reports', one: 'Lab report', icon: FlaskConical, tone: 'sky' },
  upload: { label: 'Uploads', one: 'Uploaded', icon: Upload, tone: 'plum' },
  vaccination: { label: 'Vaccinations', one: 'Vaccination', icon: Syringe, tone: 'clay' },
};

export default function Records() {
  const { patient, profiles } = usePatient();
  const { data, loading, error, reload } = usePatientLive('/patient/records', ['records', 'lab', 'consults', 'prescriptions']);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [uploading, setUploading] = useState(false);
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;

  const items = useMemo(() => data?.items || [], [data]);
  const counts = useMemo(() => items.reduce((acc, it) => { acc[it.kind] = (acc[it.kind] || 0) + 1; return acc; }, {}), [items]);
  const groups = useMemo(() => {
    const out = [];
    for (const it of items.filter((i) => filter === 'all' || i.kind === filter)) {
      const d = new Date(it.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, label: d.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' }), items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [items, filter]);

  const p = data?.patient || patient;

  return (
    <div className="stack lg">
      <PageHeader eyebrow="My records" title={isSelf ? 'Your health, in order' : `${firstName(p?.name)}’s health records`}
        subtitle="Every visit, report and prescription from any Sehatra doctor, lab or clinic — all in one timeline.">
        <Button icon={ScanLine} onClick={() => setUploading(true)}>Add an old report</Button>
      </PageHeader>

      <div className="grid side">
        <div className="stack lg">
          <div className="chip-select" role="group" aria-label="Filter records">
            <button className={cx('chip', filter === 'all' && 'on')} onClick={() => setFilter('all')}>Everything <span className="pt-chip-count">{items.length}</span></button>
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} className={cx('chip', filter === k && 'on')} onClick={() => setFilter(k)} disabled={!counts[k]}>{v.label} <span className="pt-chip-count">{counts[k] || 0}</span></button>
            ))}
          </div>

          {loading && !data ? (
            <div className="stack">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={72} r={12} />)}</div>
          ) : error ? (
            <Empty title="Couldn't load records">{error}</Empty>
          ) : groups.length === 0 ? (
            <Card><Empty icon={FolderHeart} title={filter === 'all' ? 'Nothing here yet' : `No ${KINDS[filter].label.toLowerCase()} yet`}>
              After a consult or lab test, records appear here automatically. Got old paper reports? Add them so every doctor sees the full picture.
            </Empty></Card>
          ) : (
            <div className="pt-timeline fade-in">
              {groups.map((g) => (
                <section key={g.key} className="pt-month">
                  <h3 className="pt-month-label">{g.label}</h3>
                  <div className="pt-month-items">
                    {g.items.map((it) => {
                      const K = KINDS[it.kind] || KINDS.upload;
                      const flagged = it.kind === 'lab' && it.data?.results?.some(isAbnormal);
                      return (
                        <button key={`${it.kind}-${it.id}`} className="pt-tl-item" onClick={() => setOpen(it)}>
                          <span className={`pt-ic-tile ${K.tone}`}><K.icon size={18} /></span>
                          <span className="grow pt-tl-body">
                            <span className="row wrap" style={{ gap: 8 }}>
                              <span className="strong">{it.title}</span>
                              {flagged && <span className="badge clay"><AlertTriangle /> Needs attention</span>}
                            </span>
                            {it.detail && <span className="small muted pt-ellipsis block">{it.detail}</span>}
                          </span>
                          <span className="tiny muted nowrap">{fmtDate(it.date)}</span>
                          <ChevronRight size={16} className="muted" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="stack lg">
          {p && (
            <Card title="Always on file">
              <dl className="pt-onfile">
                <dt>Blood group</dt><dd>{p.bloodGroup || '—'}</dd>
                <dt>Allergies</dt><dd>{p.allergies?.length ? p.allergies.map((a) => <span key={a} className="badge rose">{a}</span>) : <span className="muted">None known</span>}</dd>
                <dt>Conditions</dt><dd>{p.conditions?.length ? p.conditions.map((a) => <span key={a} className="badge">{a}</span>) : <span className="muted">None</span>}</dd>
                <dt>Regular medicines</dt><dd>{p.currentMeds?.length ? p.currentMeds.map((a) => <span key={a} className="badge sun">{a}</span>) : <span className="muted">None</span>}</dd>
              </dl>
              <p className="tiny muted mb-0 mt-2">Shown to doctors you&apos;ve given access to, and to emergency staff if you&apos;re ever unable to speak.</p>
            </Card>
          )}
          <Card className="tint">
            <div className="row top">
              <ScanLine className="pt-green" />
              <div className="grow">
                <strong>Old reports in a drawer?</strong>
                <p className="small muted mb-1">Snap or upload them. We&apos;ll read the key numbers so your doctor doesn&apos;t have to ask again.</p>
                <Button size="sm" variant="secondary" onClick={() => setUploading(true)}>Add a report</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <RecordModal item={open} onClose={() => setOpen(null)} />
      <UploadModal open={uploading} onClose={() => setUploading(false)} onDone={reload} />
    </div>
  );
}

/* ---------- details ---------- */
function RecordModal({ item, onClose }) {
  if (!item) return <Modal open={false} />;
  const K = KINDS[item.kind] || KINDS.upload;
  const d = item.data || {};
  return (
    <Modal open onClose={onClose} title={item.title} subtitle={`${K.one} · ${fmtDateTime(item.date)}`} wide={item.kind === 'lab'}>
      {item.kind === 'visit' && (
        <div className="stack">
          {d.diagnosis && <div><div className="tiny muted">Diagnosis</div><h3 className="mb-0" translate="no">{d.diagnosis}</h3></div>}
          {d.notes && <div className="pt-notes"><div className="small strong">Doctor&apos;s notes</div><p className="mb-0" translate="no">{d.notes}</p></div>}
          {d.triage?.symptoms && <p className="small mb-0"><span className="muted">Reason for visit:</span> <span translate="no">{d.triage.symptoms}</span></p>}
          {d.vitals && (
            <div className="pt-vitals" dir="ltr">
              {d.vitals.bp && <div><span className="tiny muted">BP</span><strong>{d.vitals.bp}</strong></div>}
              {d.vitals.pulse && <div><span className="tiny muted">Pulse</span><strong>{d.vitals.pulse}</strong></div>}
              {d.vitals.spo2 && <div><span className="tiny muted">SpO₂</span><strong>{d.vitals.spo2}%</strong></div>}
              {d.vitals.temp && <div><span className="tiny muted">Temp</span><strong>{d.vitals.temp}°F</strong></div>}
              {d.vitals.sugar && <div><span className="tiny muted">Sugar</span><strong>{d.vitals.sugar}</strong></div>}
              {d.vitals.weight && <div><span className="tiny muted">Weight</span><strong>{d.vitals.weight} kg</strong></div>}
            </div>
          )}
          <p className="small muted mb-0"><span translate="no">{d.doctorName}</span> · {d.doctorSpecialty}{d.kioskName ? ` · at ${d.kioskName}` : ''}</p>
        </div>
      )}
      {item.kind === 'prescription' && (
        <div className="stack">
          <div className="pt-rx-items">
            {(d.items || []).map((it, i) => (
              <div key={i} className="pt-rx-item"><strong translate="no">{it.drug}</strong><span className="small muted">{[it.dose, it.freq, it.days ? `${it.days} days` : null].filter(Boolean).join(' · ')}</span></div>
            ))}
          </div>
          {d.advice && <div className="callout green"><Check /><span translate="no">{d.advice}</span></div>}
          <div className="row between wrap small"><span className="muted">Signed · <span translate="no">{d.signature}</span></span><StatusBadge status={d.status} /></div>
        </div>
      )}
      {item.kind === 'lab' && (
        <div className="stack">
          <div className="row wrap small muted"><span translate="no">{d.labName}</span>·<span>Ordered by <span translate="no">{d.doctorName}</span></span><StatusBadge status={d.status} /></div>
          {d.results?.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Test</th><th>Result</th><th>Normal range</th><th /></tr></thead>
                <tbody>
                  {d.results.map((r) => (
                    <tr key={r.name} className={cx(isAbnormal(r) && 'pt-flag-row')}>
                      <td className="strong">{r.name}</td>
                      <td translate="no" dir="ltr"><strong>{r.value}</strong> <span className="muted small">{r.unit}</span></td>
                      <td className="muted small" translate="no" dir="ltr">{r.range}</td>
                      <td>{!isAbnormal(r) ? <span className="badge green">{r.flag === 'negative' ? 'Negative' : 'Normal'}</span> : <span className={cx('badge', r.flag === 'critical' ? 'solid-rose' : 'clay')}>{r.flag === 'low' ? 'Low' : r.flag === 'critical' ? 'Critical' : 'High'}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="callout sky"><FlaskConical /><span>Your sample is with the lab. We&apos;ll notify you the moment results are ready.</span></div>
          )}
          {d.results?.some(isAbnormal) && <p className="small muted mb-0">Some values are outside the usual range. Don&apos;t worry on your own — share this with your doctor at your next consult.</p>}
        </div>
      )}
      {item.kind === 'upload' && <ExtractedView rec={d} />}
      {item.kind !== 'upload' && (d.fileId || d.fileUrl) && <div className="mt-2"><FileLink fileId={d.fileId} fileUrl={d.fileUrl} /></div>}
      {item.kind === 'vaccination' && <p className="mb-0">Recorded on {fmtDate(item.date)}. Keep your vaccination card safe as well — some schools and offices still ask for paper.</p>}
    </Modal>
  );
}

const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE = 10 * 1024 * 1024;
const FILES_PATH = '/api/files/';

// Opens a stored file in a new tab (the file endpoint needs the auth header, so fetch it as a blob).
function FileLink({ fileId, fileUrl }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!fileId && !fileUrl) return null;
  // The server always sends fileId with its own /api/files URLs; anything else is a plain link.
  const id = fileId || (fileUrl.startsWith(FILES_PATH) ? decodeURIComponent(fileUrl.slice(FILES_PATH.length)) : null);
  const open = async () => {
    if (!id) {
      const href = safeUrl(fileUrl); // a stored link could be javascript:/data: — open only http(s) or our own paths
      if (href) window.open(href, '_blank', 'noopener,noreferrer'); else toast('This file link isn\'t valid.', 'error');
      return;
    }
    const win = window.open('', '_blank');
    if (win) win.opener = null; // the blank tab is later pointed at the blob; it needn't reach back into this page
    setBusy(true);
    try {
      const objectUrl = await api.fileObjectUrl(id);
      if (win) win.location.href = objectUrl; else window.open(objectUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch {
      win?.close();
      toast('Could not open the file. Please try again.', 'error');
    } finally { setBusy(false); }
  };
  return (
    <button type="button" className="btn ghost sm" onClick={open} disabled={busy} style={{ alignSelf: 'flex-start' }}>
      <ExternalLink size={14} /> View file
    </button>
  );
}

function ExtractedView({ rec }) {
  return (
    <div className="stack">
      {rec.fileName && <p className="small mb-0"><FileText size={14} className="inline-ic" /> <span translate="no">{rec.fileName}</span></p>}
      <FileLink fileId={rec.fileId} fileUrl={rec.fileUrl} />
      {rec.extracted?.length ? (
        <>
          <div className="small strong">Values we found</div>
          <div className="pt-extracted">
            {rec.extracted.map((x) => {
              const [k, v] = x.split(':');
              return <div key={x}><span className="tiny muted" style={{ textTransform: 'capitalize' }}>{k}</span><strong translate="no" dir="ltr">{v?.trim()}</strong></div>;
            })}
          </div>
          <p className="tiny muted mb-0">Read automatically — a health worker double-checks before doctors rely on it.</p>
        </>
      ) : <div className="callout sky"><Check /><span>{rec.summary || 'Saved. A health worker will verify the details.'}</span></div>}
    </div>
  );
}

/* ---------- upload ---------- */
const emptyUpload = () => ({ title: '', date: localISO().slice(0, 10), text: '', fileName: '' });

function UploadModal({ open, onClose, onDone }) {
  const [form, setForm] = useState(emptyUpload);
  const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState('');
  const [saved, setSaved] = useState(null);
  const [run, busy] = useAction();

  const close = () => { setSaved(null); setFile(null); setFileErr(''); setForm(emptyUpload()); onClose(); };
  const submit = (e) => {
    e.preventDefault();
    run('up', async () => {
      const stored = file ? await api.upload(file) : null; // → { id, name, mime, size, url }; sends X-Profile
      const rec = await api.post('/patient/records/upload', { title: form.title || undefined, date: form.date, text: form.text, fileName: form.fileName || undefined, fileId: stored?.id });
      setSaved({ ...rec, fileId: rec.fileId || stored?.id, fileUrl: rec.fileUrl || stored?.url });
      onDone?.();
    }, 'Report added to your records');
  };

  return (
    <Modal open={open} onClose={close} title={saved ? 'Added to your records' : 'Add an old report'} subtitle={saved ? saved.title : 'A photo or PDF of any lab report, discharge summary or prescription.'}
      footer={saved ? <Button onClick={close}>Done</Button> : null}>
      {saved ? <ExtractedView rec={saved} /> : (
        <form className="stack" onSubmit={submit}>
          <label className="pt-drop">
            {/* No `capture`: on phones it forces the camera, so a PDF or a photo already in the gallery can't be picked. */}
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => {
              const f = e.target.files?.[0];
              setFileErr('');
              if (f && !FILE_TYPES.includes(f.type)) { setFileErr('Please choose a PDF, PNG, JPG or WEBP file.'); return; }
              if (f && f.size > MAX_FILE) { setFileErr('That file is larger than 10 MB. Please choose a smaller one.'); return; }
              if (f) setFile(f);
              if (f) setForm((s) => ({ ...s, fileName: f.name, title: s.title || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') }));
            }} />
            <ScanLine size={26} />
            <span className="strong" translate={form.fileName ? 'no' : undefined}>{form.fileName || 'Take a photo or choose a file'}</span>
            <span className="tiny muted">{form.fileName ? 'Tap to choose a different one' : 'JPG, PNG or PDF'}</span>
          </label>
          {fileErr && <div className="callout rose"><AlertTriangle /><span>{fileErr}</span></div>}
          <div className="grid two">
            <Field label="What is it?"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sugar test, City Lab" /></Field>
            <Field label="Date on the report"><input className="input" type="date" value={form.date} max={localISO().slice(0, 10)} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          <Field label="Paste or type the text from the report" hint="Optional. Even a line like 'HbA1c 7.2, Haemoglobin 11.8' helps us pick out the numbers.">
            <textarea className="textarea" rows={4} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="HbA1c: 7.2 %  Fasting glucose: 142 mg/dL" />
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" type="button" onClick={close}>Cancel</Button>
            <Button type="submit" loading={busy === 'up'} disabled={!form.fileName && !form.title && !form.text}>Read & save</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
