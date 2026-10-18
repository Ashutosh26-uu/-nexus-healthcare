import { useEffect, useState } from 'react';
import { Store, MapPin, Clock, Check, ChevronDown, Truck, BadgeIndianRupee, Phone, AlertTriangle } from 'lucide-react';
import { api } from '../../api';
import { fmtMoney, cx } from '../../components/ui';
import { useDeviceLocation, LocationButton } from './NearbyDoctors';

// Every nearby chemist that has the prescription's medicines — what each costs there, and the total.
export default function WhereToBuy({ rx, selectable, value, onChange, onLoaded }) {
  const device = useDeviceLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const lat = device.loc?.lat;
  const lng = device.loc?.lng;
  useEffect(() => {
    if (!rx) return undefined;
    let alive = true;
    setError('');
    const qs = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '';
    api.get(`/prescriptions/${rx.id}/pharmacies${qs}`).then((r) => {
      if (!alive) return;
      setData(r); onLoaded?.(r);
      if (selectable && !value && r.shops[0]) onChange?.(r.shops[0].id);
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rx?.id, lat, lng]);

  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <div className="stack">{[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />)}</div>;

  return (
    <div className="pt-wtb">
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="tiny muted">Prices for the full course: {data.items.map((i) => `${i.drug} × ${i.units} ${i.unit}${i.units > 1 ? 's' : ''}`).join(' · ')}</span>
        <LocationButton device={device} />
      </div>
      {data.shops.length === 0 && (
        <div className="callout"><AlertTriangle /><span>No chemist within {data.radiusKm} km has these right now{data.fartherCount ? ` (${data.fartherCount} farther away do)` : ''}. Ask your doctor about an alternative, or check again later — chemists update their stock through the day.</span></div>
      )}
      {data.shops.length > 0 && <span className="tiny muted">Showing chemists within {data.radiusKm} km of you that have your medicines.</span>}
      <div className="pt-wtb-list" role={selectable ? 'radiogroup' : undefined}>
        {data.shops.map((s) => {
          const on = selectable && value === s.id;
          const Tag = selectable ? 'button' : 'div';
          return (
            <div key={s.id} className={cx('pt-wtb-shop', on && 'on', !s.complete && 'partial')}>
              <Tag type={selectable ? 'button' : undefined} className="pt-wtb-head" role={selectable ? 'radio' : undefined} aria-checked={selectable ? on : undefined} onClick={selectable ? () => onChange(s.id) : undefined}>
                {selectable && <span className="pt-radio" aria-hidden="true">{on && <Check size={12} strokeWidth={3} />}</span>}
                <span className="pt-wtb-ic"><Store size={16} /></span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="strong block" translate="no">{s.name}</span>
                  <span className="tiny muted pt-wtb-meta">
                    {s.distanceKm !== null && <span><MapPin size={12} /> {s.distanceKm} km</span>}
                    {s.hours && <span><Clock size={12} /> {s.hours}</span>}
                    {s.phone && <span><Phone size={12} /> <bdi dir="ltr">{s.phone}</bdi></span>}
                  </span>
                  <span className="pt-wtb-tags">
                    {data.cheapestId === s.id && <span className="badge green">Cheapest</span>}
                    {data.nearestId === s.id && <span className="badge sky">Nearest</span>}
                    {s.generic && <span className="badge clay">Generic · Jan Aushadhi</span>}
                    {s.delivery && <span className="badge"><Truck size={11} /> Delivers</span>}
                    {s.complete ? <span className="badge green"><Check size={11} /> All {s.totalItems} medicines</span> : <span className="badge sun">{s.availableCount} of {s.totalItems} medicines</span>}
                  </span>
                </span>
                <span className="pt-wtb-price">
                  <strong>{s.priced ? fmtMoney(s.total) : 'Ask at counter'}</strong>
                  <span className="tiny muted">{s.complete ? 'total' : 'for what they have'}</span>
                </span>
              </Tag>
              <button type="button" className="pt-wtb-more tiny" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                Price per medicine <ChevronDown size={13} style={{ transform: open === s.id ? 'rotate(180deg)' : 'none' }} />
              </button>
              {open === s.id && (
                <table className="pt-wtb-table small">
                  <tbody>
                    {s.items.map((i) => (
                      <tr key={i.drug} className={cx(!i.inStock && 'muted')}>
                        <td translate="no">{i.drug}</td>
                        <td>{i.units} {i.unit}{i.units > 1 ? 's' : ''}{i.unitPrice !== null ? ` × ₹${i.unitPrice}` : ''}</td>
                        <td className="right">{i.inStock ? (i.lineTotal !== null ? fmtMoney(i.lineTotal) : 'Ask') : i.partial ? `Only ${i.available} left` : 'Not in stock'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
      <p className="tiny muted mb-0"><BadgeIndianRupee size={12} style={{ verticalAlign: '-2px' }} /> Indicative prices for the full course. You pay the chemist directly — cash or UPI.</p>
    </div>
  );
}
