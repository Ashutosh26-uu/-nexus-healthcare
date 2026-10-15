import { useState } from 'react';
import { ScanLine, ShieldCheck, ShieldAlert, ShieldX, Clock, CheckCircle2 } from 'lucide-react';
import { Card, Button, Field, cx } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';

const VERDICT = {
  genuine: { icon: ShieldCheck, c: 'var(--green-2)', label: 'Genuine' },
  expired: { icon: Clock, c: 'var(--sun)', label: 'Expired' },
  recall: { icon: ShieldAlert, c: 'var(--clay)', label: 'Recalled' },
  fake: { icon: ShieldX, c: 'var(--rose)', label: 'Could not verify' },
  invalid: { icon: ShieldAlert, c: 'var(--ink-3)', label: 'Invalid code' },
};

export default function MedicineScan() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const scan = async (e) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setResult(null);
    try { setResult(await api.post('/medicine/scan', { code })); } catch (err) { setResult({ status: 'invalid', message: err.message }); } finally { setBusy(false); }
  };

  const v = result ? (VERDICT[result.status] || VERDICT.invalid) : null;

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Medicine Authenticity" title="Is my medicine real?"
        subtitle="Scan or type the code printed on the pack. We check it against the national supply grid and track-and-trace records, and flag fakes or recalls." />

      <div className="grid side">
        <Card>
          <form className="stack" onSubmit={scan}>
            <div className="pt-scan-frame">
              <ScanLine size={40} />
              <span className="small muted">Point the pack’s QR/barcode here, or enter the code below</span>
            </div>
            <Field label="Pack code / batch number">
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. B2407" dir="ltr" translate="no" />
            </Field>
            <Button type="submit" loading={busy} icon={ScanLine} block>Check this medicine</Button>
            <p className="tiny muted center mb-0">Try a real seeded batch (e.g. <span className="mono" translate="no">B2407</span>) or any code to see fake/recall detection.</p>
          </form>
        </Card>

        <Card className={cx('pt-scan-result', result && result.status)} style={v ? { borderColor: v.c } : undefined}>
          {!result ? (
            <div className="empty"><ShieldCheck /><div className="small muted">Your result will appear here.</div></div>
          ) : (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="pt-scan-badge" style={{ background: `color-mix(in srgb, ${v.c} 15%, transparent)`, color: v.c }}><v.icon size={34} /></span>
              <h3 className="mb-0" style={{ color: v.c }}>{v.label}</h3>
              {result.drug && <div className="strong" translate="no">{result.drug}{result.batch ? ` · ${result.batch}` : ''}</div>}
              <p className="small mb-0">{result.message}</p>
              {result.status === 'genuine' && <div className="row tiny" style={{ color: 'var(--green-2)', gap: 6 }}><CheckCircle2 size={14} /> Verified on the Nexus Healthcare supply grid</div>}
              <Button variant="ghost" size="sm" onClick={() => { setResult(null); setCode(''); }}>Scan another</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
