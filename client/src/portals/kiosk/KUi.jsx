import { ArrowLeft } from 'lucide-react';
import { cx } from '../../components/ui';
import { useKiosk } from './context';

export function KButton({ variant = 'primary', icon: Icon, children, loading, className, disabled, ...rest }) {
  // `disabled` after the spread: a caller's disabled={false} must not re-enable a button mid-request (double submit).
  return (
    <button className={cx('k-btn', variant, className)} {...rest} disabled={loading || disabled}>
      {loading ? <span className="k-spin" /> : Icon ? <Icon /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}

export function StepFrame({ title, sub, children, onBack, actions, wide, aside }) {
  const { t } = useKiosk();
  return (
    <section className={cx('k-panel', wide && 'wide')}>
      <div className="k-panel-head">
        <div>
          <h1 className="k-title">{title}</h1>
          {sub && <p className="k-sub">{sub}</p>}
        </div>
        {aside}
      </div>
      <div className="k-panel-body">{children}</div>
      {(onBack || actions) && (
        <div className="k-actions">
          {onBack ? <KButton variant="ghost" icon={ArrowLeft} onClick={onBack}>{t('back')}</KButton> : <span />}
          <div className="k-actions-right">{actions}</div>
        </div>
      )}
    </section>
  );
}

export function KError({ children }) {
  if (!children) return null;
  return <div className="k-error" role="alert">{children}</div>;
}
