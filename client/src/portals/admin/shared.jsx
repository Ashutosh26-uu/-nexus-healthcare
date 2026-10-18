import { ROLE_LABEL } from '../../auth';
import { Empty, Button, Loading } from '../../components/ui';

export const ROLE_TONE = {
  patient: '', caregiver: '', kiosk_operator: 'sun', doctor: 'green', hospital_admin: 'sky', lab_tech: 'plum',
  pharmacist: 'clay', distributor: 'clay', delivery: '', official: 'rose', super_admin: 'solid-ink',
};
export function RoleBadge({ role }) {
  return <span className={`badge ${ROLE_TONE[role] || ''}`}>{ROLE_LABEL[role] || role}</span>;
}

/* Common loading / error wrapper for useLive results. */
export function LiveGate({ live, children }) {
  if (live.loading && !live.data) return <Loading />;
  if (live.error && !live.data) {
    return (
      <Empty title="Couldn't load this section">
        <p>{live.error}</p>
        <Button size="sm" variant="secondary" onClick={live.reload}>Try again</Button>
      </Empty>
    );
  }
  return children(live.data);
}

export const FACILITY_LABEL = { hospital: 'Hospital', lab: 'Lab', pharmacy: 'Pharmacy', kiosk: 'Kiosk', warehouse: 'Warehouse' };
