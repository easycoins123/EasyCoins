# EASYCOINS: data and asset provenance

Every external thing the product depends on, where it comes from, and whether we
are allowed to use it. Anything whose rights are uncertain is listed as blocked
rather than shipped.

## Runtime data

| Source | What it provides | Rights | Status |
|---|---|---|---|
| Our own PostgreSQL catalog | Games, products, variants, offers, prices, inventory, reviews, FAQ | Ours | **In use.** The only source of commercial data |
| Google Fonts (Heebo) | The typeface | SIL Open Font License, free for commercial use | **In use.** Loaded from Google's CDN |
| Google Identity (OAuth 2.0 / OIDC) | Sign-in | Free, subject to Google's API terms | **Architecture ready, unconfigured.** No credentials exist |

There is no third-party price feed, no scraped data, and no external product
catalog. Every figure a customer sees is computed by our backend from rows in
our own database.

### Live market data: deliberately not built

A FUT companion product would normally show live player prices from the in-game
transfer market. We do not, and the reason is worth recording.

EA publishes no public API for transfer-market prices. Sites that display them
obtain them by scraping the web app or by routing through customer accounts,
which raises both a terms-of-service question and, when accounts are involved, a
customer-safety question. Building on an unauthorised endpoint would also make a
core feature break whenever the other party changed it.

If live pricing becomes a product requirement, the options in order of
preference are: a licensed commercial data provider, an official partner
programme if one exists at the time, or nothing. Scraping is not on that list
without written legal sign-off, and it would have to be documented here first.

## Fonts

**Heebo**, via Google Fonts. Open Font License, commercial use permitted, no
attribution required in the interface. It carries Hebrew and Latin in one family,
which matters for a Hebrew interface with English gaming terms in it.

Two requests per page go to `fonts.googleapis.com` and `fonts.gstatic.com`. That
is a third-party connection and belongs in the privacy notice. Self-hosting would
remove it and is a small, worthwhile change before launch.

## Brand assets

All original, produced for this project. Sources and regeneration are in
[BRAND-AND-ASSETS.md](BRAND-AND-ASSETS.md).

| Asset | Origin | Rights |
|---|---|---|
| `logo-mark.svg`, `favicon.svg` | Drawn for EASYCOINS | Ours |
| `icon-32.png`, `apple-touch-icon.png`, `icon-512.png`, `favicon.ico` | Rendered from the vector mark by `qa/make-brand-assets.mjs` | Ours |
| `social-preview.png` | Composed from the mark and brand palette | Ours |
| 18 interface icons | Hand-drawn SVG paths in `icon.component.ts` | Ours |
| 8 product illustrations | Drawn for this project | Ours, **temporary**: shared across products rather than art-directed per product |

## Game names and marks

EA SPORTS FC, PlayStation, Xbox, Fortnite, Call of Duty, NBA 2K and every other
game or platform name in the catalog belongs to its owner. They appear as product
identification only, which is what the disclaimer at `/ip` states.

**No publisher artwork, logo or key art is used anywhere in the product.** The
game cards use an original per-game colour treatment instead. That was a
deliberate choice: publisher key art would look better and we do not have the
right to it.

If licensed key art is obtained later, it goes in `src/assets/games/` and each
file gets a row in this table with the licence and its expiry.

## Competitor research

Two established competitors (an international FC price-and-asset site and an
Israeli coin seller) were studied for product and UX principles: bundle laddering,
per-unit price comparison, objection-first FAQ ordering, delivery-time
communication, and discovery architecture.

**Nothing was copied.** No logo, screenshot, illustration, icon, stylesheet,
colour palette or line of copy from either site is present in this repository.
The palette, the mark, the icons, the layouts and the Hebrew copy are original.

## Rules

1. Nothing ships without a row in this file.
2. Anything with uncertain rights is blocked, not shipped with a note.
3. No runtime dependency on an endpoint we are not authorised to call.
4. Assets are local and versioned with the build. Nothing loads from an
   unknown host at runtime.
5. When a licence expires or changes, this file is what tells us.
