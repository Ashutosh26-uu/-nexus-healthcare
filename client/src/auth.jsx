import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, session, disconnectLive } from './api';
import { forgetKeys } from './e2e';

const AuthContext = createContext(null);

export const ROLE_HOME = {
  patient: '/patient',
  caregiver: '/patient',
  kiosk_operator: '/kiosk',
  doctor: '/doctor',
  hospital_admin: '/hospital',
  lab_tech: '/lab',
  pharmacist: '/pharmacy',
  distributor: '/supply',
  delivery: '/dispatch',
  official: '/command',
  super_admin: '/admin',
};

export const ROLE_LABEL = {
  patient: 'Patient',
  caregiver: 'Family caregiver',
  kiosk_operator: 'Kiosk operator',
  doctor: 'Doctor',
  hospital_admin: 'Hospital admin',
  lab_tech: 'Lab technician',
  pharmacist: 'Pharmacist',
  distributor: 'Distributor',
  delivery: 'Delivery partner',
  official: 'Health official',
  super_admin: 'Platform admin',
};

const SIGNED_OUT = { loading: false, unreachable: false, user: null, facility: null, doctor: null, profiles: [] };
const RETRY_MS = [3000, 10000, 30000]; // then every 60 s

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ...SIGNED_OUT, loading: Boolean(session.token) });
  const retry = useRef({ timer: null, attempt: 0 });

  const refresh = useCallback(async () => {
    clearTimeout(retry.current.timer);
    retry.current.timer = null;
    const token = session.token;
    if (!token) { retry.current.attempt = 0; setState(SIGNED_OUT); return null; }
    try {
      const me = await api.get('/auth/me');
      if (session.token !== token) return null; // signed out / in as someone else meanwhile
      retry.current.attempt = 0;
      setState({ ...SIGNED_OUT, ...me, profiles: me.profiles || [] });
      return me;
    } catch (e) {
      if (session.token !== token) return null;
      // Only a real 401 means the token is bad.
      if (e.status === 401) { session.token = null; retry.current.attempt = 0; setState(SIGNED_OUT); return null; }
      // Server restarting or a network blip: the token is probably fine, so keep whoever is signed in and
      // keep trying. With nobody loaded yet, stay on the spinner for two retries, then say what's happening
      // (App shows it) rather than bouncing a signed-in person to the login page.
      const n = retry.current.attempt++;
      retry.current.timer = setTimeout(refresh, RETRY_MS[n] ?? 60000);
      setState((s) => (s.user ? { ...s, loading: false } : { ...s, loading: n < 2, unreachable: n >= 2 }));
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
    // Back online → don't wait out the back-off.
    const onOnline = () => { if (retry.current.timer) refresh(); };
    window.addEventListener('online', onOnline);
    const r = retry.current;
    return () => { window.removeEventListener('online', onOnline); clearTimeout(r.timer); };
  }, [refresh]);

  const signIn = useCallback(async (token) => {
    session.token = token;
    session.profile = null;
    retry.current.attempt = 0;
    return refresh();
  }, [refresh]);

  const signOut = useCallback(() => {
    session.token = null;
    session.profile = null;
    clearTimeout(retry.current.timer);
    retry.current.timer = null;
    retry.current.attempt = 0;
    disconnectLive();
    forgetKeys(); // encrypted-chat keys on this device; the passphrase brings them back
    // Anything a shared device kept for this person goes too (kiosk visit in progress, lab signer pick, Saathi chat,
    // family and place picks) — on every sign-out, including an automatic one when the session expires.
    try { ['oc_kiosk_flow', 'nx_lab_signer', 'oc_chat', 'oc_relations', 'oc_pref_place'].forEach((k) => { sessionStorage.removeItem(k); localStorage.removeItem(k); }); } catch { /* storage blocked */ }
    setState(SIGNED_OUT);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => signOut();
    window.addEventListener('oc:unauthorized', onUnauthorized);
    return () => window.removeEventListener('oc:unauthorized', onUnauthorized);
  }, [signOut]);

  // Memoised: every useAuth() consumer (each portal shell, the chat, the consent provider) re-rendered on any parent render.
  const value = useMemo(() => ({ ...state, signIn, signOut, refresh }), [state, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
