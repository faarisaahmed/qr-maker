// Small self-contained HTML pages served by the redirect service.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, body, script = '') {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f5f6fb;--card:#fff;--text:#0f172a;--muted:#64748b;--border:#e5e7ef;--accent:#6366f1}
@media (prefers-color-scheme:dark){:root{--bg:#0a0c12;--card:#12151f;--text:#e8eaf2;--muted:#8b93a7;--border:#232838;--accent:#818cf8}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:var(--bg);color:var(--text);font:15px/1.5 Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:28px;box-shadow:0 20px 50px -20px rgba(0,0,0,.25)}
h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:var(--muted)}
.url{word-break:break-all;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin:0 0 16px;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;color:var(--text)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:42px;padding:0 18px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:600;text-decoration:none;border:0;cursor:pointer;font-size:14px}
.btn.ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}
.row{display:flex;gap:8px;flex-wrap:wrap}details{margin-top:18px;color:var(--muted)}summary{cursor:pointer;font-size:13px}
textarea{width:100%;margin:10px 0;min-height:70px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);padding:8px;font:inherit}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:18px;color:var(--text);text-decoration:none}
.brand i{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:inline-block}
small{color:var(--muted)}
</style></head><body><main class="card">${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

const brand = (site) => (site ? `<a class="brand" href="${esc(site)}"><i></i>QR Studio</a>` : `<div class="brand"><i></i>QR Studio</div>`);

export const pageNotFound = (site) =>
  layout('Link not found', `${brand(site)}<h1>This link doesn’t exist</h1><p>The QR code may have been deleted by its owner, or the address was mistyped.</p>${site ? `<a class="btn" href="${esc(site)}">Make your own QR code</a>` : ''}`);

export const pageDisabled = (site) =>
  layout('Link disabled', `${brand(site)}<h1>This link has been disabled</h1><p>It was turned off because it may lead to harmful or abusive content.</p>${site ? `<a class="btn ghost" href="${esc(site)}">Go to QR Studio</a>` : ''}`);

export const pageError = () =>
  layout('Temporarily unavailable', `<h1>Temporarily unavailable</h1><p>Please try scanning again in a moment.</p>`);

export const pageHome = () =>
  layout('QR Studio links', `${brand('')}<h1>QR Studio link service</h1><p>This service powers editable QR codes.</p>`);

export function pagePreview({ id, target, site }) {
  const body = `${brand(site)}
<h1>Where this QR code goes</h1>
<p>You’re about to visit:</p>
<div class="url">${esc(target)}</div>
<div class="row"><a class="btn" href="${esc(target)}" rel="noopener noreferrer nofollow">Continue</a></div>
<details><summary>Report this link</summary>
<form id="rf"><textarea name="reason" maxlength="500" placeholder="What’s wrong with it? (phishing, malware, spam…)"></textarea>
<button class="btn ghost" type="submit">Send report</button> <small id="rs"></small></form></details>`;
  const script = `document.getElementById('rf').addEventListener('submit',async function(e){e.preventDefault();var s=document.getElementById('rs');s.textContent='Sending…';try{var r=await fetch('/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:${JSON.stringify(id)},reason:this.reason.value})});s.textContent=r.ok?'Thanks — we’ll take a look.':'Could not send the report.';}catch(_){s.textContent='Could not send the report.';}});`;
  return layout('Link preview', body, script);
}
