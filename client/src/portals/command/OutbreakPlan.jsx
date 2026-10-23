import { useState } from 'react';
import { ClipboardCheck, Truck, Megaphone, Check } from 'lucide-react';
import { Button, cx, fmtNum, useAction } from '../../components/ui';
import { useLive } from '../../live';
import { api } from '../../api';
import { StockMoveModal } from './Supply';

// For a confirmed or open outbreak: what the district's pharmacies, labs and hospitals have on the shelf for this
// disease, where it falls short, and a ready advisory draft. Nothing goes out until the official sends it.
export default function OutbreakPlan({ alert }) {
  const { data } = useLive(alert ? `/gov/alerts/${alert.id}/plan` : null, ['gov', 'supply', 'pharmacy']);
  const [move, setMove] = useState(null);
  const [saved, setSaved] = useState(false);
  const [run, busy] = useAction();
  if (!data || data.alertId !== alert?.id) return null;
  const saveDraft = async () => {
    const r = await run('adv', () => api.post('/advisories', { ...data.advisory, publish: false }), 'Advisory saved as a draft — review and publish it under Actions');
    if (r) setSaved(true);
  };
  return (
    <div className="mt-3">
      <h4 className="mb-1 row" style={{ gap: 8 }}><ClipboardCheck size={17} /> Action plan for {data.district}</h4>
      <p className="tiny muted mt-0">What the district's stores have on the shelf for this outbreak, against a minimum per store.</p>
      <div className="stack" style={{ gap: 6 }}>
        {data.supply.map((s) => (
          <div key={s.item} className="row wrap" style={{ gap: 8 }}>
            <span className="small grow" translate="no"><strong>{s.item}</strong> · {fmtNum(s.total)} at {s.sites} site{s.sites === 1 ? '' : 's'}</span>
            {s.short > 0
              ? <><span className={cx('badge', 'rose')}>Short ~{fmtNum(s.short)}</span><Button size="sm" variant="secondary" icon={Truck} onClick={() => setMove({ drug: s.item })}>Move stock</Button></>
              : <span className="badge green">Enough</span>}
          </div>
        ))}
      </div>
      {data.gaps.length > 0 && (
        <details className="mt-2">
          <summary className="small">Sites below the minimum ({data.gaps.length})</summary>
          <ul className="tiny muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {data.gaps.map((g, i) => <li key={i}><span translate="no">{g.facility}</span> — {g.item}: {fmtNum(g.qty)} (needs {fmtNum(g.needed)} more)</li>)}
          </ul>
        </details>
      )}
      <div className="callout sky small mt-2" style={{ whiteSpace: 'pre-line' }}><Megaphone /><span><strong>{data.advisory.title}</strong>{'\n'}{data.advisory.body}</span></div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        {saved ? <span className="badge green"><Check /> Draft saved</span>
          : <Button size="sm" variant="secondary" icon={Megaphone} loading={busy === 'adv'} onClick={saveDraft}>Save advisory as draft</Button>}
      </div>
      {move && <StockMoveModal open onClose={() => setMove(null)} drug={move.drug} />}
    </div>
  );
}
