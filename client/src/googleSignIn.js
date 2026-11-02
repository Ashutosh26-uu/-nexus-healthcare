// "Continue with Google" through Neon Auth (server side: server/neonauth.js). Neon Auth only proves the Google
// identity; our server then signs the person into their existing Sehatra account with that verified email.
// The Neon SDK is loaded only when someone uses this, so it adds nothing to the normal app.
import { api } from './api';

const FLAG = 'oc_google_signin';
let client = null;
async function authClient(url) {
  if (!client) {
    const { createAuthClient } = await import('@neon/auth');
    // credentials: the Auth URL is on another origin; its session cookie must travel for token().
    client = createAuthClient(url, { fetchOptions: { credentials: 'include' } });
  }
  return client;
}

// Leaves the page for Google; comes back to /login.
export async function startGoogle(url) {
  try { sessionStorage.setItem(FLAG, '1'); } catch { /* storage blocked */ }
  const auth = await authClient(url);
  const { error } = await auth.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/login` });
  if (error) { try { sessionStorage.removeItem(FLAG); } catch { /* ignore */ } throw new Error(error.message || 'Google sign-in could not start.'); }
}

export function returningFromGoogle() {
  try { return sessionStorage.getItem(FLAG) === '1' || new URLSearchParams(window.location.search).has('neon_auth_session_verifier'); } catch { return false; }
}

// Back on /login: swap the Neon session for our own sign-in, then end the Neon session (we don't keep it).
// Returns the server's login answer ({ token } or { mfaRequired, ticket }); throws with err.code 'NO_ACCOUNT'.
export async function finishGoogle(url) {
  try { sessionStorage.removeItem(FLAG); } catch { /* ignore */ }
  const auth = await authClient(url);
  try {
    const { data, error } = await auth.token();
    if (error || !data?.token) throw new Error('Google sign-in didn\'t finish. Please try again.');
    return await api.post('/auth/neon', { token: data.token });
  } finally {
    auth.signOut().catch(() => {});
    const u = new URL(window.location.href);
    if (u.searchParams.has('neon_auth_session_verifier')) { u.searchParams.delete('neon_auth_session_verifier'); window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash); }
  }
}
