import { useState } from 'react';
import { BookOpenText, MessageCircleQuestion, Volume2, Square } from 'lucide-react';
import { cx } from '../../components/ui';
import { speak, speakSupported, stopSpeaking } from '../../components/speech';
import { isAbnormal } from './shared';

// "Read my report": every test in plain words — what it measures, what an out-of-range value usually means —
// and the questions worth asking the doctor. Written from the report itself on our own server: no AI, nothing
// about the report leaves Sehatra. Listen reads it aloud for anyone who finds reading hard.
export default function ReportGuide({ results = [], insights = [], questions = [] }) {
  const [speaking, setSpeaking] = useState(false);
  if (!results.length) return null;
  const meaningOf = (r) => insights.find((x) => x.test === r.name)?.text || null;
  const allOk = !results.some(isAbnormal);

  const script = () => [
    allOk ? 'All your results are within the normal range.' : null,
    ...results.filter(isAbnormal).map((r) => meaningOf(r) || `${r.name} is outside the normal range.`),
    questions.length ? `Questions to ask your doctor: ${questions.join(' ')}` : null,
  ].filter(Boolean).join(' ');
  const listen = () => {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    const ok = speak(script(), 'en-IN', { onEnd: () => setSpeaking(false) });
    setSpeaking(ok);
  };

  return (
    <section className="pt-rg" aria-label="What this report means">
      <div className="pt-rg-head">
        <strong className="row" style={{ gap: 8 }}><BookOpenText size={18} /> What this report means</strong>
        {speakSupported() && (
          <button type="button" className={cx('msg-speak', speaking && 'on')} onClick={listen}>
            {speaking ? <><Square size={11} /> Stop</> : <><Volume2 size={14} /> Listen</>}
          </button>
        )}
      </div>
      {allOk && <p className="small pt-rg-ok mb-0">All your results are within the normal range.</p>}
      <ul className="pt-rg-list">
        {results.map((r) => {
          const off = isAbnormal(r);
          const meaning = off ? meaningOf(r) : null;
          return (
            <li key={r.name} className={cx(off && 'off')}>
              <div className="pt-rg-line">
                <span className="strong">{r.name}</span>
                <span translate="no" dir="ltr"><strong>{r.value}</strong> {r.unit}</span>
                <span className={cx('badge', off ? (r.flag === 'critical' ? 'solid-rose' : 'clay') : 'green')}>{off ? (r.flag === 'low' ? 'Low' : r.flag === 'critical' ? 'Critical' : r.flag === 'positive' ? 'Positive' : 'High') : 'Normal'}</span>
              </div>
              {r.range && <div className="tiny muted" translate="no" dir="ltr">Normal: {r.range}</div>}
              {r.about && <div className="tiny muted">{r.about}</div>}
              {meaning && <div className="small pt-rg-meaning">{meaning}</div>}
            </li>
          );
        })}
      </ul>
      {questions.length > 0 && (
        <div className="pt-rg-q">
          <strong className="small row" style={{ gap: 6 }}><MessageCircleQuestion size={16} /> Ask your doctor</strong>
          <ol>{questions.map((q) => <li key={q} className="small">{q}</li>)}</ol>
        </div>
      )}
      <p className="tiny muted mb-0">General guidance, not a diagnosis — only your doctor can say what these results mean for you.</p>
    </section>
  );
}
