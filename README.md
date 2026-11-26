# QR Studio

A free, private QR code designer that runs entirely in your browser — no sign-up, no tracking, codes never expire.

**Live:** https://faarisaahmed.github.io/qr-maker/

## Features

- **10 content types** — Website, Text, Wi‑Fi, Email, Phone, SMS, Contact (vCard), Location, Calendar event, WhatsApp
- **15 module patterns** — square, rounded, fluid, soft, dots, tiny dots, bubbles, classy, leaf, diamond, plus, vertical/horizontal lines, stars, hearts
- **7 corner frames × 8 corner dots**, mirrored so asymmetric shapes point outward
- **Colors** — solid, linear or radial gradients, custom corner colors, gradient or transparent backgrounds, quick palettes
- **Logos** — 17 built-in icons or upload your own (drag & drop / paste), with backdrop and auto error-correction
- **8 frames** with call-to-action text — border, label above/below, speech bubble, button, viewfinder, circular badge
- **Effects** — rounded corners, drop shadow, neon glow, 3D depth
- **16 templates** + “Surprise me” random styles
- **Live scan test** — every change is decoded with jsQR to confirm it scans
- **Export** PNG, SVG, JPG, WebP at up to 4096 px; copy to clipboard; print
- **Batch mode** — one code per line, downloaded as a ZIP
- Undo/redo, share links, saved designs, auto-save, dark mode, mobile-friendly

## Run locally

It's a static site with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

GitHub Pages serves the repository root of `main`. Push and it's live.

## Credits

Bundled in `vendor/` (MIT): [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), [jsQR](https://github.com/cozmo/jsQR), [JSZip](https://github.com/Stuk/jszip).
“QR Code” is a registered trademark of DENSO WAVE INCORPORATED.
