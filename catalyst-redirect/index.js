// The old address (nexus-healthcare-…catalystappsail.in) after the rebrand: every request is sent to the
// same path on the Sehatra address, so old links, bookmarks, printed visit-pass QR codes and webhooks keep
// working. No database, no app code — the real server runs only under the new name.
const http = require('http');

const NEW_URL = (process.env.NEW_URL || 'https://sehatra-50046997916.development.catalystappsail.in').replace(/\/+$/, '');
const PORT = Number(process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 9000);

http.createServer((req, res) => {
  const target = NEW_URL + (req.url && req.url.startsWith('/') ? req.url : '/');
  // 301 for page loads; 308 keeps the method and body for API calls (POST stays POST).
  const code = req.method === 'GET' || req.method === 'HEAD' ? 301 : 308;
  res.writeHead(code, { Location: target, 'Cache-Control': 'public, max-age=86400', 'Content-Type': 'text/html; charset=utf-8' });
  res.end(req.method === 'HEAD' ? undefined : `<!doctype html><meta charset="utf-8"><title>Sehatra</title><p>Nexus Healthcare is now <a href="${target.replace(/"/g, '&quot;')}">Sehatra</a>.</p>`);
}).listen(PORT, () => console.log(`redirecting to ${NEW_URL} on ${PORT}`));
