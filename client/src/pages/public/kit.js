import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';

// Hooks and formatters shared by the public, no-login pages.

// Device location for "near you" — kept in this page's memory only (never put in the page address).
export function useNearMe() {
  const [loc, setLoc] = useState(null);
  const [state, setState] = useState('idle'); // idle | asking | on | denied | unsupported
  const request = useCallback(() => {
    if (!navigator.geolocation) { setState('unsupported'); return; }
    setState('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: Math.round(p.coords.latitude * 1000) / 1000, lng: Math.round(p.coords.longitude * 1000) / 1000 }); setState('on'); },
      () => setState('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }, []);
  const clear = useCallback(() => { setLoc(null); setState('idle'); }, []);
  return { loc, state, request, clear };
}

// Sign in (or sign up) first, then land on the right screen of the patient app.
export function useContinue() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return useCallback((path) => {
    if (user && ['patient', 'caregiver'].includes(user.role)) navigate(path);
    else navigate('/login', { state: { from: path } });
  }, [user, navigate]);
}

// Live JSON from the public API — fetched fresh on every change (no stale cache).
export function usePublicJson(url) {
  const [res, setRes] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    if (!url) return undefined;
    const ctl = new AbortController();
    setRes((r) => ({ ...r, loading: true, error: null }));
    fetch(`/api${url}`, { cache: 'no-store', signal: ctl.signal })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; } return j; })
      .then((data) => setRes({ data, error: null, loading: false }))
      .catch((e) => { if (e.name !== 'AbortError') setRes({ data: null, error: e, loading: false }); });
    return () => ctl.abort();
  }, [url]);
  return res;
}

export const qs = (o) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')); const s = p.toString(); return s ? `?${s}` : ''; };
export const money = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
export const hours = (h) => (h == null ? '—' : h < 24 ? `${h} hours` : `${Math.round(h / 24)} day${h >= 48 ? 's' : ''}`);
