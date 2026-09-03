# Design reference

`easycoins-final-reference.png` is the canonical visual target for the
storefront (black and gold, cinematic hero with the EasyCoins coin, a trust
rail, a five-tier package shelf with progressive artwork, a three-step
process, reviews, "why EasyCoins", footer). It was supplied by the project
owner in September 2026 and should be committed here so it can be opened
beside the rendered screenshots in `qa/screenshots/`.

The reference is a visual target, not a content source. Claims shown in the
mockup (customer counts, rating scores, support hours, delivery minutes,
guarantees) are illustrative; the product only shows what its data and
policies actually support. See CONTRIBUTING.md, "Copy policy".

The mockup's player card is a placeholder for the idea "Ultimate Team". The
product uses an original EasyCoins card language (`tt-emblem-card`) and never
a real player, club badge or EA card frame; see CONTRIBUTING.md, "Asset
policy".

## Coin artwork sources

`source/fut-hero-master.webp` (transparent, 1536x1024) and
`source/fut-sheet-master.webp` (a 3x3 sheet of compositions on black,
1536x1024) are the approved FUT coin renders supplied by the project owner in
September 2026, stored losslessly. `node qa/bake-fut-art.mjs --sheet` bakes
every composition the storefront uses from them and writes a contact sheet to
`qa/out/fut-contact-sheet.png` for review. Which tile becomes which package
is decided in that script, in one table.
