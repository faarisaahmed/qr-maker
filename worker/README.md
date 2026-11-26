# QR Studio — dynamic link service

This folder is the backend for **dynamic (editable) QR codes**. Each code contains a short link such as `https://go.yourdomain.com/Zn3bP6f`. When someone scans it, this service forwards them to the current destination, which the owner can change at any time, even after the code is printed. It also counts scans.

It runs as a **Cloudflare Worker** and stores data in **Neon Postgres**.

> **Status: built and tested, but not deployed.** The live site doesn't use it until you set `apiBase` in `js/config.js`. Until then QR Studio works as a plain static generator.

## How it works

```
phone scans QR ──► go.yourdomain.com/Zn3bP6f ──► Worker ──► Neon (lookup) ──► 302 redirect to destination
QR Studio site ──► /api/links (create / edit / stats) ──► Worker ──► Neon
```

- **No accounts.** Creating a link returns a secret *edit key*. Only a SHA-256 hash of it is stored in the database. The browser keeps the key, and users can back it up or restore it from the **My links** tab.
- **Privacy.** Each scan stores only the time, a 2-letter country code and a device type (iOS, Android, desktop or other). No IP addresses are stored. Creator IPs are kept only as salted hashes, for rate limiting.
- **Abuse protection:**
  - Only `http`/`https` destinations are allowed, and URLs with embedded passwords are rejected.
  - Each IP can create a limited number of links per hour.
  - Destinations are checked with Google Safe Browsing when a link is created or edited, and again every day.
  - Adding `+` to any link (`/Zn3bP6f+`) shows a preview page with a **Report** button.
  - Admin endpoints let you disable links.
- **Daily cron.** It deletes scan logs older than `SCAN_RETENTION_DAYS` and re-checks up to 500 links per day with Safe Browsing.

## Try it locally (no accounts needed)

```sh
cd worker
npm install
npm test            # 14 tests against a real (in-memory) Postgres
npm run dev:local   # service on http://localhost:8787, in-memory DB
```

Then, in another terminal, serve the site from the repo root (`python3 -m http.server 8000`). Temporarily set `apiBase: 'http://localhost:8787'` in `js/config.js` and open http://localhost:8000. Remember to set it back to `''` before you commit.

## Going live (when you're ready)

You'll need a free [Cloudflare](https://dash.cloudflare.com) account and your Neon database. A custom domain is strongly recommended. See the note at the bottom.

**1. Create the tables in Neon**

Copy the connection string from the Neon console (Dashboard → Connect), then run:

```sh
cd worker
npm install
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require" npm run db:migrate
```

**2. Log in to Cloudflare and add secrets**

```sh
npx wrangler login
npx wrangler secret put DATABASE_URL       # paste the Neon connection string
npx wrangler secret put IP_SALT            # any long random string
npx wrangler secret put ADMIN_TOKEN        # long random string (for moderation)
npx wrangler secret put SAFE_BROWSING_KEY  # optional but recommended, see below
```

To generate a random string, run `openssl rand -base64 32`.

**3. Check `wrangler.toml`**

- `SITE_URL`: where QR Studio lives.
- `ALLOWED_ORIGINS`: the site's origin, for example `https://faarisaahmed.github.io`.
- If you have a domain on Cloudflare, uncomment `routes` and set `PUBLIC_BASE`, for example `https://go.yourdomain.com`.

**4. Deploy**

```sh
npm run deploy
curl https://<your-worker-or-domain>/api/health    # → {"ok":true}
```

**5. Switch it on in the site**

In `js/config.js`, set:

```js
window.QR_CONFIG = { apiBase: 'https://go.yourdomain.com' };
```

Commit and push. GitHub Pages republishes, and the **Dynamic link** toggle and **My links** tab appear.

## Google Safe Browsing key (recommended)

1. In the Google Cloud console, create a project and enable the **Safe Browsing API**.
2. Under **APIs & Services → Credentials**, create an API key.
3. Store it with `npx wrangler secret put SAFE_BROWSING_KEY`.

If the key is missing, the check is skipped. If Google is down, links are still allowed, and the daily cron checks them later. The Safe Browsing Lookup API is for non-commercial use. If you start charging for the service, switch to Google's **Web Risk API**.

## Moderation (admin API)

Every request needs `Authorization: Bearer $ADMIN_TOKEN`. These endpoints don't exist unless `ADMIN_TOKEN` is set.

| Request | What it does |
| --- | --- |
| `GET /admin/reports` | Open abuse reports |
| `GET /admin/links?q=text&limit=50` | Search links by code or destination |
| `POST /admin/links/:id/disable` `{"reason":"phishing"}` | Turn a link off. Scans show a "disabled" page and the reports are resolved. |
| `POST /admin/links/:id/enable` | Turn it back on |
| `DELETE /admin/links/:id` | Delete permanently |
| `POST /admin/reports/:id/resolve` | Dismiss a report |

Example:

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://go.yourdomain.com/admin/reports
```

## Public API (used by the site)

| Request | Auth | |
| --- | --- | --- |
| `POST /api/links` `{"target":"example.com"}` | none (rate limited) | Returns `id`, `shortUrl`, `editKey` |
| `GET /api/links/:id` | `Bearer <editKey>` | Destination plus stats (30-day daily counts, countries, devices) |
| `PATCH /api/links/:id` `{"target":"…"}` | `Bearer <editKey>` | Change the destination |
| `DELETE /api/links/:id` | `Bearer <editKey>` | Delete the link |
| `POST /api/links/lookup` `{"items":[{"id","key"}]}` | keys in body | Summaries for many links at once |
| `POST /api/report` `{"id","reason"}` | none (rate limited) | Report abuse |
| `GET /:id` or `/r/:id` | none | The redirect (302) |
| `GET /:id+` | none | Preview page with a report button |

## Settings

| Name | Kind | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | secret | — | Neon connection string (required) |
| `IP_SALT` | secret | — | Salt for hashing IPs (required in production) |
| `ADMIN_TOKEN` | secret | — | Enables `/admin/*` |
| `SAFE_BROWSING_KEY` | secret | — | Enables Safe Browsing checks |
| `SITE_URL` | var | — | `/` redirects here |
| `ALLOWED_ORIGINS` | var | `*` | Comma-separated origins allowed to call the API |
| `PUBLIC_BASE` | var | Worker URL | Base of the short links |
| `CREATE_LIMIT_PER_HOUR` | var | `30` | New links per IP per hour |
| `SCAN_RETENTION_DAYS` | var | `395` | How long individual scan records are kept |
| `BLOCKED_HOSTS` | var | — | Domains that can never be destinations |

## Before you launch: the domain matters

Every printed dynamic code permanently contains your short-link domain. If you launch on `*.workers.dev` and move to your own domain later, codes that are already printed keep pointing at the old address. So:

- Wait until you have a domain you'll keep for years. A short subdomain like `go.yourdomain.com` works well.
- Keep the domain renewed and the Worker running. If either stops, every dynamic code stops working.
- Free plans are plenty to start. Cloudflare Workers allows 100k requests per day, and Neon's free tier handles a lot of links.
