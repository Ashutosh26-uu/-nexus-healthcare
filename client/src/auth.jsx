import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, session, disconnectLive } from './api';

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

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: Boolean(session.token), user: null, facility: null, doctor: null, profiles: [] });

  const refresh = useCallback(async (retried = false) => {
    if (!session.token) { setState({ loading: false, user: null, profiles: [] }); return null; }
    try {
      const me = await api.get('/auth/me');
      setState({ loading: false, ...me, profiles: me.profiles || [] });
      return me;
    } catch (e) {
      // Only a real 401 means the token is bad; a network blip or server restart shouldn't sign anyone out.
      if (e.status === 401) session.token = null;
      else if (!retried) {
        await new Promise((r) => setTimeout(r, 3000));
        return refresh(true);
      }
      setState({ loading: false, user: null, profiles: [] });
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = useCallback(async (token) => {
    session.token = token;
    session.profile = null;
    return refresh();
  }, [refresh]);

  const signOut = useCallback(() => {
    session.token = null;
    session.profile = null;
    disconnectLive();
    setState({ loading: false, user: null, profiles: [] });
  }, []);

  useEffect(() => {
    const onUnauthorized = () => signOut();
    window.addEventListener('oc:unauthorized', onUnauthorized);
    return () => window.removeEventListener('oc:unauthorized', onUnauthorized);
  }, [signOut]);

  return <AuthContext.Provider value={{ ...state, signIn, signOut, refresh }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
