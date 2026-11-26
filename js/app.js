/* QR Studio — UI controller */
(function () {
  'use strict';

  const R = window.QRRender;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const KEY_STATE = 'qrstudio:state:v1', KEY_SAVED = 'qrstudio:saved:v1', KEY_THEME = 'qrstudio:theme', KEY_LINKS = 'qrstudio:links:v1';
  // Dynamic links are only enabled when js/config.js points at a link service.
  const API = String((window.QR_CONFIG && window.QR_CONFIG.apiBase) || '').trim().replace(/\/+$/, '');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  };

  /* ================================================================ state */
  const DEFAULTS = {
    type: 'url',
    data: {
      url: 'https://example.com', text: '',
      wifiSsid: '', wifiPass: '', wifiEnc: 'WPA', wifiHidden: false,
      email: '', emailSubject: '', emailBody: '',
      phone: '', smsPhone: '', smsMsg: '',
      vFirst: '', vLast: '', vOrg: '', vTitle: '', vPhone: '', vEmail: '', vUrl: '', vAddress: '',
      lat: '', lng: '',
      evTitle: '', evStart: '', evEnd: '', evLocation: '', evDesc: '',
      waPhone: '', waMsg: '',
      dynamic: false, dynId: '', dynShort: '',
    },
    ec: 'auto',
    margin: 2,
    body: 'rounded',
    eyeOuter: 'rounded',
    eyeInner: 'rounded',
    fg: { mode: 'solid', c1: '#111827', c2: '#6366f1', angle: 45 },
    eyes: { custom: false, outer: '#6366f1', inner: '#111827' },
    bg: { mode: 'solid', c1: '#ffffff', c2: '#e0e7ff', angle: 135 },
    logo: { kind: 'none', src: '', icon: 'link', iconColor: '#111827', size: 0.22, padding: 0.6, shape: 'circle', bgColor: '#ffffff', clear: true },
    frame: { style: 'none', text: 'SCAN ME', color: '#111827', textColor: '#ffffff', font: 'sans' },
    fx: { radius: 0, shadow: false, shadowColor: '#0f172a', shadowBlur: 24, shadowY: 14, shadowOpacity: 0.25, glow: false, glowColor: '#22d3ee', glowSize: 4, depth: false, depthColor: '#94a3b8', depthSize: 3 },
    out: { size: 1024, name: 'qr-code' },
  };
  const STYLE_KEYS = ['body', 'eyeOuter', 'eyeInner', 'fg', 'eyes', 'bg', 'frame', 'fx'];
  const ids = (list) => list.map((x) => x[0]);
  const ENUMS = {
    type: ['url', 'text', 'wifi', 'email', 'phone', 'sms', 'vcard', 'location', 'event', 'whatsapp'],
    ec: ['auto', 'L', 'M', 'Q', 'H'],
    body: ids(R.BODY_SHAPES), eyeOuter: ids(R.EYE_OUTER), eyeInner: ids(R.EYE_INNER),
    'fg.mode': ['solid', 'linear', 'radial'], 'bg.mode': ['solid', 'linear', 'radial', 'transparent'],
    'logo.kind': ['none', 'icon', 'image'], 'logo.icon': R.LOGO_ICONS, 'logo.shape': ['circle', 'square', 'none'],
    'frame.style': ids(R.FRAMES), 'frame.font': Object.keys(R.FONTS), 'data.wifiEnc': ['WPA', 'WEP', 'nopass'],
  };
  const COLOR_KEYS = ['fg.c1', 'fg.c2', 'eyes.outer', 'eyes.inner', 'bg.c1', 'bg.c2', 'logo.iconColor', 'logo.bgColor', 'frame.color', 'frame.textColor', 'fx.shadowColor', 'fx.glowColor', 'fx.depthColor'];

  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => {
    const ks = p.split('.'), last = ks.pop();
    ks.reduce((a, k) => a[k], o)[last] = v;
  };
  function merge(def, src) {
    const out = {};
    for (const k of Object.keys(def)) {
      const d = def[k], s = src && typeof src === 'object' ? src[k] : undefined;
      if (d && typeof d === 'object') out[k] = merge(d, s);
      else if (typeof s === typeof d && !(typeof d === 'number' && !isFinite(s))) out[k] = s;
      else out[k] = d;
    }
    return out;
  }
  function sanitize(src) {
    const s = merge(DEFAULTS, src);
    for (const [p, allowed] of Object.entries(ENUMS)) if (!allowed.includes(getPath(s, p))) setPath(s, p, getPath(DEFAULTS, p));
    for (const p of COLOR_KEYS) if (!HEX.test(getPath(s, p))) setPath(s, p, getPath(DEFAULTS, p));
    if (!/^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/.test(s.logo.src)) {
      s.logo.src = '';
      if (s.logo.kind === 'image') s.logo.kind = 'none';
    }
    s.out.size = Math.min(4096, Math.max(128, s.out.size));
    return s;
  }
  function diff(obj, def) {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (obj[k] && typeof obj[k] === 'object') {
        const d = diff(obj[k], def[k] || {});
        if (Object.keys(d).length) out[k] = d;
      } else if (obj[k] !== def[k]) out[k] = obj[k];
    }
    return out;
  }

  let S = sanitize(safeParse(store.get(KEY_STATE)));
  function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  /* ============================================================== content */
  const vEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const wEsc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');
  const icsDate = (v) => (v ? v.replace(/[-:]/g, '').slice(0, 13) + '00' : '');
  const digits = (v) => String(v).replace(/[^\d+]/g, '');

  function buildContent(st) {
    const d = st.data;
    switch (st.type) {
      case 'url': {
        if (API && d.dynamic) return d.dynShort || '';
        let u = d.url.trim();
        if (!u) return '';
        if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
        return u;
      }
      case 'text': return d.text;
      case 'wifi':
        if (!d.wifiSsid) return '';
        return `WIFI:T:${d.wifiEnc};S:${wEsc(d.wifiSsid)};${d.wifiEnc !== 'nopass' ? `P:${wEsc(d.wifiPass)};` : ''}${d.wifiHidden ? 'H:true;' : ''};`;
      case 'email': {
        if (!d.email.trim()) return '';
        const q = [];
        if (d.emailSubject) q.push('subject=' + encodeURIComponent(d.emailSubject));
        if (d.emailBody) q.push('body=' + encodeURIComponent(d.emailBody));
        return `mailto:${d.email.trim()}${q.length ? '?' + q.join('&') : ''}`;
      }
      case 'phone': return digits(d.phone) ? 'tel:' + digits(d.phone) : '';
      case 'sms': return digits(d.smsPhone) || d.smsMsg ? `SMSTO:${digits(d.smsPhone)}:${d.smsMsg}` : '';
      case 'vcard': {
        const has = ['vFirst', 'vLast', 'vOrg', 'vPhone', 'vEmail', 'vUrl'].some((k) => d[k].trim());
        if (!has) return '';
        const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(d.vLast)};${vEsc(d.vFirst)};;;`, `FN:${vEsc([d.vFirst, d.vLast].filter(Boolean).join(' ') || d.vOrg)}`];
        if (d.vOrg) L.push('ORG:' + vEsc(d.vOrg));
        if (d.vTitle) L.push('TITLE:' + vEsc(d.vTitle));
        if (d.vPhone) L.push('TEL;TYPE=CELL:' + d.vPhone.trim());
        if (d.vEmail) L.push('EMAIL:' + d.vEmail.trim());
        if (d.vUrl) L.push('URL:' + d.vUrl.trim());
        if (d.vAddress) L.push('ADR:;;' + vEsc(d.vAddress) + ';;;;');
        L.push('END:VCARD');
        return L.join('\n');
      }
      case 'location': {
        const lat = parseFloat(d.lat), lng = parseFloat(d.lng);
        if (!isFinite(lat) || !isFinite(lng)) return '';
        return `https://maps.google.com/?q=${lat},${lng}`;
      }
      case 'event': {
        if (!d.evTitle.trim()) return '';
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'SUMMARY:' + vEsc(d.evTitle)];
        if (d.evStart) L.push('DTSTART:' + icsDate(d.evStart));
        if (d.evEnd) L.push('DTEND:' + icsDate(d.evEnd));
        if (d.evLocation) L.push('LOCATION:' + vEsc(d.evLocation));
        if (d.evDesc) L.push('DESCRIPTION:' + vEsc(d.evDesc));
        L.push('END:VEVENT', 'END:VCALENDAR');
        return L.join('\n');
      }
      case 'whatsapp': {
        const n = digits(d.waPhone).replace(/^\+/, '');
        if (!n) return '';
        return `https://wa.me/${n}${d.waMsg ? '?text=' + encodeURIComponent(d.waMsg) : ''}`;
      }
    }
    return '';
  }

  /* ============================================================== presets */
  const PRESETS = [
    { name: 'Classic', body: 'square', eyeOuter: 'square', eyeInner: 'square', fg: { c1: '#000000' } },
    { name: 'Soft ink', body: 'rounded', eyeOuter: 'rounded', eyeInner: 'rounded', fg: { c1: '#111827' } },
    { name: 'Ocean', body: 'dots', eyeOuter: 'squircle', eyeInner: 'circle', fg: { mode: 'linear', c1: '#0ea5e9', c2: '#4f46e5', angle: 45 } },
    { name: 'Sunset', body: 'fluid', eyeOuter: 'leaf', eyeInner: 'leaf', fg: { mode: 'linear', c1: '#f97316', c2: '#db2777', angle: 135 }, bg: { c1: '#fff7ed' }, frame: { style: 'pill', color: '#db2777', textColor: '#ffffff' }, fx: { radius: 60 } },
    { name: 'Forest', body: 'classy', eyeOuter: 'leaf', eyeInner: 'leaf', fg: { c1: '#14532d' }, bg: { c1: '#f0fdf4' }, frame: { style: 'label-bottom', color: '#166534', textColor: '#ffffff' }, fx: { radius: 48 } },
    { name: 'Neon', body: 'dots', eyeOuter: 'circle', eyeInner: 'circle', fg: { c1: '#67e8f9' }, eyes: { custom: true, outer: '#f0abfc', inner: '#f0abfc' }, bg: { c1: '#0b1020' }, fx: { glow: true, glowColor: '#22d3ee', glowSize: 3, radius: 60 } },
    { name: 'Candy', body: 'soft', eyeOuter: 'rounded', eyeInner: 'heart', fg: { mode: 'radial', c1: '#ec4899', c2: '#7c3aed' }, bg: { c1: '#fdf2f8' }, frame: { style: 'bubble', color: '#db2777', textColor: '#ffffff', font: 'rounded' }, fx: { radius: 60 } },
    { name: 'Lines', body: 'vlines', eyeOuter: 'rounded', eyeInner: 'rounded', fg: { c1: '#1e293b' } },
    { name: 'Royal', body: 'diamond', eyeOuter: 'square', eyeInner: 'diamond', fg: { c1: '#3b0764' }, eyes: { custom: true, outer: '#b45309', inner: '#3b0764' }, bg: { c1: '#fffbeb' }, frame: { style: 'border', color: '#b45309' }, fx: { radius: 24 } },
    { name: 'Midnight', body: 'rounded', eyeOuter: 'squircle', eyeInner: 'rounded', fg: { c1: '#e0e7ff' }, bg: { mode: 'linear', c1: '#1e1b4b', c2: '#312e81', angle: 135 }, frame: { style: 'label-bottom', color: '#4f46e5', textColor: '#ffffff' }, fx: { radius: 56, shadow: true } },
    { name: 'Retro', body: 'square', eyeOuter: 'square', eyeInner: 'square', fg: { c1: '#7c2d12' }, bg: { c1: '#fef3c7' }, frame: { style: 'corners', color: '#7c2d12', font: 'mono' }, fx: { depth: true, depthColor: '#f59e0b', depthSize: 4 } },
    { name: 'Bubbles', body: 'random', eyeOuter: 'circle', eyeInner: 'circle', fg: { mode: 'radial', c1: '#0891b2', c2: '#1d4ed8' }, frame: { style: 'circle', color: '#0e7490', textColor: '#ffffff' } },
    { name: 'Stamp', body: 'tiny', eyeOuter: 'dotted', eyeInner: 'circle', fg: { c1: '#b91c1c' }, bg: { c1: '#fff1f2' }, frame: { style: 'circle', color: '#b91c1c', textColor: '#fff1f2', font: 'serif' } },
    { name: 'Mint', body: 'leaf', eyeOuter: 'drop', eyeInner: 'drop', fg: { mode: 'linear', c1: '#0f766e', c2: '#059669', angle: 90 }, bg: { c1: '#ecfdf5' }, fx: { radius: 80, shadow: true, shadowColor: '#065f46', shadowOpacity: 0.2 } },
    { name: 'Paper', body: 'plus', eyeOuter: 'rounded', eyeInner: 'square', fg: { c1: '#292524' }, bg: { c1: '#fafaf9' }, frame: { style: 'label-top', color: '#292524', textColor: '#fafaf9', font: 'script', text: 'Scan me' } },
    { name: 'Gold', body: 'fluid', eyeOuter: 'squircle', eyeInner: 'circle', fg: { mode: 'linear', c1: '#fde047', c2: '#d97706', angle: 60 }, bg: { c1: '#111111' }, frame: { style: 'border', color: '#ca8a04' }, fx: { radius: 40 } },
  ];
  const PALETTES = [
    ['#111827', '#4b5563', '#ffffff'], ['#0ea5e9', '#4f46e5', '#ffffff'], ['#f97316', '#db2777', '#fff7ed'],
    ['#15803d', '#0d9488', '#f0fdf4'], ['#7c3aed', '#db2777', '#faf5ff'], ['#67e8f9', '#c4b5fd', '#0b1020'],
    ['#be123c', '#7f1d1d', '#fff1f2'], ['#0f766e', '#155e75', '#ecfeff'], ['#1e3a8a', '#2563eb', '#eff6ff'],
    ['#78350f', '#b45309', '#fffbeb'], ['#fafafa', '#d4d4d8', '#18181b'], ['#fde047', '#f59e0b', '#1c1917'],
  ];
  const FRAME_TEXTS = ['SCAN ME', 'Scan to visit', 'Scan for menu', 'Join Wi‑Fi', 'Follow us', 'Leave a review', 'Pay here', 'Get the app'];

  function applyStyle(p) {
    const base = clone(DEFAULTS), keepText = S.frame.text;
    for (const k of STYLE_KEYS) S[k] = base[k] && typeof base[k] === 'object' ? Object.assign(base[k], clone(p[k] || {})) : p[k] != null ? p[k] : base[k];
    if (!(p.frame && p.frame.text)) S.frame.text = keepText;
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function surprise() {
    const pal = pick(PALETTES), grad = Math.random() < 0.55;
    const style = {
      body: pick(ids(R.BODY_SHAPES).filter((x) => !['heart', 'star', 'plus'].includes(x))),
      eyeOuter: pick(ids(R.EYE_OUTER)),
      eyeInner: pick(ids(R.EYE_INNER).filter((x) => x !== 'heart')),
      fg: { mode: grad ? pick(['linear', 'radial']) : 'solid', c1: pal[0], c2: pal[1], angle: pick([0, 45, 90, 135]) },
      bg: { c1: pal[2] },
      eyes: Math.random() < 0.3 ? { custom: true, outer: pal[1], inner: pal[0] } : {},
      fx: { radius: pick([0, 24, 48, 80]) },
      frame: Math.random() < 0.45 ? { style: pick(ids(R.FRAMES).slice(1)), color: pal[0], textColor: pal[2], font: pick(['sans', 'sans', 'rounded', 'serif']) } : {},
    };
    applyStyle(style);
    commitNow();
    afterChange();
  }

  /* ============================================================ rendering */
  let lastBuild = null, lastText = '';
  const CAP = { L: 2953, M: 2331, Q: 1663, H: 1273 };
  const utf8Len = (s) => new TextEncoder().encode(s).length;

  function render() {
    const text = buildContent(S);
    const stage = $('#qr');
    const meter = $('#dataMeter');
    const bytes = utf8Len(text);
    lastText = text;
    if (!text) {
      lastBuild = null;
      const dynPending = API && S.type === 'url' && S.data.dynamic;
      stage.innerHTML = `<div class="placeholder">${R.iconSVG(dynPending ? 'zap' : 'grid', 36)}<div>${dynPending ? 'Click <strong>Create dynamic link</strong> to generate your code' : 'Fill in the details to create your QR code'}</div></div>`;
      $('#qrInfo').textContent = '';
      setBadge('');
      $('#warnings').innerHTML = '';
      meter.hidden = true;
      setDownloads(false);
      return;
    }
    try {
      lastBuild = R.build(S, text);
    } catch (e) {
      lastBuild = null;
      stage.innerHTML = `<div class="placeholder error">${R.iconSVG('alert', 36)}<div><strong>Too much content</strong><br>Shorten it or lower the error correction level.</div></div>`;
      $('#qrInfo').textContent = `${bytes} bytes`;
      setBadge('');
      setDownloads(false);
      updateMeter(bytes, effectiveEc());
      return;
    }
    stage.innerHTML = lastBuild.svg;
    const svg = stage.firstChild;
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR code preview');
    $('#qrInfo').textContent = `Version ${lastBuild.version} · ${lastBuild.n}×${lastBuild.n} · EC ${lastBuild.ec}`;
    updateMeter(bytes, lastBuild.ec);
    renderWarnings();
    setDownloads(true);
    scheduleScan();
  }
  const effectiveEc = () => (S.ec !== 'auto' ? S.ec : S.logo.kind !== 'none' ? 'H' : 'M');
  function updateMeter(bytes, ec) {
    const meter = $('#dataMeter'), cap = CAP[ec] || CAP.M, pct = Math.min(100, (bytes / cap) * 100);
    meter.hidden = false;
    const bar = $('.meter-bar span', meter);
    bar.style.width = Math.max(2, pct) + '%';
    bar.style.background = pct > 90 ? 'var(--danger)' : pct > 55 ? 'var(--warn)' : 'var(--ok)';
    $('small', meter).textContent = `${bytes.toLocaleString()} / ${cap.toLocaleString()} bytes`;
  }
  function setDownloads(on) {
    $$('[data-dl], #copyBtn, #printBtn, #quickSaveBtn').forEach((b) => (b.disabled = !on));
  }
  let raf = 0;
  const scheduleRender = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

  /* ---- scan verification (decodes the real rendered image with jsQR) */
  let scanTimer = 0, scanSeq = 0;
  function setBadge(state) {
    const b = $('#scanBadge');
    b.className = 'badge ' + state;
    b.hidden = !state;
    const map = {
      checking: ['loader', 'Checking scan…'],
      ok: ['check', 'Scan test passed'],
      fail: ['alert', "Couldn't verify — test with a phone"],
    };
    if (map[state]) b.innerHTML = R.iconSVG(map[state][0], 14) + map[state][1];
  }
  function scheduleScan() {
    setBadge('checking');
    clearTimeout(scanTimer);
    scanTimer = setTimeout(runScan, 450);
  }
  async function runScan() {
    if (!lastBuild) return;
    if (!window.jsQR) { scanTimer = setTimeout(runScan, 300); return; }
    const seq = ++scanSeq, text = lastText;
    const b0 = lastBuild;
    // Render once at ~10px per module, then try a few camera-like variants
    // (smaller + slightly blurred), since real phone cameras never see a
    // pixel-perfect image and decorative shapes decode better that way.
    const sizeFor = (ppm) => Math.round(Math.min(2400, Math.max(200, ((b0.quiet * ppm) / 1000) * b0.width)));
    const W = sizeFor(10), H = Math.round((W * b0.height) / b0.width);
    try {
      const b = R.build(S, text, { width: W });
      const src = await R.svgToCanvas(b.svg, W, H, '#ffffff');
      const attempts = [[10, 0], [5, 0], [5, 1], [7, 1.4], [10, 2], [6, 2], [10, 3.3]];
      let ok = false;
      for (const [ppm, blur] of attempts) {
        if (seq !== scanSeq) return;
        const w = sizeFor(ppm), h = Math.round((w * H) / W);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        if (blur) ctx.filter = `blur(${blur}px)`;
        ctx.drawImage(src, 0, 0, w, h);
        const res = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        if (res && (res.data === text || (res.binaryData && res.binaryData.length === utf8Len(text)))) { ok = true; break; }
        await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
      }
      if (seq !== scanSeq) return;
      setBadge(ok ? 'ok' : 'fail');
    } catch (e) {
      if (seq === scanSeq) setBadge('');
    }
  }

  /* ---- warnings */
  function lum(hex) {
    let h = hex.slice(1);
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const ch = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function renderWarnings() {
    const w = [];
    const fgs = [S.fg.c1].concat(S.fg.mode !== 'solid' ? [S.fg.c2] : []).concat(S.eyes.custom ? [S.eyes.outer, S.eyes.inner] : []);
    if (S.bg.mode !== 'transparent') {
      const bgs = [S.bg.c1].concat(S.bg.mode !== 'solid' ? [S.bg.c2] : []);
      let min = Infinity, inverted = false;
      fgs.forEach((f) => bgs.forEach((b) => { min = Math.min(min, contrast(f, b)); if (lum(f) > lum(b)) inverted = true; }));
      if (min < 2.5) w.push('Low contrast between the code and background — it may not scan reliably.');
      else if (inverted) w.push('Light code on a dark background works on most phones, but some older scanners struggle.');
    } else {
      w.push(lum(S.fg.c1) > 0.4 ? 'Transparent background with a light code — place it on a dark, plain surface.' : 'Transparent background — place it on a light, plain surface.');
    }
    if (['heart', 'star'].includes(S.body)) w.push('Hearts and stars are decorative and harder to scan — test before printing.');
    if (S.logo.kind !== 'none' && ['L', 'M'].includes(S.ec)) w.push('Logos cover part of the code. Use error correction Q or H (or Auto).');
    if (S.logo.kind !== 'none' && S.logo.size > 0.29) w.push('That’s a big logo — double-check the code scans before printing.');
    if (S.margin < 2 && S.frame.style === 'none') w.push('A quiet zone smaller than 2 can make scanning harder.');
    $('#warnings').innerHTML = w.map((t) => `<li>${R.iconSVG('alert', 15)}<span>${t}</span></li>`).join('');
  }

  /* ============================================================ binding */
  const fmt = (v, t) => {
    switch (t) {
      case 'px': return v + ' px';
      case 'deg': return v + '°';
      case 'pct': return Math.round(v * 100) + '%';
      case 'mod': return v + (v === 1 ? ' module' : ' modules');
      case 'dec': return Number(v).toFixed(1);
      default: return String(v);
    }
  };
  const toHex6 = (v) => {
    if (!HEX.test(v)) return '#000000';
    let h = v.slice(1);
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    return '#' + h.slice(0, 6).toLowerCase();
  };
  function evalShow(expr) {
    let neg = false;
    if (expr[0] === '!') { neg = true; expr = expr.slice(1); }
    const m = expr.match(/^([\w.]+)(!=|=)(.+)$/);
    let res;
    if (!m) res = !!getPath(S, expr);
    else {
      const v = String(getPath(S, m[1])), opts = m[3].split('|');
      res = m[2] === '=' ? opts.includes(v) : !opts.includes(v);
    }
    return neg ? !res : res;
  }
  function setRangeFill(el) {
    const p = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--p', p + '%');
  }
  function syncUI(except) {
    $$('[data-bind]').forEach((el) => {
      if (el === except) return;
      const v = getPath(S, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'color') el.value = toHex6(v);
      else if (el.classList.contains('hex')) { if (document.activeElement !== el) el.value = String(v).toUpperCase(); }
      else if (el.value !== String(v ?? '')) el.value = v ?? '';
      if (el.type === 'range') setRangeFill(el);
    });
    $$('[data-choice]').forEach((g) => {
      const v = String(getPath(S, g.dataset.choice));
      $$('[data-value]', g).forEach((b) => {
        const on = b.dataset.value === v;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on);
      });
    });
    $$('[data-out]').forEach((o) => (o.textContent = fmt(getPath(S, o.dataset.out), o.dataset.fmt)));
    $$('[data-show]').forEach((el) => (el.hidden = !evalShow(el.dataset.show)));
    const img = $('#logoPreview');
    if (S.logo.src) { if (img.getAttribute('src') !== S.logo.src) img.src = S.logo.src; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }
    $('#logoRemove').hidden = !S.logo.src;
    if (API) syncDyn();
    $('#undoBtn').disabled = hist.i <= 0;
    $('#redoBtn').disabled = hist.i >= hist.stack.length - 1;
  }

  /* ---- history + persistence */
  const hist = { stack: [JSON.stringify(S)], i: 0 };
  let commitTimer = 0, saveTimer = 0;
  function commitNow() {
    clearTimeout(commitTimer);
    const js = JSON.stringify(S);
    if (js === hist.stack[hist.i]) return;
    hist.stack = hist.stack.slice(0, hist.i + 1);
    hist.stack.push(js);
    if (hist.stack.length > 80) hist.stack.shift();
    hist.i = hist.stack.length - 1;
  }
  function afterChange(src) {
    syncUI(src);
    scheduleRender();
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => { commitNow(); syncUI(document.activeElement); }, 450);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!store.set(KEY_STATE, JSON.stringify(S))) {
        const s = clone(S); s.logo.src = ''; store.set(KEY_STATE, JSON.stringify(s));
      }
    }, 300);
    if (activeTab === 'frame') scheduleFrameThumbs();
  }
  function undo() {
    commitNow();
    if (hist.i <= 0) return;
    S = JSON.parse(hist.stack[--hist.i]);
    afterChange();
  }
  function redo() {
    if (hist.i >= hist.stack.length - 1) return;
    S = JSON.parse(hist.stack[++hist.i]);
    afterChange();
  }
  function update(path, v, src) {
    setPath(S, path, v);
    afterChange(src);
  }

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-bind]');
    if (!el || el.type === 'checkbox') return;
    let v;
    if (el.type === 'range' || el.type === 'number') v = parseFloat(el.value);
    else if (el.classList.contains('hex')) {
      let t = el.value.trim();
      if (t && t[0] !== '#') t = '#' + t;
      if (!HEX.test(t)) return;
      v = t.toLowerCase();
    } else v = el.value;
    update(el.dataset.bind, v, el);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-bind]');
    if (el && el.type === 'checkbox') update(el.dataset.bind, el.checked, el);
    if (el && el.classList.contains('hex')) el.value = String(getPath(S, el.dataset.bind)).toUpperCase(); // normalise on blur
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-choice] [data-value]');
    if (!btn) return;
    const group = btn.closest('[data-choice]');
    update(group.dataset.choice, btn.dataset.value);
    if (group.dataset.choice === 'logo.kind' && btn.dataset.value === 'image' && !S.logo.src) $('#logoFile').click();
  });

  /* ============================================================== tabs */
  let activeTab = 'content';
  function showTab(name) {
    activeTab = name;
    $$('.tabs [data-tab]').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    $$('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === name));
    if (name === 'templates') renderPresets();
    if (name === 'frame') renderFrameThumbs();
    if (name === 'saved') renderSaved();
    if (name === 'links') refreshLinks();
    try { sessionStorage.setItem('qrstudio:tab', name); } catch (e) {}
    if (window.innerWidth <= 820) {
      const tabs = $('.tabs');
      const top = tabs.getBoundingClientRect().top + window.scrollY - 60;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
    }
  }
  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
    showTab(b.dataset.tab);
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }));

  /* ============================================================ thumbnails */
  const demoText = () => lastText || 'https://example.com';
  function renderPresets() {
    const text = demoText().length > 120 ? 'https://example.com' : demoText();
    const saved = S;
    $('#presetGrid').innerHTML = PRESETS.map((p, i) => {
      S = clone(saved);
      applyStyle(p);
      S.logo = saved.logo;
      let svg = '';
      try { svg = R.build(S, text).svg; } catch (e) {}
      return `<button data-preset="${i}"><span class="thumb">${svg}</span>${p.name}</button>`;
    }).join('');
    S = saved;
  }
  $('#presetGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    applyStyle(PRESETS[+b.dataset.preset]);
    commitNow();
    afterChange();
    toast(`Applied “${PRESETS[+b.dataset.preset].name}”`);
  });

  let frameThumbTimer = 0;
  const scheduleFrameThumbs = () => { clearTimeout(frameThumbTimer); frameThumbTimer = setTimeout(renderFrameThumbs, 120); };
  function renderFrameThumbs() {
    const demo = clone(S);
    demo.logo.kind = 'none';
    demo.fx.shadow = false;
    if (!demo.frame.text) demo.frame.text = 'SCAN ME';
    const grid = $('#frameGrid');
    grid.innerHTML = R.FRAMES.map(([id, label]) => {
      demo.frame.style = id;
      return `<button data-value="${id}"><span class="thumb">${R.build(demo, 'QR Studio').svg}</span>${label}</button>`;
    }).join('');
    syncUI();
  }

  /* ============================================================== export */
  const fileName = () => (S.out.name || 'qr-code').replace(/[^\w\-. ]+/g, '').trim() || 'qr-code';
  async function exportBlob(fmt, text = lastText, state = S) {
    const size = state.out.size;
    const b = R.build(state, text, { width: size });
    if (fmt === 'svg') return new Blob([b.svg], { type: 'image/svg+xml' });
    const h = Math.round((size * b.height) / b.width);
    const cv = await R.svgToCanvas(b.svg, size, h, fmt === 'jpeg' ? '#ffffff' : null);
    return new Promise((res, rej) => cv.toBlob((bl) => (bl ? res(bl) : rej(new Error('Export failed'))), 'image/' + fmt, 0.95));
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const EXT = { png: 'png', svg: 'svg', jpeg: 'jpg', webp: 'webp' };
  async function doDownload(fmt) {
    if (!lastBuild) return;
    try {
      const blob = await exportBlob(fmt);
      const realFmt = blob.type.split('/')[1] === 'svg+xml' ? 'svg' : blob.type.split('/')[1] || fmt;
      download(blob, `${fileName()}.${EXT[realFmt] || realFmt}`);
      toast(`Downloaded ${(EXT[realFmt] || realFmt).toUpperCase()}`);
    } catch (e) {
      toast('Export failed: ' + e.message, true);
    }
  }
  $$('[data-dl]').forEach((b) => b.addEventListener('click', () => doDownload(b.dataset.dl)));

  $('#copyBtn').addEventListener('click', async () => {
    if (!lastBuild) return;
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('not supported');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': exportBlob('png') })]);
      toast('Image copied to clipboard');
    } catch (e) {
      toast('Your browser blocked image copying — use Download instead', true);
    }
  });

  $('#printBtn').addEventListener('click', async () => {
    if (!lastBuild) return;
    const blob = await exportBlob('png');
    const url = URL.createObjectURL(blob);
    const ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(ifr);
    const d = ifr.contentDocument;
    d.open();
    d.write(`<!doctype html><html><head><title>${fileName()}</title><style>@page{margin:15mm}html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center}img{width:10cm;max-width:100%}</style></head><body><img src="${url}"></body></html>`);
    d.close();
    const img = d.querySelector('img');
    const go = () => { ifr.contentWindow.focus(); ifr.contentWindow.print(); setTimeout(() => { ifr.remove(); URL.revokeObjectURL(url); }, 1500); };
    if (img.complete) go(); else img.onload = go;
  });

  /* ---- share link */
  function encodeState() {
    const s = clone(S);
    s.logo.src = '';
    if (s.logo.kind === 'image') s.logo.kind = 'none';
    const bytes = new TextEncoder().encode(JSON.stringify(diff(s, DEFAULTS)));
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeState(str) {
    const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))));
  }
  $('#shareBtn').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '#d=' + encodeState();
    try {
      await navigator.clipboard.writeText(url);
      toast(S.logo.kind === 'image' ? 'Link copied (uploaded logos aren’t included)' : 'Share link copied to clipboard');
    } catch (e) {
      prompt('Copy this link:', url);
    }
  });

  /* ---- saved designs */
  const getSaved = () => { const v = safeParse(store.get(KEY_SAVED)); return Array.isArray(v) ? v : []; };
  function saveDesign(name) {
    const list = getSaved();
    const auto = (lastText.replace(/^https?:\/\/(www\.)?/, '').split(/[/?#\n]/)[0] || 'Design').slice(0, 40);
    list.unshift({ id: Date.now().toString(36), name: (name || auto).slice(0, 60), date: Date.now(), state: clone(S) });
    if (!store.set(KEY_SAVED, JSON.stringify(list.slice(0, 60)))) {
      toast('Browser storage is full — delete some designs first', true);
      return;
    }
    toast('Saved to My designs');
    if (activeTab === 'saved') renderSaved();
  }
  function renderSaved() {
    const list = getSaved();
    $('#savedEmpty').hidden = list.length > 0;
    $('#savedGrid').innerHTML = list.map((it) => {
      const st = sanitize(it.state);
      let svg = '';
      try { svg = R.build(st, buildContent(st) || 'QR Studio').svg; } catch (e) {}
      const date = new Date(it.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      return `<div class="saved-item"><span class="thumb" data-load="${esc(it.id)}" title="Load this design">${svg}</span><div class="meta"><div style="min-width:0"><strong title="${esc(it.name)}">${esc(it.name)}</strong><br><small>${date}</small></div><button class="icon-btn" data-del="${esc(it.id)}" title="Delete" aria-label="Delete design">${R.iconSVG('trash', 16)}</button></div></div>`;
    }).join('');
  }
  $('#savedGrid').addEventListener('click', (e) => {
    const load = e.target.closest('[data-load]'), del = e.target.closest('[data-del]');
    if (load) {
      const it = getSaved().find((x) => x.id === load.dataset.load);
      if (it) { S = sanitize(it.state); commitNow(); afterChange(); toast(`Loaded “${it.name}”`); }
    } else if (del) {
      store.set(KEY_SAVED, JSON.stringify(getSaved().filter((x) => x.id !== del.dataset.del)));
      renderSaved();
    }
  });
  $('#saveBtn').addEventListener('click', () => {
    if (!lastText) return toast('Add some content first', true);
    saveDesign($('#saveName').value.trim());
    $('#saveName').value = '';
  });
  $('#saveName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#saveBtn').click(); });
  $('#quickSaveBtn').addEventListener('click', () => saveDesign(''));

  /* ---- batch */
  let batchFmt = 'png';
  $('#batchFormat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    batchFmt = b.dataset.value;
    $$('#batchFormat button').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('#batchBtn').addEventListener('click', async () => {
    const lines = $('#batchInput').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return toast('Add at least one line', true);
    if (lines.length > 500) return toast('Up to 500 codes at a time, please', true);
    if (!window.JSZip) return toast('ZIP library still loading — try again', true);
    const btn = $('#batchBtn'), bar = $('#batchProgress');
    btn.disabled = true; bar.hidden = false;
    const zip = new window.JSZip(), used = new Set();
    let failed = 0;
    for (let i = 0; i < lines.length; i++) {
      let name = '', content = lines[i];
      const m = content.match(/^(.{1,80}?)\s+\|\s+(.+)$/);
      if (m) { name = m[1]; content = m[2]; }
      if ($('#batchHttps').checked && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(content)) content = 'https://' + content;
      let base = (name || content.replace(/^[a-z]+:\/\//i, '')).replace(/[^\w\-.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'qr';
      base = `${String(i + 1).padStart(3, '0')}-${base}`;
      while (used.has(base)) base += '_';
      used.add(base);
      try {
        zip.file(`${base}.${EXT[batchFmt]}`, await exportBlob(batchFmt, content));
      } catch (e) { failed++; }
      $('span', bar).style.width = ((i + 1) / lines.length) * 100 + '%';
    }
    const out = await zip.generateAsync({ type: 'blob' });
    download(out, `${fileName()}-batch.zip`);
    toast(failed ? `ZIP ready — ${failed} line(s) were too long and skipped` : `ZIP ready with ${lines.length} codes`, !!failed);
    btn.disabled = false;
    setTimeout(() => { bar.hidden = true; $('span', bar).style.width = '0'; }, 800);
  });

  /* ---- logo upload */
  function readLogo(file) {
    if (!file || !/^image\//.test(file.type)) return toast('Please choose an image file', true);
    if (file.size > 8 * 1024 * 1024) return toast('Image is too large (max 8 MB)', true);
    const fr = new FileReader();
    fr.onload = () => {
      const set = (src) => { S.logo.src = src; S.logo.kind = 'image'; commitNow(); afterChange(); toast('Logo added'); };
      if (file.type === 'image/svg+xml') return set(fr.result);
      const img = new Image();
      img.onload = () => {
        const max = 384, sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * sc));
        cv.height = Math.max(1, Math.round(img.height * sc));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        set(cv.toDataURL('image/png'));
      };
      img.onerror = () => toast('Could not read that image', true);
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  $('#logoFile').addEventListener('change', (e) => { readLogo(e.target.files[0]); e.target.value = ''; });
  $('#logoRemove').addEventListener('click', (e) => { e.preventDefault(); S.logo.src = ''; S.logo.kind = 'none'; commitNow(); afterChange(); });

  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; $('#dropOverlay').classList.add('show'); });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropOverlay').classList.remove('show'); } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('#dropOverlay').classList.remove('show');
    readLogo(e.dataTransfer.files[0]);
    showTab('logo');
  });
  document.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData ? e.clipboardData.files : [])].find((f) => /^image\//.test(f.type));
    if (file) { e.preventDefault(); readLogo(file); showTab('logo'); }
  });

  /* ---- misc buttons */
  $('#geoBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Location is not available in this browser', true);
    navigator.geolocation.getCurrentPosition(
      (p) => { S.data.lat = p.coords.latitude.toFixed(6); S.data.lng = p.coords.longitude.toFixed(6); commitNow(); afterChange(); },
      () => toast('Could not get your location', true),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
  $('#swapBtn').addEventListener('click', () => {
    const fg = S.fg.c1;
    S.fg.c1 = S.bg.c1; S.bg.c1 = fg;
    if (S.bg.mode === 'transparent') S.bg.mode = 'solid';
    commitNow(); afterChange();
  });
  $('#surpriseBtn').addEventListener('click', surprise);
  $('#surpriseBtn2').addEventListener('click', () => { surprise(); renderPresets(); });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Reset all content and styling to the defaults?')) return;
    S = clone(DEFAULTS);
    commitNow(); afterChange();
    toast('Reset to defaults');
  });
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    store.set(KEY_THEME, t);
    $('#themeBtn').innerHTML = R.iconSVG(t === 'dark' ? 'sun' : 'moon', 18);
  }
  $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const inText = e.target.matches('input:not([type=range]):not([type=checkbox]):not([type=color]), textarea');
    const k = e.key.toLowerCase();
    if (k === 'z' && !inText) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y' && !inText) { e.preventDefault(); redo(); }
    else if (k === 's') { e.preventDefault(); doDownload('png'); }
  });

  /* ============================================================ dynamic links */
  async function api(path, { method = 'GET', body, key } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (key) headers.Authorization = 'Bearer ' + key;
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new Error('Can’t reach the link service — check your connection');
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  const getLinks = () => { const v = safeParse(store.get(KEY_LINKS)); return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.editKey === 'string') : []; };
  const setLinks = (list) => store.set(KEY_LINKS, JSON.stringify(list));
  const ownLink = (id) => getLinks().find((l) => l.id === id);
  function patchLocal(id, fields) {
    setLinks(getLinks().map((l) => (l.id === id ? { ...l, ...fields } : l)));
  }
  const normUrl = (u) => {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    try { return new URL(u).toString(); } catch (e) { return u; }
  };
  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function ago(isoDate) {
    if (!isoDate) return 'never';
    const s = (Date.now() - new Date(isoDate).getTime()) / 1000;
    if (s < 60) return 'just now';
    const units = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [2592000, 'month'], [31536000, 'year']];
    let u = units[0];
    for (const x of units) if (s >= x[0]) u = x;
    const n = Math.floor(s / u[0]);
    return `${n} ${u[1]}${n === 1 ? '' : 's'} ago`;
  }
  const scansText = (sc) => (sc ? `${sc.total.toLocaleString()} scan${sc.total === 1 ? '' : 's'} · last ${ago(sc.last)}` : '');
  function setBusy(btn, on) { if (btn) { btn.classList.toggle('busy', on); btn.disabled = on; } }

  function syncDyn() {
    const box = $('#dynState');
    if (!box || !S.data.dynShort) return;
    $('#dynShort').textContent = S.data.dynShort.replace(/^https?:\/\//, '');
    const link = ownLink(S.data.dynId);
    const save = $('#dynSave');
    box.className = 'dyn-state';
    if (!link) {
      save.hidden = true;
      box.classList.add('warn');
      box.textContent = 'This browser doesn’t have the edit key for this link. Restore your backup in My links to edit it.';
      return;
    }
    if (link.disabled) {
      save.hidden = true;
      box.classList.add('warn');
      box.textContent = 'This link was disabled: ' + (link.disabledReason || 'policy violation');
      return;
    }
    const changed = normUrl(S.data.url) !== link.target;
    save.hidden = !changed;
    box.innerHTML = changed
      ? `Live destination is still <strong>${escHtml(link.target)}</strong> — click <em>Update</em> to switch it to the URL above.`
      : `Live → <strong>${escHtml(link.target)}</strong>${link.scans ? '<br>' + escHtml(scansText(link.scans)) : ''}`;
  }

  async function dynCreate() {
    const target = S.data.url.trim();
    if (!target) return toast('Enter the destination URL first', true);
    const btn = $('#dynCreate');
    setBusy(btn, true);
    try {
      const r = await api('/api/links', { method: 'POST', body: { target } });
      setLinks([{ id: r.id, shortUrl: r.shortUrl, editKey: r.editKey, target: r.target, createdAt: r.createdAt, scans: r.scans }, ...getLinks()]);
      S.data.dynId = r.id;
      S.data.dynShort = r.shortUrl;
      S.data.url = r.target;
      commitNow();
      afterChange();
      toast('Dynamic link created — back up your keys in My links');
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(btn, false);
    }
  }
  async function updateTarget(id, target, btn) {
    const link = ownLink(id);
    if (!link) return toast('No edit key for this link in this browser', true);
    setBusy(btn, true);
    try {
      const r = await api('/api/links/' + id, { method: 'PATCH', key: link.editKey, body: { target } });
      patchLocal(id, { target: r.target, scans: { ...(link.scans || {}), ...r.scans, daily: (link.scans && link.scans.daily) || [] } });
      if (S.data.dynId === id) S.data.url = r.target;
      afterChange();
      toast('Destination updated — the printed code now goes there');
      return r;
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(btn, false);
    }
  }

  function spark(daily) {
    const days = [], map = new Map((daily || []).map((d) => [d.day, d.n]));
    for (let i = 29; i >= 0; i--) days.push(map.get(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10)) || 0);
    const max = Math.max(1, ...days), w = 5, gap = 0;
    const bars = days.map((n, i) => {
      const h = n ? Math.max(2, (n / max) * 28) : 1;
      return `<rect x="${i * w + gap}" y="${30 - h}" width="${w - 1}" height="${h}" rx="1" opacity="${n ? 1 : 0.25}"/>`;
    }).join('');
    return `<svg class="spark" viewBox="0 0 150 30" fill="currentColor" role="img" aria-label="Scans over the last 30 days">${bars}</svg>`;
  }
  function renderLinks() {
    const list = getLinks();
    $('#linksEmpty').hidden = list.length > 0;
    $('#linksList').innerHTML = list.map((l) => {
      const status = l.gone ? ['fail', 'Deleted'] : l.disabled ? ['fail', 'Disabled'] : ['ok', 'Live'];
      return `<div class="link-card${l.gone ? ' gone' : ''}" data-id="${escHtml(l.id)}">
        <div class="lc-top"><a href="${escHtml(l.shortUrl)}+" target="_blank" rel="noopener" title="Preview where this goes">${escHtml(l.shortUrl.replace(/^https?:\/\//, ''))}</a>
          <span class="badge ${status[0]}">${status[1]}</span>
          <button class="icon-btn" data-copy title="Copy short link" aria-label="Copy short link">${R.iconSVG('copy', 16)}</button></div>
        ${l.disabled ? `<div class="dyn-state warn">${escHtml(l.disabledReason || 'Disabled')}</div>` : ''}
        <div class="lc-edit"><input value="${escHtml(l.target)}" aria-label="Destination URL" ${l.gone || l.disabled ? 'disabled' : ''} /><button class="btn primary sm" data-save ${l.gone || l.disabled ? 'disabled' : ''}>Save</button></div>
        <div class="lc-stats"><span><strong>${(l.scans ? l.scans.total : 0).toLocaleString()}</strong> scans · last ${escHtml(ago(l.scans && l.scans.last))} · created ${escHtml(new Date(l.createdAt || Date.now()).toLocaleDateString())}</span>${spark(l.scans && l.scans.daily)}</div>
        <div class="lc-actions"><button class="btn subtle sm" data-open ${l.gone ? 'disabled' : ''}>${R.iconSVG('grid', 16)}Open in editor</button><button class="btn subtle sm danger" data-del>${R.iconSVG('trash', 16)}${l.gone ? 'Remove' : 'Delete'}</button></div>
      </div>`;
    }).join('');
  }
  let refreshing = null;
  async function refreshLinks() {
    renderLinks();
    const list = getLinks();
    if (!list.length || refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const r = await api('/api/links/lookup', { method: 'POST', body: { items: list.map((l) => ({ id: l.id, key: l.editKey })) } });
        const byId = new Map(r.links.map((x) => [x.id, x]));
        setLinks(getLinks().map((l) => {
          const x = byId.get(l.id);
          if (x) return { ...l, target: x.target, shortUrl: x.shortUrl, disabled: x.disabled, disabledReason: x.disabledReason, scans: x.scans, gone: false };
          return r.missing.includes(l.id) ? { ...l, gone: true } : l;
        }));
        renderLinks();
        syncDyn();
      } catch (e) {
        toast(e.message, true);
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  function initDynamic() {
    if (!API) {
      $$('[data-requires-api]').forEach((el) => el.remove());
      return;
    }
    $('#privacyNote span').textContent = 'Static codes never expire and aren’t tracked. Dynamic links only count scans (date, country, device).';
    $('#dynCreate').addEventListener('click', dynCreate);
    $('#dynSave').addEventListener('click', (e) => updateTarget(S.data.dynId, S.data.url, e.currentTarget));
    $('#dynNew').addEventListener('click', () => { S.data.dynId = ''; S.data.dynShort = ''; commitNow(); afterChange(); });
    $('#dynCopy').addEventListener('click', () => navigator.clipboard.writeText(S.data.dynShort).then(() => toast('Short link copied')));
    document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) showTab(g.dataset.goto); });

    $('#linksList').addEventListener('click', async (e) => {
      const card = e.target.closest('.link-card');
      if (!card) return;
      const id = card.dataset.id, link = ownLink(id);
      if (!link) return;
      if (e.target.closest('[data-copy]')) {
        navigator.clipboard.writeText(link.shortUrl).then(() => toast('Short link copied'));
      } else if (e.target.closest('[data-save]')) {
        const r = await updateTarget(id, $('input', card).value, e.target.closest('[data-save]'));
        if (r) renderLinks();
      } else if (e.target.closest('[data-open]')) {
        S.type = 'url';
        Object.assign(S.data, { dynamic: true, dynId: id, dynShort: link.shortUrl, url: link.target });
        commitNow(); afterChange();
        showTab('content');
      } else if (e.target.closest('[data-del]')) {
        if (!link.gone && !confirm('Delete this link? Any printed QR codes using it will stop working. This can’t be undone.')) return;
        try {
          if (!link.gone) await api('/api/links/' + id, { method: 'DELETE', key: link.editKey });
          setLinks(getLinks().filter((l) => l.id !== id));
          if (S.data.dynId === id) { S.data.dynId = ''; S.data.dynShort = ''; commitNow(); afterChange(); }
          renderLinks();
          toast('Link deleted');
        } catch (err) { toast(err.message, true); }
      }
    });
    $('#linksList').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('.lc-edit input')) $('[data-save]', e.target.closest('.link-card')).click();
    });
    $('#linksRefresh').addEventListener('click', () => refreshLinks());
    $('#linksExport').addEventListener('click', () => {
      const links = getLinks().map(({ id, shortUrl, editKey, target, createdAt }) => ({ id, shortUrl, editKey, target, createdAt }));
      if (!links.length) return toast('No links to back up yet', true);
      download(new Blob([JSON.stringify({ app: 'qr-studio', version: 1, exportedAt: new Date().toISOString(), links }, null, 2)], { type: 'application/json' }), 'qr-studio-link-keys.json');
      toast('Backup downloaded — keep it somewhere safe');
    });
    $('#linksImport').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const incoming = (Array.isArray(data.links) ? data.links : []).filter((l) => l && typeof l.id === 'string' && typeof l.editKey === 'string' && typeof l.shortUrl === 'string');
        if (!incoming.length) throw new Error();
        const have = new Map(getLinks().map((l) => [l.id, l]));
        let added = 0;
        for (const l of incoming) if (!have.has(l.id)) { have.set(l.id, { id: l.id, shortUrl: l.shortUrl, editKey: l.editKey, target: String(l.target || ''), createdAt: l.createdAt }); added++; }
        setLinks([...have.values()]);
        toast(`Restored ${added} link${added === 1 ? '' : 's'}`);
        refreshLinks();
      } catch (err) {
        toast('That file isn’t a QR Studio key backup', true);
      }
    });
    // keep the content-tab status fresh
    if (S.data.dynamic && S.data.dynId && ownLink(S.data.dynId)) refreshLinks();
  }

  /* ---- toast */
  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.innerHTML = R.iconSVG(err ? 'alert' : 'check', 16) + '<span></span>';
    t.lastChild.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  /* ============================================================== init */
  function init() {
    $$('i[data-icon]').forEach((i) => (i.innerHTML = R.iconSVG(i.dataset.icon, 18)));
    $$('[data-thumbs]').forEach((g) => {
      const list = { body: R.BODY_SHAPES, outer: R.EYE_OUTER, inner: R.EYE_INNER }[g.dataset.thumbs];
      g.innerHTML = list.map(([id, label]) => `<button data-value="${id}" title="${label}">${R.shapeThumb(g.dataset.thumbs, id)}<span>${label}</span></button>`).join('');
    });
    $('#iconGrid').innerHTML = R.LOGO_ICONS.map((n) => `<button data-value="${n}" title="${n}" aria-label="${n}">${R.iconSVG(n, 22)}</button>`).join('');
    $('#paletteRow').innerHTML = PALETTES.map((p, i) => `<button data-pal="${i}" title="Apply palette" style="background:${p[2]}"><i style="background:linear-gradient(135deg,${p[0]},${p[1]})"></i></button>`).join('');
    $('#paletteRow').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pal]');
      if (!b) return;
      const p = PALETTES[+b.dataset.pal];
      S.fg.c1 = p[0]; S.fg.c2 = p[1]; S.bg.c1 = p[2];
      if (S.bg.mode === 'transparent') S.bg.mode = 'solid';
      if (S.bg.mode !== 'solid') S.bg.c2 = p[2];
      S.eyes.outer = p[1]; S.eyes.inner = p[0];
      if (S.logo.kind === 'icon') S.logo.iconColor = p[0];
      if (S.frame.style !== 'none') { S.frame.color = p[0]; S.frame.textColor = p[2]; }
      commitNow(); afterChange();
    });
    $('#textChips').innerHTML = FRAME_TEXTS.map((t) => `<button type="button">${t}</button>`).join('');
    $('#textChips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) update('frame.text', b.textContent); });
    renderFrameThumbs();
    initDynamic();

    // shared link
    const m = location.hash.match(/^#d=([\w-]+)/);
    if (m) {
      try {
        S = sanitize(merge(DEFAULTS, decodeState(m[1])));
        hist.stack = [JSON.stringify(S)]; hist.i = 0;
        setTimeout(() => toast('Loaded shared design'), 300);
      } catch (e) { setTimeout(() => toast('That share link looks broken', true), 300); }
      history.replaceState(null, '', location.pathname + location.search);
    }

    setTheme(document.documentElement.dataset.theme || 'light');
    let tab = 'content';
    try { tab = sessionStorage.getItem('qrstudio:tab') || 'content'; } catch (e) {}
    showTab($(`.tabs [data-tab="${tab}"]`) ? tab : 'content');
    syncUI();
    render();
  }
  init();

  // expose for debugging / tests
  window.QRStudio = { get state() { return S; }, buildContent, render };
})();
