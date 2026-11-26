/* QR Studio — SVG renderer.
 * Turns a design state + text into a standalone SVG string.
 * Everything (shapes, gradients, logo, frames, effects) is vector, so the
 * same markup drives the live preview, SVG export and raster export.
 */
(function (root) {
  'use strict';

  const qrcode = root.qrcode;
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

  const f = (v) => Math.round(v * 1000) / 1000;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const col = (v, fb = '#000000') => (HEX.test(v) ? v : fb);

  /* ------------------------------------------------------------------ icons */
  // 24×24 stroke icons (feather/lucide style). Used for the UI and as QR logos.
  const ICONS = {
    link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
    globe: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
    text: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
    wifi: ['M5 12.55a11 11 0 0 1 14.08 0', 'M1.42 9a16 16 0 0 1 21.16 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'],
    mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M22 6l-10 7L2 6'],
    phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'],
    message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    chat: ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'],
    user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
    pin: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
    calendar: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
    heart: ['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'],
    star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
    camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
    bag: ['M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
    music: ['M9 18V5l12-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
    play: ['M5 3l14 9-14 9V3z'],
    coffee: ['M18 8h1a4 4 0 0 1 0 8h-1', 'M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z', 'M6 1v3', 'M10 1v3', 'M14 1v3'],
    card: ['M3 4h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M1 10h22'],
    // UI-only
    undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],
    redo: ['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7'],
    shuffle: ['M16 3h5v5', 'M4 20L21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
    reset: ['M1 4v6h6', 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10'],
    share: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M8.59 13.51l6.83 3.98', 'M15.41 6.51l-6.82 3.98'],
    sun: ['M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z', 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'],
    moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
    copy: ['M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
    printer: ['M6 9V2h12v7', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v8H6z'],
    save: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
    trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    palette: ['M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z'],
    image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M10 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z', 'M21 15l-5-5L5 21'],
    frame: ['M22 6H2', 'M22 18H2', 'M6 2v20', 'M18 2v20'],
    sparkles: ['M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z', 'M19 3v4', 'M17 5h4'],
    grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
    shapes: ['M14 14h7v7h-7z', 'M10.5 6.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M17.5 2.5l4 7h-8z', 'M3 21l3.5-6 3.5 6z'],
    layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
    folder: ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
    check: ['M20 6L9 17l-5-5'],
    alert: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
    x: ['M18 6L6 18', 'M6 6l12 12'],
    crosshair: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M22 12h-4', 'M6 12H2', 'M12 6V2', 'M12 22v-4'],
    zap: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
    code: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
    swap: ['M7 16V4', 'M3 8l4-4 4 4', 'M17 8v12', 'M21 16l-4 4-4-4'],
    plus: ['M12 5v14', 'M5 12h14'],
    loader: ['M12 2v4', 'M12 18v4', 'M4.93 4.93l2.83 2.83', 'M16.24 16.24l2.83 2.83', 'M2 12h4', 'M18 12h4', 'M4.93 19.07l2.83-2.83', 'M16.24 7.76l2.83-2.83'],
  };
  const LOGO_ICONS = ['link', 'globe', 'wifi', 'mail', 'phone', 'chat', 'user', 'pin', 'calendar', 'heart', 'star', 'camera', 'bag', 'music', 'play', 'coffee', 'card'];

  function iconSVG(name, size = 20) {
    const p = ICONS[name] || [];
    return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p
      .map((d) => `<path d="${d}"/>`)
      .join('')}</svg>`;
  }

  /* --------------------------------------------------------------- geometry */
  function rrect(x, y, w, h, r) {
    let [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
    const m = Math.min(w, h) / 2;
    tl = Math.min(tl, m); tr = Math.min(tr, m); br = Math.min(br, m); bl = Math.min(bl, m);
    const A = (rad, ex, ey) => (rad ? `A${f(rad)},${f(rad)} 0 0 1 ${f(ex)},${f(ey)}` : '');
    return (
      `M${f(x + tl)},${f(y)}H${f(x + w - tr)}` + A(tr, x + w, y + tr) +
      `V${f(y + h - br)}` + A(br, x + w - br, y + h) +
      `H${f(x + bl)}` + A(bl, x, y + h - bl) +
      `V${f(y + tl)}` + A(tl, x + tl, y) + 'Z'
    );
  }
  function circle(cx, cy, r) {
    return `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1 0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1 0 ${f(-2 * r)},0Z`;
  }
  function poly(pts) {
    return 'M' + pts.map((p) => f(p[0]) + ',' + f(p[1])).join('L') + 'Z';
  }
  function starPath(cx, cy, ro, ri, n = 5) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const r = i % 2 ? ri : ro;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return poly(pts);
  }
  const HEART = [['M', 0.5, 0.92], ['C', 0.18, 0.7, 0, 0.5, 0, 0.3], ['C', 0, 0.12, 0.14, 0, 0.3, 0], ['C', 0.4, 0, 0.47, 0.06, 0.5, 0.14], ['C', 0.53, 0.06, 0.6, 0, 0.7, 0], ['C', 0.86, 0, 1, 0.12, 1, 0.3], ['C', 1, 0.5, 0.82, 0.7, 0.5, 0.92]];
  function heartPath(x, y, s) {
    return HEART.map(([c, ...n]) => c + n.map((v, i) => f((i % 2 ? y : x) + v * s)).join(',')).join('') + 'Z';
  }
  function plusPath(x, y, s, t) {
    const a = (s - t) / 2, b = a + t;
    return poly([[x + a, y], [x + b, y], [x + b, y + a], [x + s, y + a], [x + s, y + b], [x + b, y + b], [x + b, y + s], [x + a, y + s], [x + a, y + b], [x, y + b], [x, y + a], [x + a, y + a]]);
  }
  const rand = (r, c) => {
    const s = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  // corner radii where both adjacent sides are exposed
  const exposed = (nb, r) => {
    const t = nb(-1, 0), b = nb(1, 0), l = nb(0, -1), rt = nb(0, 1);
    return [!t && !l ? r : 0, !t && !rt ? r : 0, !b && !rt ? r : 0, !b && !l ? r : 0];
  };

  /* ----------------------------------------------------------------- shapes */
  const BODY_SHAPES = [
    ['square', 'Square'], ['rounded', 'Rounded'], ['fluid', 'Fluid'], ['soft', 'Soft'], ['dots', 'Dots'],
    ['tiny', 'Tiny dots'], ['random', 'Bubbles'], ['classy', 'Classy'], ['leaf', 'Leaf'], ['diamond', 'Diamond'],
    ['plus', 'Plus'], ['vlines', 'V-lines'], ['hlines', 'H-lines'], ['star', 'Stars'], ['heart', 'Hearts'],
  ];
  const BODY_FN = {
    rounded: (x, y, nb) => rrect(x, y, 1, 1, exposed(nb, 0.32)),
    fluid: (x, y, nb) => rrect(x, y, 1, 1, exposed(nb, 0.5)),
    soft: (x, y) => rrect(x + 0.06, y + 0.06, 0.88, 0.88, 0.28),
    dots: (x, y) => circle(x + 0.5, y + 0.5, 0.46),
    tiny: (x, y) => circle(x + 0.5, y + 0.5, 0.32),
    random: (x, y, nb, r, c) => circle(x + 0.5, y + 0.5, 0.26 + 0.22 * rand(r, c)),
    classy: (x, y, nb) => {
      const t = nb(-1, 0), b = nb(1, 0), l = nb(0, -1), rt = nb(0, 1);
      return rrect(x, y, 1, 1, [!t && !l ? 0.5 : 0, 0, !b && !rt ? 0.5 : 0, 0]);
    },
    leaf: (x, y) => rrect(x, y, 1, 1, [0.5, 0, 0.5, 0]),
    diamond: (x, y) => poly([[x + 0.5, y - 0.04], [x + 1.04, y + 0.5], [x + 0.5, y + 1.04], [x - 0.04, y + 0.5]]),
    plus: (x, y) => plusPath(x, y, 1, 0.42),
    star: (x, y) => starPath(x + 0.5, y + 0.54, 0.58, 0.26),
    heart: (x, y) => heartPath(x + 0.02, y + 0.06, 0.96),
  };

  function bodyPath(M, n, shape, skip, o) {
    const on = (r, c) => r >= 0 && c >= 0 && r < n && c < n && M[r][c] && !skip(r, c);
    let d = '';
    if (shape === 'vlines' || shape === 'hlines') {
      const v = shape === 'vlines';
      const at = (a, b) => (v ? on(b, a) : on(a, b));
      for (let a = 0; a < n; a++) {
        let b = 0;
        while (b < n) {
          if (!at(a, b)) { b++; continue; }
          const s = b;
          while (b < n && at(a, b)) b++;
          const len = b - s;
          d += v ? rrect(o + a + 0.12, o + s + 0.06, 0.76, len - 0.12, 0.38) : rrect(o + s + 0.06, o + a + 0.12, len - 0.12, 0.76, 0.38);
        }
      }
      return d;
    }
    const fn = BODY_FN[shape];
    if (!fn) {
      // square: merge horizontal runs (smaller output, no hairline seams)
      for (let r = 0; r < n; r++) {
        let c = 0;
        while (c < n) {
          if (!on(r, c)) { c++; continue; }
          const s = c;
          while (c < n && on(r, c)) c++;
          d += `M${o + s},${o + r}h${c - s}v1h${s - c}z`;
        }
      }
      return d;
    }
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (on(r, c)) d += fn(o + c, o + r, (dr, dc) => on(r + dr, c + dc), r, c);
    return d;
  }

  /* ------------------------------------------------------------------- eyes */
  const EYE_OUTER = [['square', 'Square'], ['rounded', 'Rounded'], ['squircle', 'Squircle'], ['circle', 'Circle'], ['leaf', 'Leaf'], ['drop', 'Drop'], ['dotted', 'Dotted']];
  const EYE_INNER = [['square', 'Square'], ['rounded', 'Rounded'], ['circle', 'Circle'], ['diamond', 'Diamond'], ['leaf', 'Leaf'], ['drop', 'Drop'], ['star', 'Star'], ['heart', 'Heart']];
  // mirror corner radii so asymmetric eyes point outward on every corner
  const MIRROR = [(r) => r, ([a, b, c, d]) => [b, a, d, c], ([a, b, c, d]) => [d, c, b, a]];
  const OUTER_R = {
    square: [[0, 0, 0, 0], [0, 0, 0, 0]],
    rounded: [[2, 2, 2, 2], [1, 1, 1, 1]],
    squircle: [[3, 3, 3, 3], [2, 2, 2, 2]],
    leaf: [[3, 0, 3, 0], [2, 0, 2, 0]],
    drop: [[3, 3, 0, 3], [2, 2, 0, 2]],
  };
  function eyeOuter(style, x, y, mi) {
    if (style === 'circle') return circle(x + 3.5, y + 3.5, 3.5) + circle(x + 3.5, y + 3.5, 2.5);
    if (style === 'dotted') {
      let d = '';
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if (i === 0 || i === 6 || j === 0 || j === 6) d += circle(x + j + 0.5, y + i + 0.5, 0.44);
      return d;
    }
    const R = OUTER_R[style] || OUTER_R.square, m = MIRROR[mi];
    return rrect(x, y, 7, 7, m(R[0])) + rrect(x + 1, y + 1, 5, 5, m(R[1]));
  }
  function eyeInner(style, x, y, mi) {
    const m = MIRROR[mi];
    x += 2; y += 2;
    switch (style) {
      case 'rounded': return rrect(x, y, 3, 3, 0.9);
      case 'circle': return circle(x + 1.5, y + 1.5, 1.5);
      case 'diamond': return poly([[x + 1.5, y - 0.25], [x + 3.25, y + 1.5], [x + 1.5, y + 3.25], [x - 0.25, y + 1.5]]);
      case 'leaf': return rrect(x, y, 3, 3, m([1.5, 0, 1.5, 0]));
      case 'drop': return rrect(x, y, 3, 3, m([1.5, 1.5, 0, 1.5]));
      case 'star': return starPath(x + 1.5, y + 1.62, 1.85, 0.82);
      case 'heart': return heartPath(x - 0.15, y - 0.05, 3.3);
      default: return rrect(x, y, 3, 3, 0);
    }
  }

  /* ----------------------------------------------------------------- frames */
  const FRAMES = [
    ['none', 'None'], ['border', 'Border'], ['label-bottom', 'Label below'], ['label-top', 'Label above'],
    ['bubble', 'Bubble'], ['pill', 'Button'], ['corners', 'Viewfinder'], ['circle', 'Badge'],
  ];
  const FONTS = {
    sans: { family: "Inter, 'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif", weight: 800, w: 0.7, ls: 0.06 },
    rounded: { family: "'Arial Rounded MT Bold', Nunito, 'Varela Round', 'Segoe UI', system-ui, sans-serif", weight: 700, w: 0.7, ls: 0.04 },
    serif: { family: "Georgia, 'Times New Roman', Times, serif", weight: 700, w: 0.66, ls: 0.04 },
    mono: { family: "'SF Mono', Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace", weight: 700, w: 0.68, ls: 0.02 },
    script: { family: "'Brush Script MT', 'Segoe Script', 'Snell Roundhand', cursive", weight: 400, w: 0.5, ls: 0 },
  };
  function textEl(txt, x, y, maxW, maxFs, color, font) {
    if (!txt) return '';
    const F = FONTS[font] || FONTS.sans;
    const len = Math.max(1, [...txt].length);
    const fs = Math.min(maxFs, maxW / (len * (F.w + F.ls)));
    return `<text x="${f(x)}" y="${f(y)}" fill="${color}" font-family="${F.family}" font-weight="${F.weight}" font-size="${f(fs)}" letter-spacing="${f(fs * F.ls)}" text-anchor="middle" dominant-baseline="central">${esc(txt)}</text>`;
  }

  /* -------------------------------------------------------------- gradients */
  function gradDef(id, g, x0, y0, w, h = w) {
    const c1 = col(g.c1), c2 = col(g.c2), stops = `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>`;
    const cx = x0 + w / 2, cy = y0 + h / 2;
    if (g.mode === 'linear') {
      const a = ((Number(g.angle) || 0) * Math.PI) / 180, L = Math.max(w, h) / 2;
      const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
      return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(cx - dx)}" y1="${f(cy - dy)}" x2="${f(cx + dx)}" y2="${f(cy + dy)}">${stops}</linearGradient>`;
    }
    if (g.mode === 'radial') return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(Math.max(w, h) * 0.62)}">${stops}</radialGradient>`;
    return '';
  }
  const paint = (id, g) => (g.mode === 'linear' || g.mode === 'radial' ? `url(#${id})` : col(g.c1));

  /* ----------------------------------------------------------------- matrix */
  const cache = new Map();
  function getMatrix(text, ec) {
    const key = ec + '\u0000' + text;
    if (cache.has(key)) return cache.get(key);
    const qr = qrcode(0, ec);
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount(), M = [];
    for (let r = 0; r < n; r++) {
      const row = new Array(n);
      for (let c = 0; c < n; c++) row[c] = qr.isDark(r, c);
      M.push(row);
    }
    const res = { n, M, version: (n - 17) / 4 };
    if (cache.size > 60) cache.clear();
    cache.set(key, res);
    return res;
  }

  /* ------------------------------------------------------------------ build */
  let uid = 0;
  function build(S, text, opts = {}) {
    const id = 'q' + ++uid + (opts.idPrefix || '');
    const L0 = S.logo || {};
    const logoKind = L0.kind === 'image' && /^data:image\//.test(L0.src || '') ? 'image' : L0.kind === 'icon' && ICONS[L0.icon] ? 'icon' : 'none';
    const ec = ['L', 'M', 'Q', 'H'].includes(S.ec) ? S.ec : logoKind !== 'none' ? 'H' : 'M';
    const { n, M, version } = getMatrix(text, ec);
    const mg = clamp(S.margin, 0, 10);
    const Q = n + 2 * mg, C = 1000, k = C / Q;
    const defs = [];
    const isEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    let skip = isEye;

    /* logo (module units) */
    let logoSVG = '';
    if (logoKind !== 'none') {
      const size = clamp(L0.size, 0.05, 0.4) * n, pad = clamp(L0.padding, 0, 4);
      const half = size / 2 + pad, cx = mg + n / 2, shape = ['circle', 'square', 'none'].includes(L0.shape) ? L0.shape : 'circle';
      if (L0.clear) {
        skip = (r, c) => {
          if (isEye(r, c)) return true;
          const dx = c + 0.5 - n / 2, dy = r + 0.5 - n / 2;
          return shape === 'circle' ? Math.hypot(dx, dy) < half + 0.45 : Math.abs(dx) < half + 0.45 && Math.abs(dy) < half + 0.45;
        };
      }
      let backing = '';
      if (shape === 'circle') backing = circle(cx, cx, half);
      if (shape === 'square') backing = rrect(cx - half, cx - half, 2 * half, 2 * half, half * 0.28);
      if (backing) logoSVG += `<path d="${backing}" fill="${col(L0.bgColor, '#ffffff')}"/>`;
      const x0 = cx - size / 2;
      if (logoKind === 'image') {
        let clip = '';
        if (backing) {
          defs.push(`<clipPath id="${id}-lc"><path d="${backing}"/></clipPath>`);
          clip = ` clip-path="url(#${id}-lc)"`;
        }
        logoSVG += `<image href="${esc(L0.src)}" x="${f(x0)}" y="${f(x0)}" width="${f(size)}" height="${f(size)}" preserveAspectRatio="xMidYMid meet"${clip}/>`;
      } else {
        logoSVG += `<g transform="translate(${f(x0)},${f(x0)}) scale(${f(size / 24)})" fill="none" stroke="${col(L0.iconColor)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[L0.icon].map((d) => `<path d="${d}"/>`).join('')}</g>`;
      }
    }

    /* colours */
    const fg = S.fg || {}, bg = S.bg || {}, eyes = S.eyes || {}, fx = S.fx || {}, fr = S.frame || {};
    const g1 = gradDef(`${id}-fg`, fg, mg, mg, n);
    if (g1) defs.push(g1);
    const fgPaint = paint(`${id}-fg`, fg);
    const eo = eyes.custom ? col(eyes.outer) : fgPaint;
    const ei = eyes.custom ? col(eyes.inner) : fgPaint;

    /* modules */
    const body = bodyPath(M, n, S.body, skip, mg);
    const outerStyle = EYE_OUTER.some((e) => e[0] === S.eyeOuter) ? S.eyeOuter : 'square';
    const innerStyle = EYE_INNER.some((e) => e[0] === S.eyeInner) ? S.eyeInner : 'square';
    let outer = '', inner = '';
    [[0, 0, 0], [n - 7, 0, 1], [0, n - 7, 2]].forEach(([c, r, mi]) => {
      outer += eyeOuter(outerStyle, mg + c, mg + r, mi);
      inner += eyeInner(innerStyle, mg + c, mg + r, mi);
    });

    /* module effects: 3D depth + glow */
    let modFilter = '';
    if (fx.depth || fx.glow) {
      let prims = '';
      if (fx.depth) {
        const steps = 4, st = (clamp(fx.depthSize, 1, 10) * 0.05) / steps * 2;
        for (let i = 0; i < steps; i++) prims += `<feDropShadow dx="${f(st)}" dy="${f(st)}" stdDeviation="0" flood-color="${col(fx.depthColor)}" flood-opacity="1"/>`;
      }
      if (fx.glow) {
        const g = clamp(fx.glowSize, 1, 10) * 0.12;
        prims += `<feDropShadow dx="0" dy="0" stdDeviation="${f(g)}" flood-color="${col(fx.glowColor)}" flood-opacity="1"/>`;
        prims += `<feDropShadow dx="0" dy="0" stdDeviation="${f(g * 0.4)}" flood-color="${col(fx.glowColor)}" flood-opacity="0.9"/>`;
      }
      defs.push(`<filter id="${id}-fx" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">${prims}</filter>`);
      modFilter = ` filter="url(#${id}-fx)"`;
    }

    const qrInner =
      `<g${modFilter}>` +
      (body ? `<path d="${body}" fill="${fgPaint}"/>` : '') +
      `<path d="${outer}" fill-rule="evenodd" fill="${eo}"/>` +
      `<path d="${inner}" fill="${ei}"/>` +
      `</g>` +
      logoSVG;

    /* frame layout (composite px, QR card = 1000×1000) */
    const style = FRAMES.some((x) => x[0] === fr.style) ? fr.style : 'none';
    const R = clamp(fx.radius, 0, 200);
    const fc = col(fr.color, '#111111'), tc = col(fr.textColor, '#ffffff'), font = fr.font;
    const label = String(fr.text || '').slice(0, 40);
    let W = C, H = C, cx = 0, cy = 0, cardPath = '', under = '', over = '';

    switch (style) {
      case 'border': {
        const t = 44, cr = Math.max(0, R - t * 0.6);
        W = H = C + 2 * t; cx = cy = t;
        cardPath = rrect(t, t, C, C, cr);
        under = `<path d="${rrect(0, 0, W, H, R) + cardPath}" fill-rule="evenodd" fill="${fc}"/>`;
        break;
      }
      case 'label-bottom':
      case 'label-top': {
        const t = 44, band = 210, cr = Math.max(0, R - t * 0.6), top = style === 'label-top';
        W = C + 2 * t; H = C + t + band; cx = t; cy = top ? band : t;
        cardPath = rrect(cx, cy, C, C, cr);
        under = `<path d="${rrect(0, 0, W, H, R) + cardPath}" fill-rule="evenodd" fill="${fc}"/>`;
        over = textEl(label, W / 2, top ? band / 2 + 6 : t + C + band / 2 - 6, C * 0.9, 124, tc, font);
        break;
      }
      case 'bubble': {
        const t = 36, cr = Math.max(0, R - t * 0.6), gap = 34, ph = 56, bh = 190;
        W = C + 2 * t; cx = cy = t;
        const by = W + gap + ph; H = by + bh;
        cardPath = rrect(t, t, C, C, cr);
        under =
          `<path d="${rrect(0, 0, W, W, R) + cardPath}" fill-rule="evenodd" fill="${fc}"/>` +
          `<path d="${rrect(0, by, W, bh, Math.max(28, Math.min(R, 95)))}" fill="${fc}"/>` +
          `<path d="${poly([[W / 2 - 62, by + 2], [W / 2, by - ph], [W / 2 + 62, by + 2]])}" fill="${fc}" stroke="${fc}" stroke-width="6" stroke-linejoin="round"/>`;
        over = textEl(label, W / 2, by + bh / 2, C * 0.88, 118, tc, font);
        break;
      }
      case 'pill': {
        const gap = 46, ph = 170, pw = C * 0.8;
        W = C; H = C + gap + ph;
        cardPath = rrect(0, 0, C, C, R);
        under = `<path d="${rrect((C - pw) / 2, C + gap, pw, ph, ph / 2)}" fill="${fc}"/>`;
        over = textEl(label, C / 2, C + gap + ph / 2, pw * 0.8, 96, tc, font);
        break;
      }
      case 'corners': {
        const o = 82, e = 20, Lb = 175, rb = 46;
        W = C + 2 * o; cx = cy = o;
        H = label ? W + 150 : W;
        cardPath = rrect(o, o, C, C, R);
        const a = W - e;
        under =
          `<path d="M${e},${e + Lb}V${e + rb}Q${e},${e} ${e + rb},${e}H${e + Lb}` +
          `M${a - Lb},${e}H${a - rb}Q${a},${e} ${a},${e + rb}V${e + Lb}` +
          `M${e},${a - Lb}V${a - rb}Q${e},${a} ${e + rb},${a}H${e + Lb}` +
          `M${a - Lb},${a}H${a - rb}Q${a},${a} ${a},${a - rb}V${a - Lb}" fill="none" stroke="${fc}" stroke-width="26" stroke-linecap="round"/>`;
        if (label) over = textEl(label, W / 2, W + 62, C * 0.95, 112, fc, font);
        break;
      }
      case 'circle': {
        const hm = (k * n) / 2, Ri = Math.max(hm * Math.SQRT2 + k * 1.2, C * 0.5), ring = 170, Ro = Ri + ring, rm = Ri + ring / 2;
        W = H = 2 * Ro; cx = cy = Ro - C / 2;
        cardPath = circle(Ro, Ro, Ri);
        under = `<path d="${circle(Ro, Ro, Ro) + cardPath}" fill-rule="evenodd" fill="${fc}"/>`;
        defs.push(`<path id="${id}-arc" d="M${f(Ro - rm)},${f(Ro)}A${f(rm)},${f(rm)} 0 1 1 ${f(Ro + rm)},${f(Ro)}A${f(rm)},${f(rm)} 0 1 1 ${f(Ro - rm)},${f(Ro)}"/>`);
        if (label) {
          const F = FONTS[font] || FONTS.sans, len = Math.max(1, [...label].length);
          const fs = Math.min(92, (Math.PI * rm * 0.85) / (len * (F.w + F.ls)));
          over += `<text fill="${tc}" font-family="${F.family}" font-weight="${F.weight}" font-size="${f(fs)}" letter-spacing="${f(fs * F.ls)}" dominant-baseline="central"><textPath href="#${id}-arc" xlink:href="#${id}-arc" startOffset="25%" text-anchor="middle">${esc(label)}</textPath></text>`;
        }
        over += `<path d="${circle(Ro - rm, Ro, ring * 0.1) + circle(Ro + rm, Ro, ring * 0.1)}" fill="${tc}"/>`;
        break;
      }
      default:
        cardPath = rrect(0, 0, C, C, R);
    }

    /* background */
    let card = '';
    if (bg.mode !== 'transparent') {
      const gb = gradDef(`${id}-bg`, bg, cx, cy, C);
      if (gb) defs.push(gb);
      card = `<path d="${cardPath}" fill="${paint(`${id}-bg`, bg)}"/>`;
    }

    let content = under + card + `<g transform="translate(${f(cx)},${f(cy)}) scale(${f(k)})">${qrInner}</g>` + over;

    /* drop shadow (whole composition) */
    let sp = 0;
    if (fx.shadow) {
      const blur = clamp(fx.shadowBlur, 0, 80), dy = clamp(fx.shadowY, -60, 60);
      sp = Math.ceil(blur * 2.6 + Math.abs(dy) + 6);
      defs.push(
        `<filter id="${id}-sh" filterUnits="userSpaceOnUse" x="${-sp}" y="${-sp}" width="${f(W + 2 * sp)}" height="${f(H + 2 * sp)}" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="${f(dy)}" stdDeviation="${f(blur)}" flood-color="${col(fx.shadowColor)}" flood-opacity="${f(clamp(fx.shadowOpacity, 0, 1))}"/></filter>`
      );
      content = `<g filter="url(#${id}-sh)">${content}</g>`;
    }

    const vw = W + 2 * sp, vh = H + 2 * sp;
    const outW = opts.width || vw, outH = opts.width ? Math.round((opts.width * vh) / vw) : vh;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${f(outW)}" height="${f(outH)}" viewBox="${-sp} ${-sp} ${f(vw)} ${f(vh)}">` +
      (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
      content +
      `</svg>`;
    return { svg, width: vw, height: vh, version, n, ec, quiet: Q };
  }

  /* -------------------------------------------------------------- previews */
  const SAMPLE = [
    [1, 1, 0, 1, 1],
    [1, 0, 1, 1, 0],
    [0, 1, 1, 0, 1],
    [1, 1, 0, 0, 1],
    [1, 0, 1, 1, 1],
  ];
  function shapeThumb(kind, value) {
    const wrap = (vb, inner) => `<svg viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
    if (kind === 'body') return wrap('-0.4 -0.4 5.8 5.8', `<path d="${bodyPath(SAMPLE, 5, value, () => false, 0)}" fill="currentColor"/>`);
    if (kind === 'outer') return wrap('-0.6 -0.6 8.2 8.2', `<path d="${eyeOuter(value, 0, 0, 0)}" fill-rule="evenodd" fill="currentColor"/><path d="${rrect(2, 2, 3, 3, 0.4)}" fill="currentColor" opacity=".25"/>`);
    if (kind === 'inner') return wrap('0.4 0.4 6.2 6.2', `<path d="${rrect(0, 0, 7, 7, 1.4) + rrect(1, 1, 5, 5, 0.8)}" fill-rule="evenodd" fill="currentColor" opacity=".25"/><path d="${eyeInner(value, 0, 0, 0)}" fill="currentColor"/>`);
    return '';
  }

  /* ------------------------------------------------------------- rasterise */
  function svgToCanvas(svg, w, h, fill) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cv);
      };
      img.onerror = () => reject(new Error('Could not render image'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  root.QRRender = { build, getMatrix, svgToCanvas, iconSVG, shapeThumb, ICONS, LOGO_ICONS, BODY_SHAPES, EYE_OUTER, EYE_INNER, FRAMES, FONTS };
})(window);
