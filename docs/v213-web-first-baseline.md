# v213 Web First / PWA / Capacitor-ready baseline

Base main: `8842727202180933f7643e193890ee89258fdf34` (v212).

This file exists only to establish a CI/build baseline before the minimal v213 platform/config changes. It is not imported by the app and does not affect the production bundle.

Constraints:
- Web First, PWA preserved, Capacitor-ready only.
- No Capacitor/Firebase/native dependency.
- No Android/iOS project.
- No Service Worker rewrite.
- No Cloudflare D1/R2/KV architecture change.
- Keep current routes, SEO, share URLs and auth behavior unless fixing a confirmed bug.
