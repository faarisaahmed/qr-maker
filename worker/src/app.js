// QR Studio — dynamic link service.
// Runtime-agnostic core: give it a `db` with `query(text, params) -> rows`
// and it returns { fetch, scheduled }. The Cloudflare entry point (index.js)
// wires it to Neon; tests and the local dev server wire it to PGlite.

import { pageNotFound, pageDisabled, pagePreview, pageError, pageHome } from './pages.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Unambiguous characters only (no 0/O, 1/l/I, i, o) so codes are easy to type.
export const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const ID_RE = new RegExp(`^[${ALPHABET}]{4,16}$`);
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|curl|wget|python-requests|headless/i;
const SB_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'];
const MAX_BODY = 16 * 1024;

/* ----------------------------------------------------------------- utils */
export function randomId(len = 7) {
  const n = ALPHABET.length, max = 256 - (256 % n);
  let s = '';
  while (s.length < len) {
    const bytes = crypto.getRandomValues(new Uint8Array(len * 2));
    for (const b of bytes) {
      if (b < max) s += ALPHABET[b % n];
      if (s.length === len) break;
    }
  }
  return s;
}
function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const newEditKey = () => b64url(crypto.getRandomValues(new Uint8Array(24)));
export async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function deviceOf(ua) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'other';
}
const iso = (v) => (v == null ? null : new Date(v).toISOString());

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers },
  });
}
function html(body, status = 200, allowScript = false) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'${allowScript ? "; script-src 'unsafe-inline'" : ''}`,
      ...SECURITY_HEADERS,
    },
  });
}
async function readJson(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, 'Request is too large');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request is too large');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch (e) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
}

/* ------------------------------------------------------------------- app */
export function createApp({ db, env = {}, fetcher = (...a) => fetch(...a), log = console }) {
  const cfg = {
    origins: String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
    site: env.SITE_URL || '',
    base: String(env.PUBLIC_BASE || '').replace(/\/+$/, ''),
    createLimit: Number(env.CREATE_LIMIT_PER_HOUR) || 30,
    reportLimit: 10,
    retentionDays: Number(env.SCAN_RETENTION_DAYS) || 395,
    blocked: String(env.BLOCKED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    salt: env.IP_SALT || 'qr-studio',
  };
  const q = (text, params = []) => db.query(text, params);

  /* ---- helpers needing config */
  function cors(origin) {
    const h = {
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (cfg.origins.includes('*')) h['Access-Control-Allow-Origin'] = '*';
    else if (origin && cfg.origins.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
    return h;
  }
  const ipHash = (request) => sha256hex((request.headers.get('CF-Connecting-IP') || 'unknown') + '|' + cfg.salt);

  function validateTarget(raw, selfHost) {
    if (typeof raw !== 'string' || !raw.trim()) throw new HttpError(400, 'A destination URL is required');
    let s = raw.trim();
    if (s.length > 2048) throw new HttpError(400, 'That URL is too long (max 2048 characters)');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch (e) { throw new HttpError(400, 'That doesn’t look like a valid URL'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(400, 'Only http and https links are allowed');
    if (u.username || u.password) throw new HttpError(400, 'Links with embedded usernames or passwords aren’t allowed');
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal')) throw new HttpError(400, 'Use a public web address');
    if (host === selfHost) throw new HttpError(400, 'A dynamic link can’t point to another short link');
    if (cfg.blocked.some((b) => host === b || host.endsWith('.' + b))) throw new HttpError(400, 'That destination isn’t allowed');
    return u.toString();
  }

  // Returns Map(url -> threatType), or null if the check could not run.
  async function safeBrowsing(urls) {
    if (!env.SAFE_BROWSING_KEY || !urls.length) return new Map();
    try {
      const res = await fetcher(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(env.SAFE_BROWSING_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'qr-studio', clientVersion: '1.0' },
          threatInfo: { threatTypes: SB_TYPES, platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: urls.map((url) => ({ url })) },
        }),
      });
      if (!res.ok) { log.warn('Safe Browsing HTTP', res.status); return null; }
      const data = await res.json();
      const m = new Map();
      for (const x of data.matches || []) m.set(x.threat && x.threat.url, x.threatType);
      return m;
    } catch (e) {
      log.warn('Safe Browsing failed', e && e.message);
      return null;
    }
  }
  async function assertSafe(target) {
    const m = await safeBrowsing([target]);
    if (m && m.has(target)) throw new HttpError(422, 'This destination is flagged as unsafe and can’t be used');
    return m !== null && !!env.SAFE_BROWSING_KEY; // true when actually checked
  }

  function summary(row, base) {
    return {
      id: row.id,
      shortUrl: `${base}/${row.id}`,
      target: row.target,
      disabled: !!row.disabled,
      disabledReason: row.disabled ? row.disabled_reason || 'Disabled' : null,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      scans: { total: Number(row.scan_count) || 0, last: iso(row.last_scan_at) },
    };
  }
  async function daily(ids) {
    const rows = await q(
      `select link_id, to_char(date_trunc('day', at), 'YYYY-MM-DD') as day, count(*)::int as n
         from scans where link_id = any($1) and at > now() - interval '30 days'
        group by 1, 2 order by 2`,
      [ids]
    );
    const out = {};
    for (const r of rows) (out[r.link_id] ||= []).push({ day: r.day, n: Number(r.n) });
    return out;
  }
  async function authLink(request, id) {
    const key = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!key) throw new HttpError(401, 'Missing edit key');
    const rows = await q('select * from links where id = $1', [id]);
    if (!rows.length) throw new HttpError(404, 'Link not found');
    if (!safeEqual(await sha256hex(key), rows[0].edit_key_hash)) throw new HttpError(403, 'That edit key doesn’t match this link');
    return rows[0];
  }

  /* ---- API */
  async function api(request, path, base, selfHost) {
    const method = request.method;
    if (path === '/api/health' && method === 'GET') {
      await q('select 1');
      return json({ ok: true });
    }

    if (path === '/api/links' && method === 'POST') {
      const body = await readJson(request);
      const target = validateTarget(body.target, selfHost);
      const ip = await ipHash(request);
      const [{ n }] = await q(`select count(*)::int as n from links where creator_ip_hash = $1 and created_at > now() - interval '1 hour'`, [ip]);
      if (Number(n) >= cfg.createLimit) throw new HttpError(429, 'Too many links created recently — please try again later');
      const checked = await assertSafe(target);
      const editKey = newEditKey(), hash = await sha256hex(editKey);
      for (let attempt = 0; attempt < 6; attempt++) {
        const id = randomId(attempt < 3 ? 7 : 8);
        const rows = await q(
          `insert into links (id, target, edit_key_hash, creator_ip_hash, checked_at)
           values ($1, $2, $3, $4, ${checked ? 'now()' : 'null'})
           on conflict (id) do nothing returning *`,
          [id, target, hash, ip]
        );
        if (rows.length) return json({ ...summary(rows[0], base), editKey }, 201);
      }
      throw new HttpError(500, 'Could not allocate a short code');
    }

    if (path === '/api/links/lookup' && method === 'POST') {
      const body = await readJson(request);
      const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
      const wanted = items.filter((x) => x && typeof x.id === 'string' && ID_RE.test(x.id) && typeof x.key === 'string');
      if (!wanted.length) return json({ links: [], missing: [] });
      const rows = await q('select * from links where id = any($1)', [wanted.map((x) => x.id)]);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const links = [], missing = [];
      for (const it of wanted) {
        const r = byId.get(it.id);
        if (r && safeEqual(await sha256hex(it.key), r.edit_key_hash)) links.push(summary(r, base));
        else missing.push(it.id);
      }
      const d = links.length ? await daily(links.map((l) => l.id)) : {};
      links.forEach((l) => (l.scans.daily = d[l.id] || []));
      return json({ links, missing });
    }

    const m = path.match(/^\/api\/links\/([^/]+)$/);
    if (m) {
      const id = m[1];
      if (!ID_RE.test(id)) throw new HttpError(404, 'Link not found');
      if (method === 'GET') {
        const row = await authLink(request, id);
        const s = summary(row, base);
        const [d, countries, devices] = await Promise.all([
          daily([id]),
          q(`select coalesce(country, '??') as k, count(*)::int as n from scans where link_id = $1 group by 1 order by 2 desc limit 8`, [id]),
          q(`select coalesce(device, 'other') as k, count(*)::int as n from scans where link_id = $1 group by 1 order by 2 desc`, [id]),
        ]);
        s.scans.daily = d[id] || [];
        s.scans.countries = countries.map((r) => ({ key: r.k, n: Number(r.n) }));
        s.scans.devices = devices.map((r) => ({ key: r.k, n: Number(r.n) }));
        return json(s);
      }
      if (method === 'PATCH') {
        const row = await authLink(request, id);
        if (row.disabled) throw new HttpError(403, 'This link was disabled and can’t be edited');
        const body = await readJson(request);
        const target = validateTarget(body.target, selfHost);
        const checked = await assertSafe(target);
        const rows = await q(
          `update links set target = $2, updated_at = now()${checked ? ', checked_at = now()' : ''} where id = $1 returning *`,
          [id, target]
        );
        return json(summary(rows[0], base));
      }
      if (method === 'DELETE') {
        await authLink(request, id);
        await q('delete from links where id = $1', [id]);
        return json({ ok: true });
      }
      throw new HttpError(405, 'Method not allowed');
    }

    if (path === '/api/report' && method === 'POST') {
      const body = await readJson(request);
      if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(400, 'Unknown link');
      const ip = await ipHash(request);
      const [{ n }] = await q(`select count(*)::int as n from reports where reporter_ip_hash = $1 and created_at > now() - interval '1 hour'`, [ip]);
      if (Number(n) >= cfg.reportLimit) throw new HttpError(429, 'Too many reports — please try again later');
      const rows = await q(
        `insert into reports (link_id, reason, reporter_ip_hash) select id, $2, $3 from links where id = $1 returning id`,
        [body.id, String(body.reason || '').slice(0, 500), ip]
      );
      if (!rows.length) throw new HttpError(404, 'Link not found');
      return json({ ok: true }, 201);
    }

    throw new HttpError(404, 'Not found');
  }

  /* ---- admin (only exists when ADMIN_TOKEN is set) */
  async function admin(request, path, url, base) {
    if (!env.ADMIN_TOKEN) throw new HttpError(404, 'Not found');
    const tok = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!tok || !safeEqual(tok, env.ADMIN_TOKEN)) throw new HttpError(401, 'Unauthorized');
    const method = request.method;

    if (path === '/admin/links' && method === 'GET') {
      const search = (url.searchParams.get('q') || '').slice(0, 200);
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const rows = await q(
        `select l.*, (select count(*)::int from reports r where r.link_id = l.id and not r.resolved) as open_reports
           from links l
          where $1 = '' or l.id = $1 or l.target ilike '%' || $1 || '%'
          order by l.created_at desc limit $2`,
        [search, limit]
      );
      return json({ links: rows.map((r) => ({ ...summary(r, base), openReports: Number(r.open_reports) })) });
    }
    if (path === '/admin/reports' && method === 'GET') {
      const rows = await q(
        `select r.id, r.link_id, r.reason, r.created_at, l.target, l.disabled
           from reports r join links l on l.id = r.link_id
          where not r.resolved order by r.created_at desc limit 200`
      );
      return json({ reports: rows.map((r) => ({ id: Number(r.id), linkId: r.link_id, reason: r.reason, target: r.target, disabled: !!r.disabled, createdAt: iso(r.created_at) })) });
    }
    let m = path.match(/^\/admin\/links\/([^/]+)\/(disable|enable)$/);
    if (m && method === 'POST') {
      const body = await readJson(request);
      const off = m[2] === 'disable';
      const rows = await q(
        `update links set disabled = $2, disabled_reason = $3, updated_at = now() where id = $1 returning *`,
        [m[1], off, off ? String(body.reason || 'Disabled by admin').slice(0, 200) : null]
      );
      if (!rows.length) throw new HttpError(404, 'Link not found');
      if (off) await q('update reports set resolved = true where link_id = $1', [m[1]]);
      return json(summary(rows[0], base));
    }
    m = path.match(/^\/admin\/links\/([^/]+)$/);
    if (m && method === 'DELETE') {
      const rows = await q('delete from links where id = $1 returning id', [m[1]]);
      if (!rows.length) throw new HttpError(404, 'Link not found');
      return json({ ok: true });
    }
    m = path.match(/^\/admin\/reports\/(\d+)\/resolve$/);
    if (m && method === 'POST') {
      await q('update reports set resolved = true where id = $1', [Number(m[1])]);
      return json({ ok: true });
    }
    throw new HttpError(404, 'Not found');
  }

  /* ---- the redirect itself */
  async function redirect(request, ctx, id, preview) {
    let rows;
    try {
      rows = await q('select id, target, disabled from links where id = $1', [id]);
    } catch (e) {
      log.error('redirect lookup failed', e);
      return html(pageError(), 503);
    }
    if (!rows.length) return html(pageNotFound(cfg.site), 404);
    const link = rows[0];
    if (link.disabled) return html(pageDisabled(cfg.site), 410);
    if (preview) return html(pagePreview({ id, target: link.target, site: cfg.site }), 200, true);
    const ua = request.headers.get('User-Agent') || '';
    if (request.method === 'GET' && !BOT_RE.test(ua)) {
      const country = (request.cf && request.cf.country) || null;
      ctx.waitUntil(
        q(
          `with u as (update links set scan_count = scan_count + 1, last_scan_at = now() where id = $1 returning id)
           insert into scans (link_id, country, device) select id, $2, $3 from u`,
          [id, country, deviceOf(ua)]
        ).catch((e) => log.error('scan record failed', e))
      );
    }
    return new Response(null, {
      status: 302,
      headers: { Location: link.target, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' },
    });
  }

  /* ---- router */
  async function handle(request, ctx) {
    const url = new URL(request.url);
    const base = cfg.base || url.origin;
    const selfHost = new URL(base).hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = (request.headers.get('Origin') || '').replace(/\/+$/, '');

    if (path.startsWith('/api/') || path.startsWith('/admin/')) {
      const h = path.startsWith('/api/') ? cors(origin) : {};
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
      try {
        const res = path.startsWith('/api/') ? await api(request, path, base, selfHost) : await admin(request, path, url, base);
        for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
        return res;
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status, h);
        log.error('API error', e);
        return json({ error: 'Something went wrong — please try again' }, 500, h);
      }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    if (path === '/') return cfg.site ? Response.redirect(cfg.site, 302) : html(pageHome());
    if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
    const m = path.match(/^\/(?:r\/)?([^/+]+)(\+)?$/);
    if (m && ID_RE.test(m[1])) return redirect(request, ctx, m[1], !!m[2]);
    return html(pageNotFound(cfg.site), 404);
  }

  /* ---- daily maintenance (cron) */
  async function scheduled() {
    await q(`delete from scans where at < now() - make_interval(days => $1)`, [cfg.retentionDays]);
    const result = { pruned: true, checked: 0, disabled: [] };
    if (!env.SAFE_BROWSING_KEY) return result;
    const rows = await q(`select id, target from links where not disabled order by checked_at nulls first limit 500`);
    if (!rows.length) return result;
    const bad = await safeBrowsing([...new Set(rows.map((r) => r.target))]);
    if (!bad) return result;
    for (const r of rows) {
      if (bad.has(r.target)) {
        await q(`update links set disabled = true, disabled_reason = $2, updated_at = now() where id = $1`, [r.id, `Flagged by Google Safe Browsing (${bad.get(r.target)})`]);
        result.disabled.push(r.id);
      }
    }
    await q(`update links set checked_at = now() where id = any($1)`, [rows.map((r) => r.id)]);
    result.checked = rows.length;
    return result;
  }

  return {
    async fetch(request, ctx = { waitUntil() {} }) {
      try {
        return await handle(request, ctx);
      } catch (e) {
        log.error('Unhandled', e);
        return html(pageError(), 500);
      }
    },
    scheduled,
  };
}
