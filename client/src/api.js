// Thin fetch wrapper: adds the auth token, active family profile, and friendly errors.
const TOKEN_KEY = 'oc_token';
const PROFILE_KEY = 'oc_profile';

export const session = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
  get profile() { try { return localStorage.getItem(PROFILE_KEY); } catch { return null; } },
  set profile(v) { try { v ? localStorage.setItem(PROFILE_KEY, v) : localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ } },
};

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (session.profile) headers['X-Profile'] = session.profile;
  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Can\'t reach Nexus Healthcare right now. Check your internet connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    err.code = data.code;
    err.data = data;
    if (res.status === 401 && session.token) window.dispatchEvent(new Event('oc:unauthorized'));
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
  put: (url, body) => request('PUT', url, body || {}),
  del: (url) => request('DELETE', url),
  // Multipart upload to /api/files → { id, name, mime, size, url }.
  upload: async (file) => {
    const body = new FormData();
    body.append('file', file);
    // Same auth + active-profile headers as the JSON calls: the server owns the file by X-Profile, so a
    // caregiver's upload for a family member must land on that member's record, not the caregiver's.
    const headers = {};
    if (session.token) headers.Authorization = `Bearer ${session.token}`;
    if (session.profile) headers['X-Profile'] = session.profile;
    let res;
    try {
      res = await fetch('/api/files', { method: 'POST', headers, body });
    } catch {
      throw new Error('Can\'t reach Nexus Healthcare right now. Check your internet connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed. Please try again.');
    return data;
  },
  // Protected files need the auth header, so <img src> can't load them directly — fetch as a blob URL.
  fileObjectUrl: async (id) => {
    const res = await fetch(`/api/files/${encodeURIComponent(id)}`, { headers: session.token ? { Authorization: `Bearer ${session.token}` } : {} });
    if (!res.ok) throw new Error('Could not load the file.');
    return URL.createObjectURL(await res.blob());
  },
};

// Server-sent events: one shared connection, many listeners.
// EventSource can't send headers, so the long-lived token never goes in the URL (server logs, proxies,
// history): we trade the auth header for a single-use ticket (valid ~60 s) and open the stream with that.
const listeners = new Set();
let source = null;
let retry = null;
let dropped = false;
let fails = 0;
let gen = 0; // bumped on disconnect, so a ticket request still in flight can't reopen the stream
let opening = -1; // gen of the ticket request in flight

function retryLater() {
  dropped = true;
  fails += 1;
  // Several failures in a row may mean the session itself died (password changed elsewhere, account
  // suspended): request() turns a 401 into the usual sign-out; anything else just means keep trying.
  if (fails === 3) api.get('/auth/me').catch(() => {});
  clearTimeout(retry);
  retry = setTimeout(connect, Math.min(30000, 3000 * 2 ** (fails - 1))); // 3, 6, 12, 24, 30 s…
}

async function connect() {
  if (source || opening === gen || !session.token || !listeners.size) return;
  const my = gen;
  opening = my;
  let ticket;
  try {
    ({ ticket } = await request('POST', '/events/ticket', {}));
  } catch {
    if (my === gen) retryLater();
    return;
  } finally {
    if (opening === my) opening = -1;
  }
  if (my !== gen || source || !session.token) return;
  const es = new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}`);
  source = es;
  // Events sent while we were disconnected are lost, so after a reconnect every screen refetches.
  es.onopen = () => {
    if (source !== es) return;
    if (dropped) listeners.forEach((fn) => fn(['all']));
    dropped = false;
    fails = 0;
  };
  es.onmessage = (e) => {
    try {
      const { topics } = JSON.parse(e.data);
      listeners.forEach((fn) => fn(topics));
    } catch { /* ignore */ }
  };
  // The ticket is single-use, so the browser's own auto-reconnect would be refused: close and start over.
  es.onerror = () => {
    es.close();
    if (source !== es) return;
    source = null;
    retryLater();
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  connect();
  return () => listeners.delete(fn);
}

export function disconnectLive() {
  gen += 1;
  source?.close();
  source = null;
  dropped = false;
  fails = 0;
  clearTimeout(retry);
}

// Streams the Saathi chat reply token by token.
export async function streamChat(messages, lang, onDelta, signal) {
  const headers = { 'Content-Type': 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch('/api/chat', { method: 'POST', headers, body: JSON.stringify({ messages, lang }), signal });
  if (!res.ok || !res.body) throw new Error('Chat is unavailable right now.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let meta = {};
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return meta;
      try {
        const obj = JSON.parse(payload);
        if (obj.delta) onDelta(obj.delta);
        if (obj.emergency) meta.emergency = true;
      } catch { /* ignore */ }
    }
  }
  return meta;
}
