import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const BASE = 'https://go.test';
const quiet = { warn() {}, error() {}, log() {} };

let pg, app, pending, sbFlagged, sbCalls;
async function setup(env = {}) {
  pg = new PGlite();
  await pg.exec(schema);
  sbFlagged = new Map();
  sbCalls = 0;
  const fetcher = async (url, init) => {
    sbCalls++;
    const body = JSON.parse(init.body);
    const matches = body.threatInfo.threatEntries.filter((e) => sbFlagged.has(e.url)).map((e) => ({ threatType: sbFlagged.get(e.url), threat: { url: e.url } }));
    return new Response(JSON.stringify(matches.length ? { matches } : {}), { status: 200 });
  };
  app = createApp({
    db: { query: async (t, p) => (await pg.query(t, p)).rows },
    env: { PUBLIC_BASE: BASE, ALLOWED_ORIGINS: 'https://site.test', ADMIN_TOKEN: 'admintok', SITE_URL: 'https://site.test/', ...env },
    fetcher,
    log: quiet,
  });
}
async function call(method, path, { body, key, headers = {} } = {}) {
  pending = [];
  const h = { 'CF-Connecting-IP': '1.2.3.4', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (key) h.Authorization = 'Bearer ' + key;
  const res = await app.fetch(new Request(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  const type = res.headers.get('Content-Type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { res, status: res.status, data };
}
const create = (target, opts) => call('POST', '/api/links', { body: { target }, ...opts });

beforeEach(() => setup());

test('creates a link and normalises the destination', async () => {
  const { status, data } = await create('example.com/menu');
  assert.equal(status, 201);
  assert.match(data.id, /^[2-9a-zA-Z]{7}$/);
  assert.equal(data.shortUrl, `${BASE}/${data.id}`);
  assert.equal(data.target, 'https://example.com/menu');
  assert.ok(data.editKey.length >= 30);
  const [row] = (await pg.query('select edit_key_hash from links')).rows;
  assert.notEqual(row.edit_key_hash, data.editKey, 'key is stored hashed');
});

test('rejects unsafe or invalid destinations', async () => {
  for (const bad of ['', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'https://user:pw@example.com', 'http://localhost:3000', 'https://go.test/abc', 'x'.repeat(2100) + '.com']) {
    const { status, data } = await create(bad);
    assert.equal(status, 400, `expected 400 for ${bad.slice(0, 40)}: ${data.error}`);
  }
  assert.equal((await call('POST', '/api/links', { body: { target: 5 } })).status, 400);
  const raw = await app.fetch(new Request(BASE + '/api/links', { method: 'POST', body: 'not json' }));
  assert.equal(raw.status, 400);
});

test('redirects, counts real scans and ignores bots', async () => {
  const { data } = await create('https://example.com/a');
  let r = await call('GET', '/' + data.id, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
  assert.equal(r.status, 302);
  assert.equal(r.res.headers.get('Location'), 'https://example.com/a');
  assert.match(r.res.headers.get('Cache-Control'), /no-store/);
  await call('GET', '/r/' + data.id, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' } });
  await call('GET', '/' + data.id, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
  await call('HEAD', '/' + data.id, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)' } });
  const det = await call('GET', '/api/links/' + data.id, { key: data.editKey });
  assert.equal(det.status, 200);
  assert.equal(det.data.scans.total, 2);
  assert.deepEqual(det.data.scans.devices.map((d) => d.key).sort(), ['android', 'ios']);
  assert.equal(det.data.scans.daily.length, 1);
  assert.equal(det.data.scans.daily[0].n, 2);
});

test('unknown codes get a friendly 404 page', async () => {
  const r = await call('GET', '/zzzzzzz');
  assert.equal(r.status, 404);
  assert.match(r.data, /doesn’t exist/);
  assert.equal((await call('GET', '/not/a/link')).status, 404);
});

test('preview page escapes the destination', async () => {
  const { data } = await create('https://example.com/?q="><script>alert(1)</script>');
  const r = await call('GET', `/${data.id}+`);
  assert.equal(r.status, 200);
  assert.ok(!r.data.includes('<script>alert(1)'));
  assert.match(r.res.headers.get('Content-Security-Policy'), /default-src 'none'/);
});

test('only the edit key holder can view, edit or delete', async () => {
  const { data } = await create('https://example.com/old');
  assert.equal((await call('GET', '/api/links/' + data.id)).status, 401);
  assert.equal((await call('GET', '/api/links/' + data.id, { key: 'wrong' })).status, 403);
  assert.equal((await call('PATCH', '/api/links/' + data.id, { key: 'wrong', body: { target: 'evil.com' } })).status, 403);

  const up = await call('PATCH', '/api/links/' + data.id, { key: data.editKey, body: { target: 'https://example.com/new' } });
  assert.equal(up.status, 200);
  assert.equal(up.data.target, 'https://example.com/new');
  assert.equal((await call('GET', '/' + data.id)).res.headers.get('Location'), 'https://example.com/new');

  assert.equal((await call('DELETE', '/api/links/' + data.id, { key: 'wrong' })).status, 403);
  assert.equal((await call('DELETE', '/api/links/' + data.id, { key: data.editKey })).status, 200);
  assert.equal((await call('GET', '/' + data.id)).status, 404);
});

test('lookup returns only links the caller holds keys for', async () => {
  const a = (await create('https://a.example.com')).data;
  const b = (await create('https://b.example.com')).data;
  const r = await call('POST', '/api/links/lookup', { body: { items: [{ id: a.id, key: a.editKey }, { id: b.id, key: 'nope' }, { id: 'abcdefg', key: 'x' }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.links.map((l) => l.id), [a.id]);
  assert.deepEqual(r.data.missing.sort(), [b.id, 'abcdefg'].sort());
  assert.ok(Array.isArray(r.data.links[0].scans.daily));
});

test('rate limits link creation per IP', async () => {
  await setup({ CREATE_LIMIT_PER_HOUR: '3' });
  for (let i = 0; i < 3; i++) assert.equal((await create(`https://e${i}.example.com`)).status, 201);
  assert.equal((await create('https://e9.example.com')).status, 429);
  assert.equal((await create('https://e9.example.com', { headers: { 'CF-Connecting-IP': '5.6.7.8' } })).status, 201);
});

test('Safe Browsing blocks flagged destinations and the cron disables them later', async () => {
  await setup({ SAFE_BROWSING_KEY: 'k' });
  sbFlagged.set('https://phish.example.com/', 'SOCIAL_ENGINEERING');
  assert.equal((await create('https://phish.example.com/')).status, 422);
  const ok = (await create('https://fine.example.com/')).data;
  assert.equal((await call('PATCH', '/api/links/' + ok.id, { key: ok.editKey, body: { target: 'https://phish.example.com/' } })).status, 422);

  // destination becomes malicious after creation
  sbFlagged.set('https://fine.example.com/', 'MALWARE');
  const res = await app.scheduled();
  assert.deepEqual(res.disabled, [ok.id]);
  assert.equal((await call('GET', '/' + ok.id)).status, 410);
  const det = await call('GET', '/api/links/' + ok.id, { key: ok.editKey });
  assert.equal(det.data.disabled, true);
  assert.match(det.data.disabledReason, /MALWARE/);
  assert.equal((await call('PATCH', '/api/links/' + ok.id, { key: ok.editKey, body: { target: 'https://other.example.com' } })).status, 403);
});

test('Safe Browsing outages fail open', async () => {
  const flaky = createApp({
    db: { query: async (t, p) => (await pg.query(t, p)).rows },
    env: { PUBLIC_BASE: BASE, SAFE_BROWSING_KEY: 'k' },
    fetcher: async () => new Response('down', { status: 503 }),
    log: quiet,
  });
  const res = await flaky.fetch(new Request(BASE + '/api/links', { method: 'POST', body: JSON.stringify({ target: 'https://example.com' }) }));
  assert.equal(res.status, 201);
});

test('reports and admin moderation', async () => {
  const { data } = await create('https://sketchy.example.com');
  assert.equal((await call('POST', '/api/report', { body: { id: data.id, reason: 'phishing' } })).status, 201);
  assert.equal((await call('POST', '/api/report', { body: { id: 'abcdefg' } })).status, 404);

  assert.equal((await call('GET', '/admin/reports')).status, 401);
  const reps = await call('GET', '/admin/reports', { key: 'admintok' });
  assert.equal(reps.data.reports.length, 1);
  assert.equal(reps.data.reports[0].target, 'https://sketchy.example.com/');

  const list = await call('GET', '/admin/links?q=sketchy', { key: 'admintok' });
  assert.equal(list.data.links[0].openReports, 1);

  assert.equal((await call('POST', `/admin/links/${data.id}/disable`, { key: 'admintok', body: { reason: 'phishing' } })).status, 200);
  assert.equal((await call('GET', '/' + data.id)).status, 410);
  assert.equal((await call('GET', '/admin/reports', { key: 'admintok' })).data.reports.length, 0, 'disabling resolves reports');
  await call('POST', `/admin/links/${data.id}/enable`, { key: 'admintok', body: {} });
  assert.equal((await call('GET', '/' + data.id)).status, 302);
});

test('admin endpoints do not exist without ADMIN_TOKEN', async () => {
  await setup({ ADMIN_TOKEN: '' });
  assert.equal((await call('GET', '/admin/links', { key: '' })).status, 404);
});

test('CORS only echoes allowed origins', async () => {
  const ok = await call('OPTIONS', '/api/links', { headers: { Origin: 'https://site.test' } });
  assert.equal(ok.status, 204);
  assert.equal(ok.res.headers.get('Access-Control-Allow-Origin'), 'https://site.test');
  const bad = await call('POST', '/api/links', { body: { target: 'example.com' }, headers: { Origin: 'https://evil.test' } });
  assert.equal(bad.res.headers.get('Access-Control-Allow-Origin'), null);
});

test('root redirects to the site, health works, scans get pruned', async () => {
  const root = await call('GET', '/');
  assert.equal(root.status, 302);
  assert.equal(root.res.headers.get('Location'), 'https://site.test/');
  assert.deepEqual((await call('GET', '/api/health')).data, { ok: true });
  const { data } = await create('https://example.com');
  await call('GET', '/' + data.id);
  await pg.query(`update scans set at = now() - interval '500 days'`);
  await app.scheduled();
  assert.equal((await pg.query('select count(*)::int as n from scans')).rows[0].n, 0);
});
