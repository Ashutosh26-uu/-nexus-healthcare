import { useEffect, useRef, useState } from 'react';
import { Sparkles, Mic, Square, FileText, Check, Trash2, ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { Button, useAction, cx } from '../../components/ui';

// Ambient scribe: listen to the consultation (with the patient's consent), keep an editable transcript, then
// draft a SOAP note, codes and medicines the doctor reviews and drops into the prescription. Nexus stores
// neither audio nor transcript; the server returns a draft and keeps only an audit line that one was made.
const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const LANGS = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ar-AE', label: 'Arabic (Gulf)' },
  { value: 'ar-EG', label: 'Arabic (Egypt)' },
  { value: 'he-IL', label: 'Hebrew' },
  { value: 'en-US', label: 'English (US)' },
];
const SECTIONS = [['subjective', 'S · Subjective'], ['objective', 'O · Objective'], ['assessment', 'A · Assessment'], ['plan', 'P · Plan']];
const MIN_CHARS = 20;

export default function AmbientScribe({ consultId, onUse }) {
  const [consent, setConsent] = useState(false);
  const [lang, setLang] = useState(() => (navigator.language?.startsWith('ar') ? 'ar-AE' : navigator.language?.startsWith('hi') ? 'hi-IN' : 'en-IN'));
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [micError, setMicError] = useState('');
  const [draft, setDraft] = useState(null);
  const [pick, setPick] = useState({});
  const [run, busy] = useAction();
  const rec = useRef(null);
  const wantOn = useRef(false);
  const restarts = useRef(0); // a mic that ends at once (offline, held by another app) must not restart forever

  useEffect(() => () => { wantOn.current = false; rec.current?.abort?.(); }, []);

  const startRec = () => {
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    const sent = new Set(); // Android repeats final results within a session — add each one once
    r.onresult = (e) => {
      let finals = '';
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { if (!sent.has(i)) { sent.add(i); finals += `${t.trim()}. `; } } else live += t;
      }
      restarts.current = 0;
      if (finals) setTranscript((x) => `${x}${x && !x.endsWith(' ') ? ' ' : ''}${finals}`);
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted' || e.error === 'network') return;
      wantOn.current = false;
      setMicError(e.error === 'not-allowed' ? 'Allow the microphone for this site to record.' : 'The microphone stopped. Tap Listen to carry on.');
    };
    // Browsers end recognition after a pause; keep going until the doctor taps Stop.
    r.onend = () => {
      setInterim('');
      if (wantOn.current && restarts.current < 50) { restarts.current += 1; try { startRec(); return; } catch { /* fall through */ } }
      if (wantOn.current) { wantOn.current = false; setMicError('The microphone keeps stopping — check your connection, then tap Listen again.'); }
      setListening(false);
    };
    rec.current = r;
    r.start();
  };

  const listen = () => {
    setMicError('');
    restarts.current = 0;
    try { wantOn.current = true; startRec(); setListening(true); } catch { wantOn.current = false; setListening(false); setMicError('Could not start the microphone.'); }
  };
  const stop = () => { wantOn.current = false; rec.current?.stop?.(); setListening(false); };

  const makeDraft = () => run('draft', async () => {
    if (listening) stop();
    const r = await api.post(`/consults/${consultId}/scribe`, { transcript: transcript.trim(), patientConsent: consent });
    setDraft(r);
    setPick(Object.fromEntries((r.medicines || []).map((m) => [m.drug, true])));
  });

  const starter = () => run('starter', async () => {
    const r = await api.post(`/consults/${consultId}/scribe`, {});
    onUse({ notes: r.draft });
  });

  const setSection = (k, v) => setDraft((d) => ({ ...d, soap: { ...d.soap, [k]: v } }));

  const use = () => {
    const soap = SECTIONS.map(([k, label]) => (draft.soap?.[k] ? `${label.split(' · ')[0]}: ${draft.soap[k]}` : '')).filter(Boolean).join('\n');
    const codes = (draft.codes || []).length ? `\nCodes (to confirm): ${draft.codes.map((c) => `${c.code} ${c.label}`).join('; ')}` : '';
    onUse({ notes: `${soap}${codes}`, diagnosis: draft.diagnosis, medicines: (draft.medicines || []).filter((m) => pick[m.drug]) });
    // Nothing from the consultation lingers in the browser once it's in the prescription.
    setDraft(null); setTranscript(''); setInterim('');
  };

  const discard = () => { stop(); setDraft(null); setTranscript(''); setInterim(''); };

  return (
    <div className="dr-scribe dr-scribe-full">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <Sparkles size={16} className="dr-scribe-ic" />
          <span className="small"><strong>Scribe</strong> — listen to the consultation, then draft the note and prescription.</span>
        </div>
        {!transcript && !draft && <Button size="sm" variant="ghost" loading={busy === 'starter'} onClick={starter}>Use triage note starter</Button>}
      </div>

      {!draft && (
        <>
          <label className="check small mt-1">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={listening} />
            The patient agreed to this consultation being transcribed
          </label>
          <div className="row wrap mt-1" style={{ gap: 8 }}>
            {Recognition ? (
              listening
                ? <Button size="sm" variant="clay" icon={Square} onClick={stop}>Stop</Button>
                : <Button size="sm" icon={Mic} disabled={!consent} onClick={listen}>{transcript ? 'Listen again' : 'Listen'}</Button>
            ) : <span className="tiny muted">This browser can’t transcribe speech — type or paste the conversation below (Chrome and Edge can).</span>}
            {Recognition && (
              <select className="select" style={{ width: 'auto', minHeight: 34 }} value={lang} onChange={(e) => setLang(e.target.value)} disabled={listening} aria-label="Spoken language">
                {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            )}
            {listening && <span className="tiny row" style={{ gap: 6, color: 'var(--rose)' }}><span className="dot rose pulse" /> Listening</span>}
          </div>
          {micError && <div className="form-error mt-1">{micError}</div>}
          <textarea className="textarea mt-1" rows={4} value={transcript} onChange={(e) => setTranscript(e.target.value)}
            placeholder={consent ? 'The conversation appears here as it’s heard. You can correct it, or type and paste.' : 'Tick the consent box to start listening — or type the key points here.'} />
          {interim && <p className="tiny muted mb-0" aria-live="polite">… {interim}</p>}
          <div className="row between wrap mt-1" style={{ gap: 8 }}>
            <span className="tiny muted"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> Nexus never stores the audio or the transcript. Speech-to-text runs in your browser (in Chrome, Google’s speech service).</span>
            <div className="row" style={{ gap: 8 }}>
              {transcript && <Button size="sm" variant="ghost" icon={Trash2} onClick={discard}>Clear</Button>}
              <Button size="sm" icon={FileText} loading={busy === 'draft'} disabled={transcript.trim().length < MIN_CHARS} onClick={makeDraft}>Draft note</Button>
            </div>
          </div>
        </>
      )}

      {draft && (
        <div className="stack mt-1" style={{ gap: 10 }}>
          <p className="tiny muted mb-0">{draft.note}</p>
          {SECTIONS.map(([k, label]) => (
            <label key={k} className="stack" style={{ gap: 4 }}>
              <span className="tiny" style={{ fontWeight: 700 }}>{label}</span>
              <textarea className="textarea" rows={2} value={draft.soap?.[k] || ''} onChange={(e) => setSection(k, e.target.value)} placeholder="Nothing heard for this part" />
            </label>
          ))}
          <label className="stack" style={{ gap: 4 }}>
            <span className="tiny" style={{ fontWeight: 700 }}>Working diagnosis</span>
            <input className="input" value={draft.diagnosis || ''} onChange={(e) => setDraft((d) => ({ ...d, diagnosis: e.target.value }))} placeholder="As you stated it" />
          </label>
          {(draft.codes || []).length > 0 && (
            <div>
              <span className="tiny" style={{ fontWeight: 700 }}>Suggested ICD-10 codes — confirm before use</span>
              <div className="row wrap mt-1" style={{ gap: 6 }}>
                {draft.codes.map((c) => <span key={c.code} className="badge" title={c.label} translate="no">{c.code} · {c.label}</span>)}
              </div>
            </div>
          )}
          {(draft.medicines || []).length > 0 && (
            <div>
              <span className="tiny" style={{ fontWeight: 700 }}>Medicines heard — tick the ones to add</span>
              <div className="stack mt-1" style={{ gap: 6 }}>
                {draft.medicines.map((m) => (
                  <label key={m.drug} className={cx('check small dr-scribe-med', pick[m.drug] && 'on')}>
                    <input type="checkbox" checked={!!pick[m.drug]} onChange={(e) => setPick((p) => ({ ...p, [m.drug]: e.target.checked }))} />
                    <span><strong translate="no">{m.drug}</strong> · {m.dose || '1 tablet'}{m.freq ? ` · ${m.freq}` : ''}{m.days ? ` · ${m.days} days` : ''}{m.food ? ` · ${m.food}` : ''}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="row between wrap" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Back to transcript</Button>
            <Button size="sm" icon={Check} onClick={use}>Use in prescription</Button>
          </div>
        </div>
      )}
    </div>
  );
}
