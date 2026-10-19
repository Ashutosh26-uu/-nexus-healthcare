import { useRef, useState } from 'react';
import { ScanLine, ShieldCheck, ShieldAlert, ShieldQuestion, Clock, CheckCircle2, Info, Camera, Ban } from 'lucide-react';
import { Card, Button, Field, PreviewBadge, cx, fmtDate } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import BarcodeScanner, { canScan, packFieldsFrom } from '../../components/BarcodeScanner';
import { api } from '../../api';
import { usePublicConfig } from '../../config';
import { scanVerdict } from './shared';

const VERDICT = {
  genuine: { icon: ShieldCheck, c: 'var(--green-2)', label: 'Batch found' },
  expired: { icon: Clock, c: 'var(--sun)', label: 'Expired' },
  recall: { icon: Ban, c: 'var(--rose)', label: 'Recalled — don’t use it' },
  unknown: { icon: ShieldQuestion, c: 'var(--ink-3)', label: 'Not in our records' },
  invalid: { icon: ShieldAlert, c: 'var(--ink-3)', label: 'Invalid code' },
};

export default function MedicineScan() {
  const config = usePublicConfig();
  const [code, setCode] = useState('');
  const [read, setRead] = useState(null); // what the camera read off the pack (GS1 fields), shown with the result
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const seq = useRef(0); // a newer check wins over a slower older one
  const camera = canScan();

  const check = async (value) => {
    const c = String(value ?? code).trim();
    if (!c) return;
    const id = ++seq.current;
    setBusy(true); setResult(null);
    try {
      const r = scanVerdict(await api.post('/medicine/scan', { code: c }));
      if (id === seq.current) setResult(r);
    } catch (err) {
      if (id === seq.current) setResult({ status: 'invalid', message: err.message });
    } finally {
      if (id === seq.current) setBusy(false);
    }
  };
  const submit = (e) => { e.preventDefault(); setRead(null); check(); };
  const onScan = (raw) => {
    setScanning(false);
    const f = packFieldsFrom(raw);
    const lookup = f.batch || f.serial || f.raw; // chemists list stock by batch
    setRead(f.gtin ? f : null);
    setCode(lookup);
    check(lookup);
  };

  const v = result ? (VERDICT[result.status] || VERDICT.unknown) : null;

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Medicine Authenticity" title="Is my medicine real?"
        subtitle={camera ? 'Scan the barcode on the pack with your camera, or type the batch number. We look it up among the stock that chemists on Nexus Healthcare have listed.' : 'Type the batch number printed on the pack. We look it up among the stock that chemists on Nexus Healthcare have listed.'} />

      <div className="callout"><Info /><span><PreviewBadge /> This only knows batches stocked by chemists on Nexus Healthcare. It can&apos;t tell you a pack is fake — if in doubt, ask your pharmacist.</span></div>

      <div className="grid side">
        <Card>
          <form className="stack" onSubmit={submit}>
            {camera ? (
              <button type="button" className="pt-scan-frame pt-scan-tap" onClick={() => setScanning(true)}>
                <Camera size={40} />
                <strong>Tap to scan with your camera</strong>
                <span className="small muted">Point it at the barcode or square code on the strip or box — it reads by itself.</span>
              </button>
            ) : (
              <div className="pt-scan-frame">
                <ScanLine size={40} />
                <span className="small muted">This device has no camera we can use — type the batch number printed on the pack below.</span>
              </div>
            )}
            <Field label="Batch number (or pack code)" hint="Printed near the expiry date, often after “B.No.” or “Batch”.">
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. B2407" dir="ltr" translate="no" autoCapitalize="characters" />
            </Field>
            <Button type="submit" loading={busy} icon={ScanLine} block disabled={!code.trim()}>Check this medicine</Button>
            {config?.demo && <p className="tiny muted center mb-0">Demo: try a seeded batch such as <span className="mono" translate="no">B2407</span>.</p>}
          </form>
          <BarcodeScanner open={scanning} onClose={() => setScanning(false)} title="Scan the medicine pack"
            subtitle="Hold the barcode or square code inside the frame. Good light helps." onResult={onScan} />
        </Card>

        <Card className={cx('pt-scan-result', result && result.status)} style={v ? { borderColor: v.c } : undefined}>
          {!result ? (
            <div className="empty">{busy ? <span className="spinner" /> : <ShieldCheck />}<div className="small muted">{busy ? 'Checking…' : 'Your result will appear here.'}</div></div>
          ) : (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }} role="status">
              <span className="pt-scan-badge" style={{ background: `color-mix(in srgb, ${v.c} 15%, transparent)`, color: v.c }}><v.icon size={34} /></span>
              <h3 className="mb-0" style={{ color: v.c }}>{v.label}</h3>
              {result.drug && <div className="strong" translate="no">{result.drug}{result.batch ? ` · ${result.batch}` : ''}</div>}
              {result.status === 'genuine' && <p className="small mb-0">A chemist on Nexus Healthcare has listed this batch in its stock. Expires {fmtDate(result.expiry)}.</p>}
              {result.status === 'expired' && <p className="small mb-0">This batch expired on {fmtDate(result.expiry)}. Please don&apos;t use it — take it back to the chemist.</p>}
              {result.status === 'recall' && <p className="small mb-0">{result.message}</p>}
              {result.status === 'unknown' && <p className="small mb-0">We couldn&apos;t find this batch in the stock listed by chemists on Nexus Healthcare. That doesn&apos;t mean it&apos;s fake — check the code, or ask your pharmacist.</p>}
              {result.status === 'invalid' && <p className="small mb-0">{result.message}</p>}
              {read && (
                <p className="tiny muted mb-0" translate="no">
                  Read from the pack: {read.batch ? `Batch ${read.batch}` : ''}{read.expiry ? ` · Expiry ${fmtDate(read.expiry)}` : ''}{read.serial ? ` · Serial ${read.serial}` : ''}
                </p>
              )}
              {result.status === 'genuine' && <div className="row tiny" style={{ color: 'var(--green-2)', gap: 6 }}><CheckCircle2 size={14} /> Matched against Nexus Healthcare chemist stock</div>}
              <Button variant="ghost" size="sm" icon={camera ? Camera : undefined} onClick={() => { setResult(null); setCode(''); setRead(null); if (camera) setScanning(true); }}>Scan another</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
