import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, QrCode, Phone, UserSearch, ChevronRight, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { Avatar, Card, Empty, cx } from '../../components/ui';
import { useDebounced } from './shared';
import { usePublicConfig } from '../../config';
import { RecordView } from './Record';
import StaffScan from '../../components/StaffScan';

// Seeded demo patients — offered as one-tap searches only on the demo network.
const EXAMPLES = [
  { q: 'OC-2041-5521', label: 'OC-2041-5521', icon: QrCode },
  { q: '9876500002', label: '98765 00002', icon: Phone },
  { q: 'Kamla', label: 'Kamla', icon: UserSearch },
];

export default function Patients() {
  const { pid } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const norm = /^[\d\s+-]+$/.test(q.trim()) ? q.replace(/\D/g, '').slice(-10) : q.trim();
  const dq = useDebounced(norm, 250);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const config = usePublicConfig();

  useEffect(() => {
    let alive = true;
    if (!dq) { setResults(null); return undefined; }
    setLoading(true);
    api.get(`/doctor/lookup?q=${encodeURIComponent(dq)}`)
      .then((r) => alive && setResults(r))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [dq]);

  return (
    <div className="stack lg">
      <PageHeader
        eyebrow="Health Passport lookup"
        title="Patients & records"
        subtitle="Find anyone on the network by passport ID, mobile number or name. You'll only see their history with consent — or through logged emergency access."
      />
      <div className="dr-patients">
        <div className="stack">
          <Card>
            <div className="input-wrap">
              <Search />
              <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Passport ID, mobile number or name" aria-label="Search patients" />
            </div>
            <div className="mt-1"><StaffScan block label="Scan Health Passport / emergency card" /></div>
            {config?.demo && (
              <div className="row wrap mt-1" style={{ gap: 6 }}>
                <span className="tiny muted">Demo patients</span>
                {EXAMPLES.map((e) => <button key={e.q} type="button" className="chip" onClick={() => setQ(e.q)}><e.icon size={13} style={{ display: 'inline', verticalAlign: '-2px', marginInlineEnd: 4 }} />{e.label}</button>)}
              </div>
            )}
          </Card>

          {loading && <div className="row small muted" style={{ padding: '4px 8px' }}><span className="spinner sm" />Searching the passport registry…</div>}
          {!loading && results && results.length === 0 && (
            <Card><Empty icon={UserSearch} title="No one found">Check the passport number on their card, or ask for the mobile number they registered with.</Empty></Card>
          )}
          {results && results.length > 0 && (
            <Card className="dr-results">
              {results.map((p) => (
                <button key={p.id} type="button" className={cx('dr-result', pid === p.id && 'active')} onClick={() => navigate(`/doctor/patients/${p.id}`)}>
                  <Avatar name={p.name} />
                  <span className="grow">
                    <span className="small" style={{ fontWeight: 600, display: 'block' }} translate="no">{p.name}</span>
                    <span className="tiny muted">{p.age} y · {p.gender} · {p.district} · <span className="mono" dir="ltr" translate="no">{p.id}</span></span>
                  </span>
                  <ChevronRight size={17} className="muted" />
                </button>
              ))}
            </Card>
          )}
          {!results && !pid && (
            <Card className="tint flat">
              <h4 className="mb-1 row" style={{ gap: 8 }}><ShieldCheck size={17} />How access works</h4>
              <ul className="small muted dr-ul">
                <li>Patients in your queue grant you 48-hour access automatically when they book.</li>
                <li>For anyone else, send a request — they approve on their phone or by OTP at a kiosk.</li>
                <li>In an emergency, break-glass opens critical data for 60 minutes. It's logged and reviewed.</li>
              </ul>
            </Card>
          )}
        </div>

        <Card className="dr-record">
          {pid ? <RecordView key={pid} patientId={pid} /> : (
            <Empty icon={QrCode} title="Open a record">Search on the left, or tap “Scan Health Passport” and point your camera at the patient’s card.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
