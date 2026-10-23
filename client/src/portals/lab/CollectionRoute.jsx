import { Route as RouteIcon } from 'lucide-react';
import { useLive } from '../../live';
import RouteStops from '../../components/RouteStops';

// Today's home collections in driving order from the lab, so a technician makes one loop instead of zig-zagging.
export default function CollectionRoute() {
  const { data } = useLive('/lab/collection-route', ['lab']);
  const stops = data?.stops || [];
  if (stops.length < 2) return null;
  const view = stops.map((s) => ({
    key: s.orderId, label: s.patientName || 'Patient', tag: s.status === 'on_the_way' ? 'On the way' : null,
    sub: [s.address, s.tests.slice(0, 3).join(', '), s.collector].filter(Boolean).join(' · '), legKm: s.legKm, etaMin: s.etaMin, hasLocation: s.hasLocation,
  }));
  return (
    <section className="card" aria-label="Today's collection route">
      <h3 className="row mt-0" style={{ gap: 8 }}><RouteIcon size={18} /> Today's home collections — best order</h3>
      <p className="small muted mt-0">Starting from the lab, nearest next. Tap a visit's “On the way” as usual — the patient is told.</p>
      <RouteStops stops={view} totalKm={data.totalKm} totalMin={data.totalMin} mapsUrl={data.mapsUrl} />
    </section>
  );
}
