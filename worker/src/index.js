// Cloudflare Worker entry point: wires the app to Neon over HTTP.
import { neon } from '@neondatabase/serverless';
import { createApp } from './app.js';

let cached = null;
function getApp(env) {
  if (!cached || cached.env !== env) {
    const sql = neon(env.DATABASE_URL);
    cached = { env, app: createApp({ db: { query: (text, params) => sql.query(text, params) }, env }) };
  }
  return cached.app;
}

export default {
  async fetch(request, env, ctx) {
    if (!env.DATABASE_URL) return new Response('DATABASE_URL is not configured', { status: 500 });
    return getApp(env).fetch(request, ctx);
  },
  async scheduled(event, env, ctx) {
    if (!env.DATABASE_URL) return;
    ctx.waitUntil(getApp(env).scheduled());
  },
};
