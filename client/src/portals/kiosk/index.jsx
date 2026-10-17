import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { Volume2, VolumeX, LogOut, Wifi, WifiOff, Languages, LayoutGrid, UserRound, Stethoscope, X } from 'lucide-react';

import { LogoMark } from '../../components/Logo';
import { useAuth } from '../../auth';
import { useLive } from '../../live';
import { cx } from '../../components/ui';
import { KioskCtx, initialFlow, loadFlow, saveFlow, speak, stopSpeaking, voiceFor } from './context';
import { LANGS, langOf, makeT, hasFullCopy } from './i18n';
import Flow from './Flow';
import Operator from './Operator';
import './kiosk.css';
import { getLocale, useI18n, tr } from '../../i18n';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="k-clock">
      <strong>{now.toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })}</strong>
      <span>{now.toLocaleDateString(getLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
    </span>
  );
}

function LangMenu({ lang, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="k-langmenu">
      <button className="k-topbtn" onClick={() => setOpen((v) => !v)} aria-label="Change language">
        <Languages /><span translate="no">{langOf(lang).native}</span>
      </button>
      {open && (
        <>
          <div className="k-langmenu-scrim" onClick={() => setOpen(false)} />
          <div className="k-langmenu-pop">
            {LANGS.map((l) => (
              <button key={l.code} className={cx(l.code === lang && 'on')} onClick={() => { onPick(l.code); setOpen(false); }}>
                <span translate="no">{l.native}</span><small>{l.name}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Green pop-up when an E-Clinic partner doctor checks in at THIS clinic (and once on open).
function DoctorHerePopup({ doctors }) {
  const seen = useRef(null);
  const [show, setShow] = useState(null);
  useEffect(() => {
    if (!doctors) return undefined;
    const here = doctors.filter((d) => d.here);
    const prev = seen.current;
    seen.current = new Set(here.map((d) => d.id));
    const fresh = prev ? here.filter((d) => !prev.has(d.id)) : here;
    if (!fresh.length) return undefined;
    setShow(fresh[0]);
    const t = setTimeout(() => setShow(null), 9000);
    return () => clearTimeout(t);
  }, [doctors]);
  if (!show) return null;
  return (
    <div className="avail-toast" role="status">
      <Stethoscope />
      <div>
        <strong translate="no">{show.name} is available</strong>
        <span>{show.specialty} · at this E-Clinic now</span>
      </div>
      <button type="button" onClick={() => setShow(null)} aria-label="Close"><X size={15} /></button>
    </div>
  );
}

export default function KioskApp() {
  const { user, facility, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const home = useLive('/kiosk/home', ['queue', 'consults', 'kiosks', 'prescriptions'], [], { cache: false }); // public device: nothing kept between patients
  const [flow, setFlowState] = useState(loadFlow);
  const [lang, setLangState] = useState(() => { try { return localStorage.getItem('oc_kiosk_lang') || 'hi'; } catch { return 'hi'; } });
  const [voiceOn, setVoiceOn] = useState(() => { try { return localStorage.getItem('oc_kiosk_voice') !== 'off'; } catch { return true; } });
  const [, setVoicesReady] = useState(0);

  useEffect(() => { saveFlow(flow); }, [flow]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    const onVoices = () => setVoicesReady((n) => n + 1);
    synth.addEventListener?.('voiceschanged', onVoices);
    return () => { synth.removeEventListener?.('voiceschanged', onVoices); synth.cancel(); };
  }, []);

  const t = useMemo(() => makeT(lang), [lang]);
  const tEn = useMemo(() => makeT('en'), []);

  const { setLang: setAppLang } = useI18n();
  const setLang = useCallback((code) => {
    setLangState(code);
    setAppLang(code); // the DOM translator then covers the English fallback copy
    try { localStorage.setItem('oc_kiosk_lang', code); } catch { /* ignore */ }
  }, [setAppLang]);
  // Keep the app language in step with the kiosk's saved language.
  useEffect(() => { setAppLang(lang); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVoice = () => {
    setVoiceOn((v) => {
      const next = !v;
      try { localStorage.setItem('oc_kiosk_voice', next ? 'on' : 'off'); } catch { /* ignore */ }
      if (!next) stopSpeaking();
      return next;
    });
  };

  // Speak a copy key (or raw text) in the chosen language; fall back to Indian English if the device has no voice for it.
  const say = useCallback((keyOrText, opts = {}) => {
    if (!voiceOn) return;
    const L = langOf(opts.lang || lang);
    const isKey = /^[a-z_]+$/.test(keyOrText);
    const english = isKey ? tEn(keyOrText, opts.vars) : keyOrText;
    let text = isKey ? makeT(L.code)(keyOrText, opts.vars) : keyOrText;
    // Languages without full kiosk copy fall back to English — translate it before speaking.
    if (!hasFullCopy(L.code)) text = tr(text);
    const untranslated = L.code !== 'en' && text === english && /[A-Za-z]/.test(text);
    const voiceLang = voiceFor(L.speech) ? L.speech : (L.alt && voiceFor(L.alt) ? L.alt : null);
    if (L.code === 'en' || (voiceLang && !untranslated)) speak(text, voiceLang || L.speech);
    else speak(english, 'en-IN');
  }, [voiceOn, lang, tEn]);

  const setFlow = useCallback((patch) => setFlowState((f) => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) })), []);
  const goto = useCallback((step) => setFlowState((f) => ({ ...f, step })), []);
  const reset = useCallback(() => { stopSpeaking(); setFlowState(initialFlow()); }, []);

  const kiosk = home.data?.kiosk || facility;
  const offline = kiosk?.status === 'offline';
  const onOperator = location.pathname.startsWith('/kiosk/operator');

  const value = { home, kiosk, offline, flow, setFlow, goto, reset, lang, setLang, t, say, voiceOn, user };

  return (
    <KioskCtx.Provider value={value}>
      <div className={cx('kiosk-app', langOf(lang).rtl && 'rtl')} lang={langOf(lang).speech}>
        <header className="k-top">
          <div className="k-brand">
            <LogoMark size={34} />
            <div>
              <strong>{kiosk?.name || 'E-Clinic'}</strong>
              <span>Nexus Healthcare E-Clinic · {kiosk?.district || ''}</span>
            </div>
          </div>
          <span className={cx('k-status', offline ? 'off' : 'on')}>
            {offline ? <WifiOff /> : <Wifi />}{offline ? 'Offline' : 'Online'}
          </span>
          <div className="k-top-right">
            <span className="k-operator"><UserRound />{user?.name?.replace(' (ASHA)', '')}<small>ASHA operator</small></span>
            <Clock />
            <LangMenu lang={lang} onPick={setLang} />
            <button className={cx('k-topbtn icon', !voiceOn && 'muted')} onClick={toggleVoice} aria-label={voiceOn ? 'Turn voice guidance off' : 'Turn voice guidance on'} title="Voice guidance">
              {voiceOn ? <Volume2 /> : <VolumeX />}
            </button>
            <Link to={onOperator ? '/kiosk' : '/kiosk/operator'} className={cx('k-topbtn', onOperator && 'active')}>
              <LayoutGrid /><span>{onOperator ? 'Patient screen' : 'Operator'}</span>
            </Link>
            <button className="k-topbtn icon" onClick={() => { stopSpeaking(); signOut(); navigate('/'); }} aria-label="Sign out" title="Sign out"><LogOut /></button>
          </div>
        </header>
        {offline && <div className="k-offline">{t('offline')}</div>}
        <DoctorHerePopup doctors={home.data?.doctors} />
        <main className="k-main">
          <Routes>
            <Route index element={<Flow />} />
            <Route path="operator" element={<Operator />} />
            <Route path="*" element={<Navigate to="/kiosk" replace />} />
          </Routes>
        </main>
      </div>
    </KioskCtx.Provider>
  );
}
