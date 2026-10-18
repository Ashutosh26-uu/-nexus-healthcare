import { useEffect } from 'react';
import { Store, MapPin, Clock, Phone, Check, RotateCcw, Pill, Ticket, Smartphone } from 'lucide-react';
import { useLive } from '../../live';
import { cx } from '../../components/ui';
import { useKiosk } from './context';
import { KButton, StepFrame } from './KUi';

export default function StepPickup() {
  const { t, say, flow, reset, home } = useKiosk();
  const { data: c } = useLive(flow.consultId ? `/consults/${flow.consultId}` : null, ['prescriptions', 'pharmacy', `consult:${flow.consultId}`]);
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
      sub={rx ? (rx.pharmacyId ? 'Your prescription has already been sent. Show the token or your Health Passport at the counter.' : 'Show the token or your Health Passport at any pharmacy below.') : 'No medicines were prescribed this time.'}
      wide
      actions={<KButton icon={RotateCcw} className="xl" onClick={reset}>{t('finish')}</KButton>}
    >
      <div className="k-pickup">
        {rx ? (
          <div className="k-sent">
            <div className="k-sent-head">
              <span className="k-sent-icon"><Store /></span>
              <div className="grow">
                <small>{rx.pharmacyId ? 'Prescription sent to' : 'Prescription ready'}</small>
                <strong translate={chosen ? 'no' : undefined}>{chosen?.name || (rx.pharmacyId ? 'The pharmacy the doctor chose' : 'Collect from any pharmacy')}</strong>
                {chosen && (
                  <span>
                    {chosen.distanceKm != null && <><MapPin size={15} /> {chosen.distanceKm} km · </>}
                    {chosen.hours && <><Clock size={15} /> {chosen.hours} </>}
                    {chosen.phone && <><Phone size={15} /> <bdi dir="ltr">{chosen.phone}</bdi></>}
                  </span>
                )}
              </div>
              <div className="k-token"><Ticket /><small>Token</small><strong>{token}</strong></div>
            </div>
            <div className="k-sent-items">
              {rx.items.map((i) => (
                <div key={i.drug} className="k-sent-item"><Pill /><span className="grow"><b translate="no">{i.drug}</b> · {i.freq}</span><span className="k-ready"><Check size={15} />On the prescription</span></div>
              ))}
            </div>
            <p className="k-fine"><Smartphone size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> The same prescription is in the patient's Health Passport. If a medicine runs out, the pharmacist can request it from a nearby store.</p>
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
                <span>{[p.hours, p.address].filter(Boolean).join(' · ')}{p.phone && <> · <bdi dir="ltr">{p.phone}</bdi></>}</span>
              </div>
              {p.distanceKm != null && <span className="k-km">{p.distanceKm} km</span>}
            </div>
          ))}
        </div>
      </div>
    </StepFrame>
  );
}
