# FC27 Israeli coin market snapshot

Owner-facing research record for the FC27 launch round. Every figure below was
read from a live page on the date stated, not from memory or from FC26 pricing.
Sellers that publish no FC27 price are marked NOT PUBLICLY VERIFIED.

Checked: **2026-09-23, 22:00–22:40 UTC (2026-09-24 01:00–01:40 Israel)**.
Worldwide FC27 launch: 2026-09-25. Early access already live.

Method: pages were downloaded with `curl` and read raw; the FUTGOAT figure
comes from the price array its own configurator ships to the browser
(`C.prices`, step 25K, 100K–10M), so every quantity below is the exact number
the page would display. FIFA Coins Israel publishes a fixed ladder.

## 1. Sellers found

| Seller | URL | FC27 priced publicly | Notes |
|---|---|---|---|
| FUTGOAT (Open Game Limited, HK-registered, Israeli-facing) | https://futgoat.com/fc27-coins/ | **Yes** | Custom-amount slider 100K–10M, five anchored packages, creator-code field (percentage off), FC27 wallet credit from FC26 purchases |
| FIFA Coins Israel | https://fifacoinsisrael.com/shop/ | **Yes** | Fixed ladder 100K–3M, "10% בונוס על הקוינס" site-wide tagline, trading method |
| Keysforgames.co.il | https://www.keysforgames.co.il/fc-27-coins/ | Aggregator only | Lists international suppliers (U7BUY, MuleFactory, G2G, Eneba); not an Israeli seller with its own delivery |
| RoyalCoins (royalcoins.co) | https://royalcoins.co/ | NOT PUBLICLY VERIFIED | Domain did not resolve at check time; search snippet advertises FC26 only |
| Instagram / Facebook sellers (fifa__coins.il, fifa.coins.il11, futgoat_coins) | social profiles | NOT PUBLICLY VERIFIED | No public FC27 price list; DM-based |
| SE-Keys, Bug, Dominator, KSP-type retailers | game keys/discs | n/a | Sell the game, not coins |

## 2. Verified prices

### FUTGOAT — FC27 (all platforms, one price)

Configurator constants: `minK 100, maxK 10000, stepK 25, rateK 0.9`. Anchored
packages shown as chips: 100K ₪99 ("מינימום הזמנה"), 300K ₪295, 500K ₪475,
1M ₪895, 2.25M ₪1,899 ("חבילת פרו"). Creator code: a cookie `fgr_gift`
carries `code|pct|exp`; when present the button shows the struck full price and
the price after `pct` percent. A public example of such a code is 5%.

| Quantity | Price ₪ | ₪ / 100K | ₪ / 1M |
|---|---|---|---|
| 100K | 99 | 99.00 | 990 |
| 250K | 246 | 98.40 | 984 |
| 500K | 475 | 95.00 | 950 |
| 1M | 895 | 89.50 | 895 |
| 2M | 1,698 | 84.90 | 849 |
| 2.25M | 1,899 | 84.40 | 844 |
| 5M | 4,220 | 84.40 | 844 |
| 10M | 8,440 | 84.40 | 844 |

Other terms (תקנון, read 2026-09-23): price includes VAT; "5% מס המשחק מכוסה"
(the EA 5% transaction tax is covered, full amount delivered, with a reserved
right to deliver 95%); cancellation only before delivery starts, fee 5% or
₪100 whichever is lower; delivery "רוב ההזמנות בתוך 5 דקות"; hours 13:00–23:59;
payment VISA / Google Pay / Apple Pay. FC27 wallet credit: 100% of what was
paid for FC26 coins during the preparation campaign is credited to the wallet,
redeemable 15/09/2026–30/11/2026, at most 20% of any single order. Home page
title still says "10% מתנה"; the FC27 article says 5% wallet gift "לזמן
מוגבל". Neither is an immediate price cut: both are deferred wallet value.

### FIFA Coins Israel — FC27

Site-wide tagline "שיטה בטוחה מבאן | אספקה מהירה | 10% בונוס על הקוינס". The
100K product page shows the arithmetic explicitly (בסיס 100,000 + בונוס 10,000
= 110,000). The bonus is therefore counted as received coins below.

| Quantity | Price ₪ | ₪ / 100K bought | Received with 10% | ₪ / 100K received |
|---|---|---|---|---|
| 100K | 95 | 95.00 | 110K | 86.36 |
| 200K | 180 | 90.00 | 220K | 81.82 |
| 300K | 270 | 90.00 | 330K | 81.82 |
| 400K | 360 | 90.00 | 440K | 81.82 |
| 500K | 420 | 84.00 | 550K | 76.36 |
| 600K | 500 | 83.33 | 660K | 75.76 |
| 700K | 580 | 82.86 | 770K | 75.32 |
| 800K | 640 | 80.00 | 880K | 72.73 |
| 900K | 730 | 81.11 | 990K | 73.74 |
| 1M | 820 | 82.00 | 1.1M | 74.55 |
| 2M | 1,600 | 80.00 | 2.2M | 72.73 |
| 3M | 2,300 | 76.67 | 3.3M | 69.70 |

Other terms: hours 10:00–23:00; delivery "10-40 דקות" for most orders; a
10K coin balance is required in the account before transfer; EA's 5% tax is
"covered on some orders" only (FAQ); payment Apple Pay, Google Pay, Visa,
Mastercard; no public coupon or first-order discount found; platform is chosen
at checkout: the 1M product page shows a "בחירת קונסולה" dropdown (Xbox, PC,
PlayStation) at one price, ₪820, so pricing does not differ by platform. Members
of its loyalty club are shown "41.00 ₪ להזמנה עתידית" on the 1M product, i.e.
5% of the price as deferred credit for a future order.

### Public promotions seen

| Seller | Promotion | Type | Verified |
|---|---|---|---|
| FUTGOAT | FC26→FC27 wallet credit, 100% of FC26 spend, max 20% per order, until 30/11/2026 | deferred value | yes (תקנון) |
| FUTGOAT | "10% מתנה" (home title) / "5% מתנה בארנק FC27" (article) | deferred value | wording conflicts between pages |
| FUTGOAT | Creator codes, percentage off, applied at the configurator | immediate | mechanism verified; 5% example found in search only |
| FIFA Coins Israel | 10% bonus coins | immediate (coins) | yes (tagline + 100K product arithmetic) |
| FIFA Coins Israel | Loyalty club credit, 5% of the order for a future order | deferred value | yes (1M product page) |

## 3. Normalized matrix (₪, one price for every platform where verified)

| Seller | 100K | 250K | 500K | 1M | 2M | 5M | 10M | ₪/100K at 1M | Best public promotion | Effective at 1M |
|---|---|---|---|---|---|---|---|---|---|---|
| FUTGOAT | 99 | 246 | 475 | 895 | 1,698 | 4,220 | 8,440 | 89.50 | 5% creator code (immediate) | ₪850 → 85.0/100K |
| FIFA Coins Israel | 95 | — | 420 | 820 | 1,600 | — | — | 82.00 | +10% coins (immediate) | 74.55/100K received |

Strongest verified competitor offer: **FIFA Coins Israel at 1M: ₪820 for
1.1M delivered = ₪74.55 per 100K received** (₪69.70 at 3M). FUTGOAT is dearer
at every quantity but promises faster delivery and full tax coverage.

## 4. EasyCoins today (production, read 2026-09-23)

The live catalog sells **FC26** coins at ₪15 (100K) … ₪75 (1M) … ₪335 (5M)
with a 10% launch bonus: ₪6.8/100K at 1M. That is an end-of-season FC26 price
(FUTGOAT's own FC26 page runs ₪100/1M ≤1M down to ₪75/1M above 10M), and it
must not be carried into FC27, where the market is ten times higher.

## 5. Economics known to the system

Recorded in the pricing configuration (`backend/src/modules/pricing`):
supplier cost per 1M FC27 coins — **UNKNOWN**. Payment processing cost —
UNKNOWN (payments are simulated in production). EA 5% transfer tax — a real
delivery cost when coins move through the transfer market (the seller either
delivers 95% or buys 5.26% more); modelled as a configurable delivery loss.

Because supplier cost is unknown, no FC27 price is activated by this round.
The proposed ladder below is stored as a draft the owner can review, cost,
and activate from the admin.

## 6. Proposed EasyCoins FC27 ladder (DRAFT, not active)

Positioned to beat the strongest verified effective rate at every anchor by a
visible margin, with the value curve steeper than both competitors so that
"more coins = better rate" reads instantly.

| Package | Coins | Price ₪ | ₪ / 100K | vs FUTGOAT | vs FCI (received) |
|---|---|---|---|---|---|
| Starter | 100K | 85 | 85.00 | −14% | −2% |
| Starter | 250K | 205 | 82.00 | −17% | −0% |
| Pro | 500K | 375 | 75.00 | −21% | −2% |
| Pro | 750K | 545 | 72.67 | | |
| Elite | 1M | 699 | 69.90 | −22% | −6% |
| Elite | 1.5M | 1,029 | 68.60 | | |
| Legend | 2M | 1,339 | 66.95 | −21% | −8% |
| Legend | 3M | 1,959 | 65.30 | | −6% |
| Legend | 5M | 3,199 | 63.98 | −24% | |
| Legend | 10M | 6,199 | 61.99 | −27% | |

First-order benefit (draft): **FIRST KICK** — 10% bonus coins on the first paid
order, capped at 100K bonus coins, not combinable with a creator code or a
percentage coupon. Returning value: EasyClub tier bonus coins on the next order
(existing growth architecture). Creator codes: percentage off, configurable
per code, non-stackable with FIRST KICK. Referral: friend gets FIRST KICK
terms, referrer gets bonus coins after the friend's order is paid and
delivered.

Maximum stacked customer value on one order under the draft policy:
one percentage benefit (largest of FIRST KICK 10% coins / creator code / coupon)
plus tier bonus coins ≤ 5%, so at most 15% extra coins or equivalent, never a
price cut below the ladder price minus the configured maximum discount.

Contribution per order: **cannot be calculated** until supplier cost is
entered. The admin refuses to activate the FC27 ladder while the cost basis is
missing or while any package would fall below the configured margin floor.

## 7. Still unknown

- Supplier cost per 1M FC27 coins, by platform.
- Payment processing fee (no live provider yet).
- Whether FIFA Coins Israel prices differ by platform.
- FUTGOAT's live creator-code percentages (only the mechanism is verifiable).
- Both competitors' actual delivery reliability at launch load.
