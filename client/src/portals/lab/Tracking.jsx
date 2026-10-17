import { Upload, ChevronRight, Timer, TestTubes, Barcode, Stamp } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Empty, Stat, timeAgo, useAction } from '../../components/ui';
import { api } from '../../api';
import { NEXT, Stepper, TestChips, genderShort, openLabel } from './shared';
import ScanBox from './Scan';

const mins = (from) => Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 60000));
const dur = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

export default function Tracking({ orders, reload, onReport, patchOrder }) {
  const [run, busy] = useAction();
  const active = orders.filter((o) => o.status !== 'reported').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const reportedToday = orders.filter((o) => o.status === 'reported' && o.reportedAt && new Date(o.reportedAt).toDateString() === new Date().toDateString());
  const tat = orders.filter((o) => o.reportedAt).map((o) => (new Date(o.reportedAt) - new Date(o.createdAt)) / 60000);
  const avgTat = tat.length ? Math.round(tat.reduce((s, v) => s + v, 0) / tat.length) : null;

  // Optimistic: the step shows done at once; put back (useAction toasts the error) if the server refuses.
  // Always reload after — the server adds fields (sample ID, timestamps) the guess can't know.
  const advance = async (o) => {
    const n = NEXT[o.status];
    patchOrder?.(o.id, { status: n.status });
    const ok = await run(o.id, () => api.put(`/lab-orders/${o.id}/status`, { status: n.status }), n.done);
    if (!ok) patchOrder?.(o.id, { status: o.status });
    reload();
  };

  return (
    <>
      <PageHeader title="Sample tracking" subtitle="Every sample from collection to report. Doctors and patients see the same progress in their apps, so fewer “is it ready?” calls." />
      <ScanBox reload={reload} onReport={onReport} />

      <div className="grid three mb-2">
        <Stat label="Samples in progress" icon={TestTubes} value={active.length} />
        <Stat label="Reported today" value={reportedToday.length} />
        <Stat label="Average turnaround" icon={Timer} value={avgTat ? dur(avgTat) : '—'} sub="Order to report" />
      </div>

      {active.length === 0 ? (
        <div className="card"><Empty icon={TestTubes} title="No samples in the pipeline">Collected samples will appear here with their progress.</Empty></div>
      ) : (
        <div className="stack lg">
          {active.map((o) => {
            const waited = mins(o.createdAt);
            return (
              <article key={o.id} className="card lab-track">
                <div className="row between wrap" style={{ gap: 10 }}>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <strong translate="no">{o.patientName}</strong>
                      <span className="small muted">{o.patientAge ?? '—'} {genderShort(o.patientGender)} · <span className="mono">{o.sampleId || o.patientId}</span></span>
                    </div>
                    <TestChips tests={o.tests} />
                  </div>
                  <span className={`badge ${waited > 240 ? 'rose' : waited > 120 ? 'sun' : ''}`} title="Time since order"><Timer /> {dur(waited)} since order</span>
                </div>

                <Stepper order={o} />

                <div className="row between wrap lab-track-foot">
                  <span className="tiny muted">Ordered by {o.doctorName || 'network doctor'} {timeAgo(o.createdAt)}</span>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {o.sampleId && <Button variant="ghost" size="sm" icon={Barcode} onClick={() => openLabel(o.id)}>Label</Button>}
                    {o.status === 'processing' ? (
                      <Button variant="clay" icon={Upload} onClick={() => onReport(o)}>{o.draftReport ? 'Fix results' : 'Enter results'}</Button>
                    ) : o.status === 'review' ? (
                      <span className="badge sun"><Stamp size={12} /> Awaiting pathologist sign-off</span>
                    ) : NEXT[o.status] ? (
                      <Button loading={busy === o.id} onClick={() => advance(o)}>{NEXT[o.status].label} <ChevronRight size={16} /></Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
