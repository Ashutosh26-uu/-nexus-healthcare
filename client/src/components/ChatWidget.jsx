import { memo, useEffect, useRef, useState } from 'react';
import { MessageCircleHeart, X, SendHorizontal, Phone, RotateCcw } from 'lucide-react';
import { streamChat } from '../api';
import { useAuth } from '../auth';
import { useI18n, tr } from '../i18n';
import { cx } from './ui';
import { useSupport } from '../config';
import './chat.css';

const STORE_KEY = 'oc_chat';
const SUGGESTIONS = [
  'How do I book a doctor?',
  'What is a Health Passport?',
  'I have fever since 2 days',
  'Who can see my records?',
  'Where is the nearest E-Clinic?',
];

function greeting(user) {
  const first = user?.name?.replace(/^Dr\.\s*/, '').split(' ')[0];
  return {
    role: 'assistant',
    content: first
      ? `Namaste ${first} 🙏 I'm **Saathi**. Ask me anything — booking a doctor, your medicines, or a health worry. I'm here 24×7.`
      : "Namaste 🙏 I'm **Saathi**, Sehatra's help assistant. Ask me about booking a doctor, your Health Passport, medicines — or any health question.",
  };
}

// Small, safe markdown: **bold**, *italic*, bullet lists, line breaks.
function renderMarkdown(text) {
  const lines = text.split('\n');
  const out = [];
  let list = [];
  const inline = (s, k) => {
    const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong>;
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={`${k}-${i}`}>{p.slice(1, -1)}</em>;
      return p;
    });
  };
  const flush = (k) => {
    if (list.length) { out.push(<ul key={`ul-${k}`}>{list.map((l, i) => <li key={i}>{inline(l, `li-${k}-${i}`)}</li>)}</ul>); list = []; }
  };
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
    if (m) { list.push(m[1]); return; }
    flush(i);
    if (line.trim()) out.push(<p key={i}>{inline(line, i)}</p>);
  });
  flush('end');
  return out;
}

// Memoised so a streaming reply re-renders only the last bubble, not every message's markdown per token.
// The greeting also gets `lang` so its translation refreshes on a language switch.
const Message = memo(function Message({ m, first }) {
  return (
    <div className={cx('msg', m.role, m.error && 'error', 'notranslate')} translate="no" dir="auto">
      {m.role === 'assistant' && m.content === '' ? (
        <span className="typing"><i /><i /><i /></span>
      ) : (
        <div className="msg-text">{m.role === 'assistant' ? renderMarkdown(first ? tr(m.content) : m.content) : m.content}</div>
      )}
    </div>
  );
});

// Stored as { uid, messages } so one person's chat never shows up for the next person on this device.
function loadStored() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.messages)) return s;
  } catch { /* ignore */ }
  return { uid: undefined, messages: [] };
}

export default function ChatWidget() {
  const { user, loading: authLoading } = useAuth() || {};
  const { lang } = useI18n();
  const support = useSupport();
  const [open, setOpen] = useState(false);
  const [stored] = useState(loadStored);
  const [messages, setMessages] = useState(stored.messages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [nudge, setNudge] = useState(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const ownerRef = useRef(stored.uid);

  const shown = messages.length ? messages : [greeting(user)];

  // Sign-out or a different user → start a fresh conversation.
  const uid = user?.id ?? null;
  useEffect(() => {
    if (authLoading || ownerRef.current === uid) return;
    ownerRef.current = uid;
    abortRef.current?.abort();
    setMessages([]);
    setEmergency(false);
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }, [uid, authLoading]);

  useEffect(() => {
    if (streaming || authLoading) return;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ uid: ownerRef.current, messages: messages.slice(-30) })); } catch { /* ignore */ }
  }, [messages, streaming, authLoading]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open, streaming]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 250);
  }, [open]);

  // A gentle one-time hello bubble for first-time visitors.
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem('oc_chat_nudged'); } catch { /* ignore */ }
    if (seen) return undefined;
    const t = setTimeout(() => { setNudge(true); try { sessionStorage.setItem('oc_chat_nudged', '1'); } catch { /* ignore */ } }, 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (textArg) => {
    const text = (textArg ?? input).trim();
    if (!text || streaming) return;
    setInput('');
    setNudge(false);
    const base = messages.length ? messages : [greeting(user)];
    const next = [...base, { role: 'user', content: text }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const meta = await streamChat(next.filter((m, i) => !(i === 0 && m.role === 'assistant')), lang, (delta) => {
        setMessages((cur) => {
          const copy = cur.slice();
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + delta };
          return copy;
        });
      }, controller.signal);
      if (meta?.emergency) setEmergency(true);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setMessages((cur) => {
          const copy = cur.slice();
          copy[copy.length - 1] = { role: 'assistant', content: support.phone ? `Sorry, I couldn't connect just now. Please try again in a moment, or call **${support.phone}**.` : "Sorry, I couldn't connect just now. Please try again in a moment.", error: true };
          return copy;
        });
      }
    } finally {
      setStreaming(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setEmergency(false);
    setStreaming(false);
  };

  return (
    <>
      {/* Two sibling buttons: an icon with its own click handler inside a button is unreachable by keyboard and screen reader. */}
      {!open && nudge && (
        <div className="chat-nudge">
          <button type="button" className="chat-nudge-open" onClick={() => { setOpen(true); setNudge(false); }}>Hi! Need help finding a doctor?</button>
          <button type="button" className="chat-nudge-x" onClick={() => setNudge(false)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
      <button className={cx('chat-fab', open && 'hidden')} onClick={() => setOpen(true)} aria-label="Open help chat">
        <MessageCircleHeart />
        <span className="chat-fab-label">Ask Saathi</span>
      </button>

      {/* `inert` keeps the hidden panel's buttons out of the Tab order (it is only faded out, not unmounted). */}
      <div className={cx('chat-panel', open && 'open')} role="dialog" aria-label="Saathi help chat" aria-hidden={!open} inert={!open}>
        <div className="chat-head">
          <div className="chat-ava" aria-hidden="true">स</div>
          <div className="grow">
            <div className="chat-title">Saathi</div>
            <div className="chat-sub"><span className="dot green" /> Replies instantly · in your language</div>
          </div>
          <button className="icon-btn light" onClick={reset} aria-label="Start over" title="Start over"><RotateCcw size={17} /></button>
          <button className="icon-btn light" onClick={() => setOpen(false)} aria-label="Close chat"><X /></button>
        </div>

        {emergency && (
          <a className="chat-emergency" href="tel:108">
            <Phone size={18} />
            <span><strong>Emergency? Call 108 now</strong><br /><span className="tiny">Tap to call an ambulance</span></span>
          </a>
        )}

        <div className="chat-body" ref={bodyRef}>
          {shown.map((m, i) => <Message key={i} m={m} first={i === 0} lang={i === 0 ? lang : undefined} />)}
          {messages.length === 0 && (
            <div className="chat-suggest">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
        </div>

        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            dir="auto"
            placeholder="Type your question…"
            aria-label="Message"
            maxLength={1000}
          />
          <button type="submit" disabled={!input.trim() || streaming} aria-label="Send"><SendHorizontal size={18} /></button>
        </form>
        <div className="chat-foot">Saathi gives general guidance, not a diagnosis. In an emergency call 108.</div>
      </div>
    </>
  );
}
