import { useEffect } from 'react';
import { Store, MapPin, Clock, Phone, Check, RotateCcw, Pill, Ticket, Smartphone } from 'lucide-react';
import { useLive } from '../../live';
import { cx } from '../../components/ui';
import { useKiosk } from './context';
import { KButton, StepFrame } from './KUi';

export default function StepPickup() {
  const { t, say, flow, reset, home } = useKiosk();
  const { data: c } = useLive(flow.consultId ? `/consults/${flow.consultId}` : null, ['prescriptions', 'pharmacy'], [], { cache: false });
  const pharmacies = (home.data?.pharmacies || []).slice().sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
  const rx = c?.prescription;
  const chosen = pharmacies.find((p) => p.id === rx?.pharmacyId);
  const token = rx ? `${rx.id.slice(-4).toUpperCase()}` : '—';

  useEffect(() => { say('pickup_title');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StepFrame
      title={t('pickup_title')}
      sub={rx ? 'Your prescription has already been sent. Show the token or your Health Passport at the counter.' : 'No medicines were prescribed this time.'}
      wide
      actions={<KButton icon={RotateCcw} className="xl" onClick={reset}>{t('finish')}</KButton>}
    >
      <div className="k-pickup">
        {rx ? (
          <div className="k-sent">
            <div className="k-sent-head">
              <span className="k-sent-icon"><Store /></span>
              <div className="grow">
                <small>Prescription sent to</small>
                <strong>{chosen?.name || 'Jan Aushadhi Kendra, Civil Lines'}</strong>
                <span><MapPin size={15} /> {chosen?.distanceKm ?? 1.2} km · <Clock size={15} /> {chosen?.hours || '8:00 – 21:00'} {chosen?.phone && <><Phone size={15} /> {chosen.phone}</>}</span>
              </div>
              <div className="k-token"><Ticket /><small>Token</small><strong>{token}</strong></div>
            </div>
            <div className="k-sent-items">
              {rx.items.map((i) => (
                <div key={i.drug} className="k-sent-item"><Pill /><span className="grow"><b translate="no">{i.drug}</b> · {i.freq}</span><span className="k-ready"><Check size={15} />Reserved</span></div>
              ))}
            </div>
            <p className="k-fine"><Smartphone size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> The same prescription is on the patient's phone. If a medicine runs out, the pharmacist can request it from a nearby store — the patient gets an SMS when it arrives.</p>
          </div>
        ) : (
          <div className="k-sent empty"><Check /> Nothing to collect. Rest well, and come back if you feel worse.</div>
        )}

        <div className="k-nearby">
          <h3>Other pharmacies nearby</h3>
          {pharmacies.length === 0 && <p className="k-fine">No other pharmacies listed for this district.</p>}
          {pharmacies.map((p) => (
            <div key={p.id} className={cx('k-pharm', p.id === rx?.pharmacyId && 'on')}>
              <Store />
              <div className="grow">
                <strong translate="no">{p.name}</strong>
                <span>{p.hours} · <bdi dir="ltr">{p.phone}</bdi></span>
              </div>
              <span className="k-km">{p.distanceKm} km</span>
            </div>
          ))}
        </div>
      </div>
    </StepFrame>
  );
}
