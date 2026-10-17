import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Upload, ArrowRight, Stethoscope, AlertTriangle, MapPin, FileText, Home, CalendarClock, IndianRupee, Barcode, Stamp, Undo2, Gift } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Tabs, Empty, StatusBadge, Avatar, timeAgo, useAction } from '../../components/ui';
import { api } from '../../api';
import { NEXT, ORDER, STATUS_LABEL, TestChips, genderShort, canSign, openLabel } from './shared';
import Collection from './Collection';
import { getLocale } from '../../i18n';

const TABS = ['all', ...ORDER];

export default function Orders({ home, orders, reload, onReport }) {
  const [tab, setTab] = useState(() => (orders.some((o) => o.status === 'ordered') ? 'ordered' : 'all'));
  const [q, setQ] = useState('');
  const [run, busy] = useAction();
  // One pass for the tab counts; the filtered list only recomputes when orders, tab or search change.
  const counts = useMemo(() => orders.reduce((m, o) => { m[o.status] = (m[o.status] || 0) + 1; return m; }, {}), [orders]);
  const count = (s) => (s === 'all' ? orders.length : counts[s] || 0);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders
      .filter((o) => tab === 'all' || o.status === tab)
      .filter((o) => !needle || `${o.patientName} ${o.patientId} ${o.sampleId || ''} ${o.tests.map((t) => `${t.name} ${t.code}`).join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, tab, q]);

  const advance = async (o) => {
    const n = NEXT[o.status];
    const ok = await run(o.id, () => api.put(`/lab-orders/${o.id}/status`, { status: n.status }), `${n.done} · ${o.patientName}`);
    if (ok) reload();
  };

  return (
    <>
      <PageHeader title="Orders inbox" subtitle="Test orders from Nexus Healthcare doctors. Each one carries the patient's Health Passport ID and LOINC test codes, so nothing needs re-typing.">
        <div className="input-wrap lab-search">
          <Search />
          <input className="input" placeholder="Search patient, ID or test" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </PageHeader>

      <Tabs value={tab} onChange={setTab} tabs={TABS.map((s) => ({ value: s, label: s === 'all' ? 'All' : STATUS_LABEL[s], count: count(s) }))} />

      {list.length === 0 ? (
        <div className="card"><Empty title={tab === 'ordered' ? 'No new orders' : 'Nothing here'}>{tab === 'ordered' ? 'New orders from doctors land here instantly. Time for chai.' : 'Try another tab or clear the search.'}</Empty></div>
      ) : (
        <div className="lab-orders">
          {list.map((o) => (
            <article key={o.id} className={`card lab-order ${o.critical ? 'critical' : ''}`}>
              <div className="lab-order-who">
                <Avatar name={o.patientName} />
                <div className="grow">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <strong translate="no">{o.patientName}</strong>
                    <span className="small muted">{o.patientAge ?? '—'} {genderShort(o.patientGender)}</span>
                    {o.critical && <span className="badge solid-rose"><AlertTriangle /> Critical</span>}
                  </div>
                  <div className="tiny muted mono">{o.patientId}</div>
                </div>
              </div>
              <div className="lab-order-tests">
                <TestChips tests={o.tests} />
                <div className="row wrap tiny muted mt-1" style={{ gap: 12 }}>
                  <span className="row" style={{ gap: 4 }}><Stethoscope size={12} /> {o.doctorName || (o.packageName ? 'Booked by patient' : 'Network doctor')}</span>
                  <span className="row" style={{ gap: 4 }}><MapPin size={12} /> Pin {o.pincode}</span>
                  <span title={new Date(o.createdAt).toLocaleString(getLocale())}>Ordered {timeAgo(o.createdAt)}</span>
                  {o.referredByDoctor && <span className="lab-chip">Referred to you by the doctor</span>}
                  {o.booking?.homeCollection && <span className="lab-chip"><Home size={12} /> Home collection</span>}
                  {o.booking?.slot && <span className="row" style={{ gap: 4 }}><CalendarClock size={12} /> {new Date(o.booking.slot).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                  {o.packageName && <span className="lab-chip"><Gift size={12} /> {o.packageName}</span>}
                  {o.sampleId && <span className="lab-chip mono" translate="no"><Barcode size={12} /> {o.sampleId}</span>}
                  {o.sharedRx && <button type="button" className="lab-rx-link" onClick={() => window.open(`/rx/${o.sharedRx}`, '_blank', 'noopener')}><FileText size={12} /> Prescription shared{o.sharedBy === 'patient' ? ' by patient' : ''} · View</button>}
                </div>
                {o.booking?.paidAt && (
                  <div className="lab-pay tiny mt-1"><IndianRupee size={12} /> ₹{o.booking.advancePaid || o.booking.advance} advance paid online · <strong>collect ₹{o.booking.balance}</strong> {o.status === 'ordered' ? 'at collection' : '(if not collected yet)'}</div>
                )}
                {o.booking?.homeCollection && o.status === 'ordered' && <Collection key={`${o.id}-${o.collection?.assignedAt || ''}`} order={o} collectors={home?.lab?.collectors} reload={reload} />}
                {o.returnNote && o.status === 'processing' && <div className="callout rose tiny mt-1"><Undo2 size={14} /> <span>Sent back by {o.returnNote.by}: “{o.returnNote.text}”</span></div>}
              </div>
              <div className="lab-order-status"><StatusBadge status={o.status === 'collected' ? 'collected_sample' : o.status}>{STATUS_LABEL[o.status]}</StatusBadge></div>
              <div className="lab-order-act">
                {NEXT[o.status] && !(o.status === 'ordered' && o.collection) && <Button size="sm" variant={o.status === 'ordered' ? undefined : 'secondary'} loading={busy === o.id} onClick={() => advance(o)}>{NEXT[o.status].label}</Button>}
                {o.sampleId && o.status !== 'reported' && <Button size="sm" variant="ghost" icon={Barcode} onClick={() => openLabel(o.id)}>{o.sampleLabelPrintedAt ? 'Reprint label' : 'Print label'}</Button>}
                {o.status === 'processing' && <Button size="sm" variant="clay" icon={Upload} onClick={() => onReport(o)}>{o.draftReport ? 'Fix results' : 'Enter results'}</Button>}
                {o.status === 'review' && (canSign(home)
                  ? <Link to="/lab/approvals" className="btn sm clay"><Stamp size={14} /> Review &amp; sign</Link>
                  : <span className="tiny muted">With {home?.pathologists?.join(', ')} for sign-off</span>)}
                {o.status === 'reported' && <Link to="/lab/reports" className="btn sm ghost">View report <ArrowRight /></Link>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
