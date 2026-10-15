// Live DOM translator.
// Watches the page and swaps English UI text for the chosen language using the
// dictionary from the server. MutationObserver callbacks run before the browser
// paints, so users never see a flash of English. Anything inside [translate="no"]
// or .notranslate (names, IDs, chat messages, the language list) is left alone.

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT', 'svg', 'SVG', 'TEXT', 'text']);

let dict = new Map();
let patterns = [];
let active = false;
let observer = null;
const tracked = new Set();
const sourceOf = new WeakMap(); // Text node -> English source
const appliedOf = new WeakMap(); // Text node -> value we wrote
const attrSource = new WeakMap(); // Element -> { attr: source }
const attrApplied = new WeakMap(); // Element -> { attr: value we wrote }
const trackedEls = new Set();
// translateString is hot (every text node on every render), so memoise hits and misses.
const cache = new Map();
const CACHE_MAX = 5000;
let inserts = 0;

// Nodes React has thrown away stay in the Sets until pruned; do it every so often.
function noteTracked() {
  if (++inserts % 500) return;
  for (const n of tracked) if (!n.isConnected) tracked.delete(n);
  for (const el of trackedEls) if (!el.isConnected) trackedEls.delete(el);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compilePatterns(map) {
  const list = [];
  for (const [src, tgt] of map) {
    if (!/\{\d+\}/.test(src)) continue;
    const order = [];
    // A placeholder glued to a letter (e.g. "day{1}") is an English plural suffix like
    // "s"/"es" — it must NOT be echoed into other languages ("2 दिनs"). Track which ones.
    const glued = new Set();
    src.replace(/(.?)\{(\d+)\}/g, (_, before, num) => { if (/[A-Za-z]/.test(before)) glued.add(num); return ''; });
    const re = new RegExp(`^${src.split(/(\{\d+\})/).map((part) => {
      const m = part.match(/^\{(\d+)\}$/);
      if (m) { order.push(m[1]); return '(.+?)'; }
      return escapeRe(part);
    }).join('')}$`, 's');
    list.push({ re, order, tgt, glued, weight: src.replace(/\{\d+\}/g, '').length });
  }
  return list.sort((a, b) => b.weight - a.weight);
}

export function translateString(value) {
  if (!active || !value) return null;
  if (cache.has(value)) return cache.get(value);
  const result = lookup(value);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(value, result);
  return result;
}

function lookup(value) {
  const core = value.replace(/\s+/g, ' ').trim();
  if (!core || !/[A-Za-z]/.test(core)) return null;
  let out = dict.get(core);
  if (!out) {
    for (const p of patterns) {
      const m = core.match(p.re);
      if (m) {
        out = p.tgt.replace(/\{(\d+)\}/g, (_, i) => {
          const idx = p.order.indexOf(i);
          if (idx < 0) return '';
          const captured = m[idx + 1];
          // Drop an English plural morpheme glued to a word (e.g. "day{1}" → "s"); other
          // languages don't pluralise this way, so "2 दिनs" becomes "2 दिन".
          if (p.glued.has(i) && /^(|s|es)$/i.test(captured)) return '';
          return captured;
        });
        break;
      }
    }
  }
  if (!out || out === core) return null;
  const lead = value.match(/^\s*/)[0];
  const trail = value.match(/\s*$/)[0];
  return lead + out + trail;
}

function skipped(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (SKIP_TAGS.has(n.tagName)) return true;
    if (n.getAttribute('translate') === 'no' || n.classList?.contains('notranslate') || n.isContentEditable) return true;
  }
  return false;
}

function processText(node) {
  const value = node.nodeValue;
  if (appliedOf.get(node) === value) return; // our own write
  if (!value || !value.trim()) return;
  if (!node.parentNode || skipped(node.parentNode)) return;
  sourceOf.set(node, value);
  if (!tracked.has(node)) { tracked.add(node); noteTracked(); }
  const t = translateString(value);
  if (t) {
    appliedOf.set(node, t);
    node.nodeValue = t;
  } else {
    appliedOf.delete(node);
  }
}

function processAttrs(el) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const v = el.getAttribute(a);
    const applied = attrApplied.get(el) || {};
    if (applied[a] === v) continue;
    const src = attrSource.get(el) || {};
    src[a] = v;
    attrSource.set(el, src);
    if (!trackedEls.has(el)) { trackedEls.add(el); noteTracked(); }
    const t = translateString(v);
    if (t) { applied[a] = t; attrApplied.set(el, applied); el.setAttribute(a, t); }
    else { delete applied[a]; attrApplied.set(el, applied); }
  }
}

function scan(root) {
  if (!root) return;
  if (root.nodeType === 3) { processText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) {
    if (skipped(root)) return;
    processAttrs(root);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n) {
      if (n.nodeType === 1) {
        if (SKIP_TAGS.has(n.tagName) || n.getAttribute('translate') === 'no' || n.classList.contains('notranslate')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n = walker.nextNode();
  while (n) {
    if (n.nodeType === 3) processText(n);
    else processAttrs(n);
    n = walker.nextNode();
  }
}

function restoreAll() {
  for (const node of tracked) {
    if (!node.isConnected) { tracked.delete(node); continue; }
    if (appliedOf.get(node) === node.nodeValue && sourceOf.has(node)) node.nodeValue = sourceOf.get(node);
    appliedOf.delete(node);
  }
  for (const el of trackedEls) {
    if (!el.isConnected) { trackedEls.delete(el); continue; }
    const src = attrSource.get(el) || {};
    const applied = attrApplied.get(el) || {};
    for (const a of Object.keys(src)) if (applied[a] === el.getAttribute(a)) el.setAttribute(a, src[a]);
    attrApplied.delete(el);
  }
}

function onMutations(muts) {
  if (!active) return; // English: nothing to translate, so don't track anything either
  for (const m of muts) {
    if (m.type === 'characterData') processText(m.target);
    else if (m.type === 'attributes') processAttrs(m.target);
    else m.addedNodes.forEach((n) => scan(n));
  }
}

/** Apply a dictionary (Map or object). Pass null to switch back to English. */
export function setDictionary(next) {
  if (typeof document === 'undefined') return;
  restoreAll();
  dict = next instanceof Map ? next : new Map(Object.entries(next || {}));
  cache.clear();
  patterns = compilePatterns(dict);
  active = dict.size > 0;
  if (!observer) {
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (active) scan(document.body);
}

/** Translate a string in code (for document.title, speech, alerts). */
export function tr(text) {
  return translateString(text) || text;
}
