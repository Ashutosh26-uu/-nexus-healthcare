import { useState } from 'react';
import { ScanLine, ShieldCheck, ShieldAlert, ShieldQuestion, Clock, CheckCircle2, Info } from 'lucide-react';
import { Card, Button, Field, PreviewBadge, cx, fmtDate } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { usePublicConfig } from '../../config';
import { scanVerdict } from './shared';

const VERDICT = {
  genuine: { icon: ShieldCheck, c: 'var(--green-2)', label: 'Batch found' },
  expired: { icon: Clock, c: 'var(--sun)', label: 'Expired' },
  unknown: { icon: ShieldQuestion, c: 'var(--ink-3)', label: 'Not in our records' },
  invalid: { icon: ShieldAlert, c: 'var(--ink-3)', label: 'Invalid code' },
};

export default function MedicineScan() {
  const config = usePublicConfig();
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const scan = async (e) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setResult(null);
    try { setResult(scanVerdict(await api.post('/medicine/scan', { code }))); } catch (err) { setResult({ status: 'invalid', message: err.message }); } finally { setBusy(false); }
  };

  const v = result ? (VERDICT[result.status] || VERDICT.unknown) : null;

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Medicine Authenticity" title="Is my medicine real?"
        subtitle="Type the batch number printed on the pack. We look it up among the stock that chemists on Nexus Healthcare have listed." />

      <div className="callout"><Info /><span><PreviewBadge /> This only knows batches stocked by chemists on Nexus Healthcare. It can&apos;t tell you a pack is fake — if in doubt, ask your pharmacist.</span></div>

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
            {config?.demo && <p className="tiny muted center mb-0">Demo: try a seeded batch such as <span className="mono" translate="no">B2407</span>.</p>}
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
              {result.status === 'genuine' && <p className="small mb-0">A chemist on Nexus Healthcare has listed this batch in its stock. Expires {fmtDate(result.expiry)}.</p>}
              {result.status === 'expired' && <p className="small mb-0">This batch expired on {fmtDate(result.expiry)}. Please don&apos;t use it — take it back to the chemist.</p>}
              {result.status === 'unknown' && <p className="small mb-0">We couldn&apos;t find this batch in the stock listed by chemists on Nexus Healthcare. That doesn&apos;t mean it&apos;s fake — check the code, or ask your pharmacist.</p>}
              {result.status === 'invalid' && <p className="small mb-0">{result.message}</p>}
              {result.status === 'genuine' && <div className="row tiny" style={{ color: 'var(--green-2)', gap: 6 }}><CheckCircle2 size={14} /> Matched against Nexus Healthcare chemist stock</div>}
              <Button variant="ghost" size="sm" onClick={() => { setResult(null); setCode(''); }}>Scan another</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
