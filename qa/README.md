# QA harnesses

Browser QA for EASYCOINS. Each script builds nothing itself — run `ng build`
first, or use the `npm run qa:*` wrappers which build for you. Each starts its
own static server over `dist/top-token` (SPA history fallback), so nothing has to
be running beforehand.

| Script | What it proves |
|---|---|
| `route-sweep.mjs` | Every route at 6 viewports: no blank screens, console errors, failed requests, broken images, horizontal overflow; RTL, alt text, labelled controls, one `h1` |
| `flows.mjs` | The purchase flow end to end, cart behaviour, hostile `localStorage`, dynamic checkout requirements, region safety, every payment branch, duplicate-submit protection |
| `a11y.mjs` | Keyboard reachability, focus visibility, skip link, heading structure, contrast, reduced motion, touch targets, RTL rendering |
| `perf.mjs` | Bundle sizes, FCP/LCP/CLS per route, duplicate requests, lazy-chunk behaviour |
| `security-scan.mjs` | Static credential/secret scan plus runtime checks of browser storage, cookies, third-party requests and analytics payloads |

Results land in `qa/out/*.json`; screenshots in `qa/screenshots/`.

Both are generated output and are git-ignored.

## Caveats

- Timings come from a local uncompressed static server. They are useful for
  spotting regressions, not for predicting field performance on 4G.
- The a11y harness checks what can be checked mechanically. It is **not** a
  screen-reader pass and not an Israeli-standard 5568 audit.
