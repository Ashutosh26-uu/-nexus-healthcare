import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Check, Search, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { cx } from './ui';
import './language.css';

const GROUP_ORDER = ['Popular', 'India', 'India · regional', 'Global'];
const GROUP_LABEL = { Popular: 'Popular', India: 'Indian languages', 'India · regional': 'Regional & tribal', Global: 'World languages' };

/**
 * compact: icon + short code (for tight top bars). variant "light" for dark backgrounds.
 */
export default function LanguagePicker({ compact, variant, align = 'end', onChange }) {
  const { lang, setLang, info, languages, pending, loading, coverage } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setTimeout(() => searchRef.current?.focus(), 30);
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = languages.filter((l) => !s || l.name.toLowerCase().includes(s) || l.native.toLowerCase().includes(s) || l.code.toLowerCase().startsWith(s));
    return GROUP_ORDER.map((g) => ({ g, items: list.filter((l) => l.group === g) })).filter((x) => x.items.length);
  }, [languages, q]);

  const choose = (code) => {
    setLang(code);
    onChange?.(code);
    setOpen(false);
    setQ('');
  };

  return (
    <div className={cx('lang-wrap', variant)} ref={wrapRef}>
      <button type="button" className={cx('lang-btn', compact && 'compact')} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} aria-label="Change language">
        {loading || pending ? <Loader2 className="spin" /> : <Globe />}
        <span translate="no" className="notranslate">{compact ? info.code.split('-')[0].toUpperCase() : info.native}</span>
      </button>
      {open && (
        <div className={cx('lang-pop', align === 'start' && 'start')} role="dialog" aria-label="Choose your language">
          <div className="lang-search">
            <Search size={16} />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search languages" aria-label="Search languages" />
          </div>
          {pending && <div className="lang-note">Translating into {info.name}… {coverage}% ready</div>}
          <div className="lang-list" role="listbox">
            {groups.map(({ g, items }) => (
              <div key={g}>
                <div className="lang-group">{GROUP_LABEL[g]}</div>
                {items.map((l) => (
                  <button type="button" key={l.code} role="option" aria-selected={l.code === lang} className={cx('lang-item', l.code === lang && 'on')} onClick={() => choose(l.code)}>
                    <span className="lang-native notranslate" translate="no" dir={l.dir}>{l.native}</span>
                    <span className="lang-en">{l.name}</span>
                    {l.code === lang && <Check size={16} />}
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && <div className="lang-note">No language matches “{q}”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
