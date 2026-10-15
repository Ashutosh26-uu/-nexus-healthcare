import { Check } from 'lucide-react';
import { cx } from '../../components/ui';
import { useKiosk } from './context';
import StepWelcome from './StepWelcome';
import StepIdentify from './StepIdentify';
import StepVitals from './StepVitals';
import StepTriage from './StepTriage';
import StepConsult from './StepConsult';
import StepPay from './StepPay';
import StepPickup from './StepPickup';

const STEPS = [StepWelcome, StepIdentify, StepVitals, StepTriage, StepConsult, StepPay, StepPickup];

function Stepper({ step, t, patient }) {
  const labels = t('steps');
  return (
    <div className="k-stepper" aria-label="Progress">
      {labels.map((l, i) => (
        <div key={l} className={cx('k-step', i < step && 'done', i === step && 'now')}>
          <span className="k-step-dot">{i < step ? <Check /> : i + 1}</span>
          <span className="k-step-l">{l}</span>
        </div>
      ))}
      {patient && <div className="k-step-patient"><span>{patient.name}</span><small>{patient.id}</small></div>}
    </div>
  );
}

export default function Flow() {
  const { flow, t } = useKiosk();
  const Step = STEPS[flow.step] || StepWelcome;
  return (
    <div className="k-flow">
      <Stepper step={flow.step} t={t} patient={flow.step > 1 ? flow.patient : null} />
      <div className="k-stage" key={flow.step}>
        <Step />
      </div>
    </div>
  );
}
