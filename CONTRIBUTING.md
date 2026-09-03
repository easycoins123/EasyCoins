# Contributing to EASYCOINS

This file covers the rules that are enforced by tooling. Architecture and
product documentation lives under `docs/`.

## Working locally

| Task | Command |
|---|---|
| Storefront, mock API | `npm start` |
| Production build | `npm run build` |
| Unit tests (Karma) | `npm run test:ci` |
| Asset compliance | `npm run test:compliance` |
| Browser harnesses (routes, flows, a11y, security, perf, compliance) | `npm run qa:all` |
| Card visual regression | `npm run qa:cards` |
| Network audit (every request same-origin or allow-listed) | `npm run qa:network` |
| Visual audit at twelve widths | `node qa/visual-audit.mjs` |

The backend has its own scripts under `backend/`.

## Asset policy

EasyCoins owns its visual layer. The product being sold is coins, so the visual
language is built around coins, value, gaming and trust, never around another
company's player cards. This is both a brand decision and a legal boundary.

### Never use

The following are prohibited in production code, tests, fixtures, comments,
placeholders, seed data, stylesheets, JSON, Markdown consumed by the app, or
documentation scanned by the compliance test:

- Third-party FC/FUT asset hosts: `fut.gg` (including its `game-assets`
  CDN), `futbin`, `futwiz`, `sofifa` (including its CDN)
- EA asset URLs: `easports.com`, `ea.com` image URLs, `utas.*.fut.ea.com`
- FutDB image endpoints (FutDB may be used for data only, if a feature ever
  needs player data)
- Scrapers of any of the above, game-file extraction, EA account automation,
  legacy FUT API clients, headless browsers used to acquire assets
- Hotlinked or copied EA/FUT images, EA card frames, FUT card designs
- EA SPORTS FC or FUT logos as decorative assets
- Club badges and league logos
- PlayStation and Xbox logo artwork (platforms are named in text and drawn
  with EasyCoins' own neutral glyphs)
- Identifiable footballers on any commercial or promotional surface

If an implementation seems to need one of these, redesign the implementation.
Do not add it "temporarily".

### Use instead

- **Cards** are code: CSS, SVG, gradients, borders, typography and original
  artwork. They are not rasterised images. See
  `src/app/ui/components/cards/`.
- **Coin artwork** is original and drawn by `tt-coin-art`. The vector is the
  source of truth and the final fallback. The raster versions under
  `src/assets/products/` (`coins-<tier>.avif|webp` for the card composition,
  `coins-legend-hero.avif|webp` for the hero) are baked from that exact
  markup by `node qa/bake-coin-art.mjs` with a brushed-metal grain, a
  specular highlight and a bevelled rim, and registered per composition in
  `src/app/ui/components/cards/art-sources.ts`. Tiles stay vector. Rebake
  after changing the drawing; the compliance test enforces a 160 KB per-file
  and 640 KB total ceiling and that every raster ships in both formats.
- **Tiers** are EasyCoins' own: Starter, Pro, Elite, Legend, defined once in
  `src/app/ui/components/cards/tiers.ts` and in `src/styles/_tokens.scss`.
  They are not a bronze / silver / gold imitation.
- **Football atmosphere** without player IP: stadium light, pitch textures,
  crowds, abstract motion. Nominative use of a game's name in text is fine;
  its logo is not.
- **Flags**, if nation data is ever shown, come from `flag-icons` (MIT).
- **Player data**, if ever needed, uses the `FcPlayer` type in
  `src/app/domain/catalog/fc-player.ts`. It has no image field and may not
  gain one.

### How it is enforced

- `qa/compliance/assets.compliance.test.ts` scans `src/`, `admin/src/`,
  `backend/`, `docs/`, `qa/` and the root configuration for the prohibited
  hosts and patterns (case-insensitive), rejects remote image URLs in the
  storefront, checks that `FcPlayer` has no image field, and checks that every
  product raster asset ships as both AVIF and WebP. The only files excluded
  from the scan are the guards themselves: this file, the test, and
  `qa/network-audit.mjs`, which name the hosts in order to detect them.
- `src/app/domain/catalog/fc-player.spec.ts` makes the unit suite fail to
  compile if an image field is added to `FcPlayer`.
- `qa/network-audit.mjs` loads every route in a real browser and fails if any
  request leaves the origin for anything other than the allow-listed font
  hosts.

## Copy policy

Never invent reviews, ratings, customer counts, sales numbers, guarantees,
delivery times, security claims, payment providers or business claims. Only
data the backend actually holds is shown, and development seed data is not
presented as social proof.

## Git

Work lands on the official repository's `master` through ordinary merge
commits. No history rewriting, no force pushes. Every commit, push and
deployment is approved explicitly by the project owner.
