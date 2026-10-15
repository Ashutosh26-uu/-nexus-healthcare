// Builds src/i18n/catalog.json — every user-facing English string in the app.
// The server only ever translates strings from this catalog, so personal data shown
// on screen (names, notes, results) is never sent to a translation provider.
//
//   npm run i18n:extract
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const out = path.join(root, 'i18n', 'catalog.json');

const strings = new Set();
const patterns = new Set();
const TEXT_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'subtitle', 'eyebrow', 'hint', 'cta', 'text', 'children']);
const SKIP_PROPS = new Set(['className', 'class', 'to', 'href', 'src', 'type', 'name', 'id', 'key', 'variant', 'size', 'icon', 'role', 'method', 'inputMode', 'autoComplete', 'tone', 'value', 'mode', 'status', 'level', 'kind', 'fill', 'stroke', 'd', 'viewBox', 'transform', 'path', 'url', 'style', 'target', 'rel', 'lang', 'dir', 'code', 'locale']);

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const hasLetters = (s) => /[A-Za-z]{2,}/.test(s);

function looksLikeUiText(s) {
  if (!hasLetters(s) || s.length > 400) return false;
  if (/^[a-z0-9_.:/#-]+$/.test(s)) return false; // keys, ids, css classes, paths
  if (/^[A-Z0-9_]+$/.test(s) && s.length < 6) return false; // codes like "ICU", "OTP"
  if (/^(https?:|mailto:|tel:|\/|\.\/|#)/.test(s)) return false;
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(s)) return false; // camelCase identifiers
  if (/[{}<>;=]|=>|\$\{/.test(s)) return false;
  if (/^(GET|POST|PUT|DELETE)$/.test(s)) return false;
  if (/^[\w-]+\.(jsx?|css|json|svg|png)$/.test(s)) return false;
  if (/^\d/.test(s) && !/\s/.test(s)) return false;
  if (/^(rgba?|hsl|var)\(/.test(s) || /^#[0-9a-f]{3,8}$/i.test(s)) return false;
  // plain lowercase single words are usually keys ("routine", "pending"), keep Capitalised words and phrases
  if (!/\s/.test(s) && /^[a-z]/.test(s)) return false;
  return true;
}

function add(s) {
  const c = clean(s);
  if (c && looksLikeUiText(c)) strings.add(c);
}

function addTemplate(node) {
  const parts = node.quasis.map((q) => q.value.cooked ?? q.value.raw);
  if (node.expressions.length === 0) return add(parts[0]);
  const staticText = parts.join(' ');
  if (!hasLetters(staticText.replace(/\s+/g, ''))) return;
  let p = '';
  parts.forEach((q, i) => { p += q; if (i < node.expressions.length) p += `{${i}}`; });
  p = clean(p);
  // must have real words outside placeholders
  const words = p.replace(/\{\d+\}/g, '').replace(/[^A-Za-z ]/g, ' ').trim();
  if (words.split(/\s+/).filter((w) => w.length > 1).length < 1) return;
  if (/^\{\d+\}$/.test(p) || /[;=<>]|=>/.test(p)) return;
  if (/^[a-z0-9_./:#{}-]+$/.test(p)) return; // url/class templates
  if (p.length > 3) patterns.add(p);
}

function walk(node, parent, parentKey) {
  if (!node || typeof node.type !== 'string') return;
  switch (node.type) {
    case 'JSXText':
      add(node.value);
      break;
    case 'JSXAttribute': {
      const name = node.name?.name;
      if (SKIP_PROPS.has(name)) return;
      const v = node.value;
      if (v?.type === 'StringLiteral' && (TEXT_ATTRS.has(name) || /\s/.test(v.value))) add(v.value);
      break;
    }
    case 'StringLiteral': {
      if (parent?.type === 'ImportDeclaration' || parent?.type === 'ExportNamedDeclaration' || parent?.type === 'ExportAllDeclaration') return;
      if (parent?.type === 'JSXAttribute') return; // handled above
      if (parent?.type === 'ObjectProperty' && parentKey === 'key') return;
      if (parent?.type === 'CallExpression' && ['require', 'import', 'querySelector', 'querySelectorAll', 'getItem', 'setItem', 'removeItem', 'addEventListener', 'removeEventListener', 'get', 'post', 'put', 'createElement', 'useLive', 'getAttribute', 'setAttribute'].includes(parent.callee?.property?.name || parent.callee?.name)) return;
      if (parent?.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator)) return;
      if (parent?.type === 'SwitchCase') return;
      add(node.value);
      break;
    }
    case 'TemplateLiteral':
      if (parent?.type === 'TaggedTemplateExpression') return;
      if (parent?.type === 'CallExpression' && ['get', 'post', 'put', 'fetch', 'useLive', 'querySelector'].includes(parent.callee?.property?.name || parent.callee?.name)) return;
      if (parent?.type === 'JSXExpressionContainer' && parent.__attr && SKIP_PROPS.has(parent.__attr)) return;
      addTemplate(node);
      break;
    default:
      break;
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments' || key === 'extra') continue;
    const child = node[key];
    if (node.type === 'JSXAttribute' && key === 'value' && child?.type === 'JSXExpressionContainer') child.__attr = node.name?.name;
    if (Array.isArray(child)) child.forEach((c) => walk(c, node, key));
    else if (child && typeof child.type === 'string') walk(child, node, key);
  }
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return files(p);
    return /\.(jsx|js)$/.test(d.name) ? [p] : [];
  });
}

let count = 0;
for (const f of files(root)) {
  const code = fs.readFileSync(f, 'utf8');
  try {
    const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
    walk(ast.program, null);
    count += 1;
  } catch (e) {
    console.warn(`skip ${path.relative(root, f)}: ${e.message}`);
  }
}

const catalog = { generatedAt: new Date().toISOString(), strings: [...strings].sort(), patterns: [...patterns].sort() };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(catalog, null, 1)}\n`);
console.log(`i18n: ${catalog.strings.length} strings + ${catalog.patterns.length} patterns from ${count} files → src/i18n/catalog.json`);
