// Runs the link service locally with an in-memory Postgres (PGlite) —
// no Neon account, Cloudflare account or domain needed.
// Usage: npm run dev:local        (then set apiBase to http://localhost:8787)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';

const port = Number(process.env.PORT) || 8787;
const pg = new PGlite(process.env.PGLITE_DIR || undefined);
await pg.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));

const app = createApp({
  db: { query: async (text, params) => (await pg.query(text, params)).rows },
  env: {
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
    SITE_URL: process.env.SITE_URL || 'http://localhost:8000/',
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'dev-admin-token',
    CREATE_LIMIT_PER_HOUR: process.env.CREATE_LIMIT_PER_HOUR || '1000',
    IP_SALT: 'dev',
  },
});

http
  .createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const hasBody = !['GET', 'HEAD'].includes(req.method) && chunks.length;
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
    const response = await app.fetch(request, { waitUntil: (p) => p });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  })
  .listen(port, () => console.log(`QR Studio link service running at http://localhost:${port}  (admin token: dev-admin-token)`));
