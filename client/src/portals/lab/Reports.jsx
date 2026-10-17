import { useState } from 'react';
import { ChevronDown, AlertTriangle, FileText } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Empty, Pills, fmtDateTime, cx } from '../../components/ui';
import { TestChips, genderShort } from './shared';

const FLAG_TONE = { normal: 'green', negative: 'green', high: 'sun', low: 'sun', positive: 'clay', critical: 'solid-rose' };

export default function Reports({ orders }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const reported = orders
    .filter((o) => o.status === 'reported')
    .filter((o) => (filter === 'critical' ? o.critical : filter === 'abnormal' ? (o.results || []).some((r) => r.flag !== 'normal' && r.flag !== 'negative') : true))
    .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));

  return (
    <>
      <PageHeader title="Reports sent" subtitle="Everything you've released. Patients see these in their Health Passport the moment you hit send." />
      <div className="mb-2">
        <Pills value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'abnormal', label: 'Abnormal' }, { value: 'critical', label: 'Critical' }]} />
      </div>
      {reported.length === 0 ? <div className="card"><Empty icon={FileText} title="No reports here yet">Reports you upload will be listed here.</Empty></div> : (
        <div className="stack">
          {reported.map((o) => {
            const isOpen = open === o.id;
            return (
              <div key={o.id} className={cx('card lab-report', isOpen && 'open')}>
                <button className="lab-report-head" onClick={() => setOpen(isOpen ? null : o.id)} aria-expanded={isOpen}>
                  <div className="grow">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <strong translate="no">{o.patientName}</strong>
                      <span className="small muted">{o.patientAge ?? '—'} {genderShort(o.patientGender)}</span>
                      {o.critical && <span className="badge solid-rose"><AlertTriangle /> Critical</span>}
                    </div>
                    <TestChips tests={o.tests} />
                  </div>
                  <span className="tiny muted nowrap">{fmtDateTime(o.reportedAt)}</span>
                  <ChevronDown size={18} className="lab-chev" />
                </button>
                {isOpen && (
                  <div className="table-wrap mt-2 fade-in">
                    <table className="table">
                      <thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead>
                      <tbody>
                        {(o.results || []).map((r, i) => (
                          <tr key={i}>
                            <td>{r.name}</td>
                            <td translate="no" dir="ltr"><strong>{r.value}</strong></td>
                            <td className="muted">{r.unit || '—'}</td>
                            <td className="muted">{r.range || '—'}</td>
                            <td><span className={`badge ${FLAG_TONE[r.flag] || ''}`} style={{ textTransform: 'capitalize' }}>{r.flag}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
