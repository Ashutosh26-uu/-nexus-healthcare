import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, LockOpen, ShieldCheck, KeyRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, Field, Modal, cx } from './ui';
import { e2eSupported, cachedKey, createIdentity, unlockIdentity, encryptMessage, decryptMessage } from '../e2e';

// End-to-end encrypted consult chat, shared by the patient's consult room and the doctor's consult screen.
// status: loading | unsupported | disabled (kiosk) | setup (no key yet) | locked (key not on this device) | ready
export function useE2EChat(consultId, messages) {
  const { user } = useAuth();
  const [me, setMe] = useState(undefined); // server copy: { publicKey, backup } | { publicKey: null }
  const [local, setLocal] = useState(null); // this device's unlocked key
  const [info, setInfo] = useState(null); // { enabled, participants }
  const [plain, setPlain] = useState({}); // message id → text | null (can't open)
  const uid = user?.id;

  const loadInfo = useCallback(() => api.get(`/consults/${consultId}/e2e`).then((r) => { setInfo(r); return r; }), [consultId]);
  const loadMe = useCallback(async () => {
    const [m, k] = await Promise.all([api.get('/e2e/me'), uid ? cachedKey(uid) : null]);
    setMe(m);
    // A cached key from before a reset (different public key) is useless: forget it here.
    setLocal(k && m.publicKey && k.publicKey?.x === m.publicKey.x ? k : null);
  }, [uid]);

  useEffect(() => {
    if (!e2eSupported() || !consultId) return;
    loadMe().catch(() => setMe({ publicKey: null }));
    loadInfo().catch(() => setInfo({ enabled: false, participants: [] }));
  }, [consultId, loadMe, loadInfo]);

  // Someone in the chat may set up their key mid-visit: refresh who can receive sealed messages as the thread moves.
  const count = messages?.length || 0;
  useEffect(() => { if (consultId && count) loadInfo().catch(() => {}); }, [count, consultId, loadInfo]);

  // Decrypt whatever is new.
  const busy = useRef(false);
  useEffect(() => {
    if (!local || busy.current) return;
    const todo = (messages || []).filter((m) => m.e2e && !(m.id in plain));
    if (!todo.length) return;
    busy.current = true;
    Promise.all(todo.map(async (m) => [m.id, await decryptMessage(m.e2e, consultId, uid, local.privateKey)]))
      .then((pairs) => setPlain((p) => ({ ...p, ...Object.fromEntries(pairs) })))
      .finally(() => { busy.current = false; });
  }, [messages, local, plain, consultId, uid]);

  let status = 'loading';
  if (!e2eSupported()) status = 'unsupported';
  else if (info && !info.enabled) status = 'disabled';
  else if (me && info) status = !me.publicKey ? 'setup' : !local ? 'locked' : 'ready';
  const others = (info?.participants || []).filter((p) => p.userId !== uid);
  const missing = others.filter((p) => !p.publicKey);
  const sealedReady = status === 'ready' && others.length > 0 && missing.length === 0;

  // Sealed for everyone in the chat (sender included) when all of them have keys; otherwise plain, and
  // the screen says so. Fresh participant keys are fetched right before sealing.
  const bodyFor = async (text) => {
    if (status !== 'ready') return { text };
    const fresh = await loadInfo();
    const all = fresh.participants || [];
    if (!fresh.enabled || all.some((p) => !p.publicKey) || !all.some((p) => p.userId === uid)) return { text };
    return { e2e: await encryptMessage(text, consultId, all.map((p) => ({ userId: p.userId, publicKey: p.publicKey }))) };
  };
  const textOf = (m) => {
    if (!m.e2e) return m.text;
    if (m.id in plain) return plain[m.id] ?? 'This encrypted message was sent before your chat key was reset, so it can’t be opened.';
    return status === 'ready' ? 'Decrypting…' : 'Encrypted message — unlock encrypted chat to read it.';
  };
  return { status, me, missing, others, sealedReady, bodyFor, textOf, uid, refresh: () => { loadMe(); loadInfo(); }, onUnlocked: (k) => setLocal(k) };
}

export function E2EBar({ e2e, compact }) {
  const [mode, setMode] = useState(null); // setup | unlock | reset
  const { status, missing, sealedReady } = e2e;
  if (status === 'loading' || status === 'disabled') return null;
  let tone = 'muted'; let icon = Lock; let text; let action = null;
  if (status === 'unsupported') { icon = LockOpen; text = 'This browser can’t do end-to-end encryption, so messages here are protected in storage only.'; }
  else if (status === 'setup') { icon = LockOpen; text = 'Turn on end-to-end encryption so only the people in this chat can read it — not even Sehatra.'; action = <Button size="sm" variant="secondary" icon={ShieldCheck} onClick={() => setMode('setup')}>Turn on</Button>; }
  else if (status === 'locked') { icon = KeyRound; text = 'Enter your chat passphrase to read and send encrypted messages on this device.'; action = <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => setMode('unlock')}>Unlock</Button>; }
  else if (sealedReady) { tone = 'ok'; icon = ShieldCheck; text = 'End-to-end encrypted — only the people in this chat can read these messages.'; }
  else { icon = LockOpen; text = `Protected in storage, but not end-to-end yet: ${missing.map((p) => p.name).join(', ') || 'the other person'} ${missing.length > 1 ? 'haven’t' : 'hasn’t'} turned on encrypted chat.`; }
  const Icon = icon;
  return (
    <>
      <div className={cx('e2e-bar', tone, compact && 'compact')} role="status">
        <Icon size={15} aria-hidden="true" />
        <span className="grow">{text}</span>
        {action}
      </div>
      {mode && <PassphraseModal mode={mode} setMode={setMode} e2e={e2e} />}
    </>
  );
}

function PassphraseModal({ mode, setMode, e2e }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const close = () => setMode(null);
  const create = async (reset) => {
    if (pw.length < 8) { setErr('Use at least 8 characters — a short sentence is easiest to remember.'); return; }
    if (pw !== pw2) { setErr('The two passphrases don’t match.'); return; }
    setBusy(true); setErr('');
    try {
      const id = await createIdentity(e2e.uid, pw);
      await api.put('/e2e/me', { ...id, reset: reset || undefined });
      e2e.refresh(); close();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const unlock = async () => {
    setBusy(true); setErr('');
    try { e2e.onUnlocked(await unlockIdentity(e2e.uid, pw, e2e.me)); close(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const isNew = mode === 'setup' || mode === 'reset';
  return (
    <Modal open onClose={close} title={mode === 'unlock' ? 'Unlock encrypted chat' : mode === 'reset' ? 'Reset encrypted chat' : 'Turn on encrypted chat'}
      subtitle={isNew ? 'Your messages are locked on your device before they’re sent. Not even Sehatra can read them.' : 'Your passphrase opens your encrypted chats on this device.'}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (mode === 'unlock') unlock(); else create(mode === 'reset'); }}>
        {err && <div className="form-error">{err}</div>}
        {mode === 'reset' && <div className="form-error" style={{ background: 'var(--sun-soft)', color: '#87590b' }}>Messages sent to you before the reset can’t be opened any more. Only reset if you’ve forgotten your passphrase.</div>}
        <Field label={isNew ? 'Choose a chat passphrase' : 'Chat passphrase'} hint={isNew ? 'At least 8 characters. You’ll need it on a new phone or after signing out. We can’t recover it for you.' : undefined}>
          <input className="input" type="password" autoComplete={isNew ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
        {isNew && <Field label="Type it again"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>}
        <Button type="submit" loading={busy} icon={mode === 'unlock' ? KeyRound : ShieldCheck}>{mode === 'unlock' ? 'Unlock' : mode === 'reset' ? 'Reset and turn on' : 'Turn on encrypted chat'}</Button>
        {mode === 'unlock' && <button type="button" className="link-btn small" onClick={() => { setMode('reset'); setErr(''); setPw(''); }}>Forgot your passphrase? Reset</button>}
      </form>
    </Modal>
  );
}

