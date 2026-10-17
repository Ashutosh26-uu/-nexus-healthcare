import { useEffect } from 'react';

// Per-page <title>, meta description, Open Graph tags, canonical link and JSON-LD for the public pages.
// In production the server already fills these into the HTML shell (for crawlers and WhatsApp previews);
// this keeps them right as the visitor moves between pages in the app. Tags are updated in place, never duplicated.
const DEFAULT_TITLE = 'Nexus Healthcare — Care that reaches every village';
const DEFAULT_DESC = 'Nexus Healthcare — one health network for every Indian. See a verified doctor, keep your records in one Health Passport, and get medicines, wherever you live.';

function upsert(selector, create, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) { el = document.createElement(create); document.head.appendChild(el); }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}
const meta = (key, value, attr = 'name') => upsert(`meta[${attr}="${key}"]`, 'meta', { [attr]: key, content: value });

export function canonicalUrl(path) {
  return `${window.location.origin}${path || window.location.pathname}`;
}

export function useSeo({ title, description, path, jsonLd } = {}) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    if (!title) return undefined;
    const url = canonicalUrl(path);
    document.title = title;
    meta('description', description || DEFAULT_DESC);
    meta('og:type', 'website', 'property');
    meta('og:site_name', 'Nexus Healthcare', 'property');
    meta('og:title', title, 'property');
    meta('og:description', description || DEFAULT_DESC, 'property');
    meta('og:url', url, 'property');
    meta('twitter:card', 'summary');
    upsert('link[rel="canonical"]', 'link', { rel: 'canonical', href: url });
    let script = document.head.querySelector('script[type="application/ld+json"][data-seo]');
    if (ld) {
      if (!script) { script = document.createElement('script'); script.type = 'application/ld+json'; script.setAttribute('data-seo', '1'); document.head.appendChild(script); }
      // The page's own address wins over whatever host the API saw.
      script.textContent = JSON.stringify({ ...JSON.parse(ld), url });
    } else if (script) script.remove();
    return () => {
      document.title = DEFAULT_TITLE;
      meta('description', DEFAULT_DESC);
      ['og:title', 'og:description', 'og:url'].forEach((k) => document.head.querySelector(`meta[property="${k}"]`)?.remove());
      document.head.querySelector('link[rel="canonical"]')?.remove();
      document.head.querySelector('script[type="application/ld+json"][data-seo]')?.remove();
    };
  }, [title, description, path, ld]);
}
