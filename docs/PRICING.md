# Pricing, the FC27 ladder and the launch offer

How a price gets from the owner's decision to a customer's checkout, what
can move it, and what can never move it. Read with
[FC27-MARKET-SNAPSHOT.md](FC27-MARKET-SNAPSHOT.md) (the research) and
[GROWTH-AND-REWARDS.md](GROWTH-AND-REWARDS.md) (the reward ledger).

## 1. One source of truth

At runtime a price is `offers.price_amount_minor`, integer agorot, and nothing
else. Two writers exist: `backend/prisma/seed.ts` (development data) and the
pricing module's ladder activation (`backend/src/modules/pricing/ladder.service.ts`),
which the owner drives from the admin. No request body is ever read for a price.

Configuration lives in `backend/src/modules/pricing/pricing-config.ts`: code
carries the defaults, `growth_settings` rows prefixed `pricing.` carry the
owner's overrides, `sanitizePricingSetting` validates every write and every
read. Integers only: agorot for money, basis points for percentages
(100 bps = 1%).

| Key | What it holds | Default |
|---|---|---|
| `economics` | supplier cost per 1M (null = unknown), per-platform overrides, payment fee bps, delivery loss bps (the in-game 5% tax = 526 bps of coins bought), margin floor bps, VAT bps | cost unknown, fee 0, loss 526, floor 2000, VAT 1800 |
| `ladder` | the FC27 packages (key, coins, price, bonus, tier, recommended, active), platform adjustments bps, maximum discount bps, max per order, status draft/active | the launch ladder in §4, **active**, max discount 1500 |
| `launch` | FIRST KICK: enabled, dates, percent bps, cap coins, minimum order, eligibility, redemption cap, terms | disabled, 10%, cap 100K, min ₪50, 25/09–31/10/2026 |
| `competitors` | the snapshot: seller, URL, checkedAt, platform, coins, price, promotion, effective price, notes | the 2026-09-23 snapshot |

## 2. The owner's controls (admin, `/api/v1/admin/pricing`)

Behind the operator bearer token, with an audit row per change:

- `GET/PUT/DELETE settings/:key` — read, override, reset any key above.
- `GET evaluation[?platformId]` — every active package with ₪/100K, ₪/1M, net
  revenue after VAT, coins to buy (loss included), supplier cost, payment fee,
  contribution and margin, plus the activation gate's answer.
- `GET ladder/preview` — what activation would write.
- `POST ladder/activate { acknowledgeUnknownCost? }` — writes the FC27
  product, one variant per package, one offer per package × platform
  (PS5, PS4, Xbox, PC), retires the FC26 offers, marks the ladder active.
- `POST ladder/republish` — rewrites the rows after editing an active ladder.
- `POST ladder/deactivate` — FC26 back on sale, FC27 offers off. A rollback.
- `GET/POST/PATCH codes`, `GET codes/:code/attribution` — creator codes.
- `GET storefront` — which edition is on sale, from the offers.

The admin app has these on `/pricing` and `/pricing/codes`.

## 3. The safety rails

Validation refuses, before anything is stored:

- a price under ₪1 or over ₪1,000,000, or a fraction of an agora;
- a bonus larger than the package;
- a ladder where a bigger package is dearer per coin, or where a bigger
  package is cheaper in total (compared without division);
- two recommended packages, duplicate keys or amounts;
- a maximum discount above 50%, a platform adjustment beyond ±50%;
- a launch offer above 30% extra coins, ending before it starts, or with an
  eligibility other than first order;
- a creator code above 30% off, shorter than 3 or longer than 20 characters,
  ending before it starts;
- a competitor entry without a URL or a timestamp.

Activation refuses:

- with an **unknown supplier cost**, unless the operator sends
  `acknowledgeUnknownCost: true`, which is recorded with their name; there is
  no margin check in that case and the audit row says so;
- with a **known cost**, any active package whose contribution margin is under
  the configured floor, by name, including packages a negative platform
  adjustment would push under. No acknowledgement overrides this.

Contribution per package = net revenue (price ÷ 1.18 when VAT is included)
− supplier cost (coins delivered × (1 + delivery loss) × cost per 1M, rounded up)
− payment fee (price × fee bps, rounded up). Costs round up and contribution
rounds down; a ladder that passes does so with room.

## 4. The FC27 launch ladder (active since 2026-09-25)

| Package | Coins | ₪ | ₪/100K | vs FUTGOAT | vs FIFA Coins Israel (received) |
|---|---|---|---|---|---|
| Starter | 100K | 85 | 85.00 | −14% | −2% |
| Starter | 250K | 205 | 82.00 | −17% | 0% |
| Pro | 500K | 375 | 75.00 | −21% | −2% |
| Pro | 750K | 545 | 72.67 | | |
| Elite (recommended) | 1M | 699 | 69.90 | −22% | −6% |
| Elite | 1.5M | 1,029 | 68.60 | | |
| Legend | 2M | 1,339 | 66.95 | −21% | −8% |
| Legend | 3M | 1,959 | 65.30 | | −6% |
| Legend | 5M | 3,199 | 63.98 | −24% | |
| Legend | 10M | 6,199 | 61.99 | −27% | |

No launch bonus on the rungs: the value is in the price, which is what a
customer comparing two tabs reads first. No struck-through prices: nothing
here was ever sold at another price.

**How it went live.** The supplier cost is unknown to the system, so no
margin is computed or claimed anywhere; the admin's evaluation says UNKNOWN
until a cost is entered. On 2026-09-25 the owner authorised these selling
prices for production regardless. The decision is recorded as the code
default `ladder.status: 'active'`; the seed, which runs on every API build,
applies the effective configuration (defaults under admin overrides) to the
catalog through `ladder-writer.ts`, the same code the admin's activate
button uses. A deploy therefore confirms the edition on sale and cannot
revert it; deactivating from the admin stores a `draft` override, which the
next deploy respects just the same.

## 5. The launch offer: FIRST KICK

Bonus coins on a customer's first paid order: 10% of coins bought, capped at
100K, on orders of ₪50 and up, paid in coins with the order, never as money
off. Decided by the server when it prices the cart (`FirstOrderService`):
first order means no qualifying order by the same account, the same browser
session, or, at order creation, the same email. A fresh browser with a known
email gets the benefit shown provisionally in the cart and removed at order
creation, with the reason on the order.

Disabled by default; the owner enables it under `launch`. Dates are real
server dates; the storefront shows a deadline only because the server has one.

## 6. Stacking policy (`benefit-policy.ts`)

| Benefit | Combines with | Never with | Max on one order | Trigger | Enforced |
|---|---|---|---|---|---|
| LAUNCH_BONUS (catalog bonus coins) | REWARD, FIRST_ORDER, LOYALTY | COUPON | the variant's bonus | line carries `launchBonus` | server, per line |
| REWARD (EasyDrop card, referral, campaign, EasyBack) | LAUNCH_BONUS, FIRST_ORDER, LOYALTY | COUPON, a second REWARD | one reward; credit ≤ subtotal | chosen in the cart, owned, eligible | server, ledger hold |
| FIRST_ORDER (FIRST KICK) | LAUNCH_BONUS, REWARD, LOYALTY | COUPON | 10% coins, cap 100K | first paid order, offer live | server, re-checked by email |
| LOYALTY (tier perk, when configured) | the three above | COUPON | as configured | tier | server |
| COUPON (coupon or creator code) | nothing | everything | ladder `maxDiscountBps` (15%) | typed code, active, dated, min subtotal, caps | server, coupon row, redemption row |

Precedence when two cannot share: LAUNCH_BONUS > REWARD > FIRST_ORDER >
LOYALTY > COUPON. The customer sees which applied and which was set aside,
with the reason, in the cart, at checkout and on the order.

**Maximum customer value on one order, under the defaults:** one wallet
reward (at most 50K coins or ₪10 credit from the EasyDrop VIP pool) plus
FIRST KICK (10% coins, cap 100K), and never a code on top; or a code alone,
capped at 15% of the subtotal. On a 1M order that is at most 150K extra coins
(15%) with no price cut, or ₪104.85 off (15%) with no extra coins.

## 7. Creator codes

Coupon rows on the existing tables, created from the admin: code, creator,
percent (1–30%), dates, minimum subtotal, redemption cap, active. The
promotion slug starts with `creator-` and its description names the creator.
Every order that used a code carries it in `orders.coupon_code`; every
redemption is a `coupon_redemptions` row and increments the coupon's count, so
the attribution report is a query. A paused code is worth nothing at once.

## 8. EASY MATCH

Not an automatic promise. The FAQ tells a customer who found a lower public
Israeli price for the same platform, quantity, delivery and payment terms,
VAT included, to send the link through the support form; the owner reviews it
by hand and replies by email. The rule stays manual until the business decides
otherwise.

## 9. Editions

`GET /api/v1/storefront` says which edition is on sale: FC27 when the FC27
product has live offers, FC26 otherwise. The storefront reads it once per
session (`StorefrontFacade`) and every hero, shelf, title, description and
JSON-LD block follows. Historical orders keep their edition: each order item
answers `edition` from the product it was sold under, so an FC26 order reads
FC 26 after the switch and keeps its frozen prices.

The sitemap follows the same state: `GET /api/v1/sitemap.xml` (served at
`/sitemap.xml` on the storefront host) lists a product URL only for an
edition with live offers, so nothing is advertised that has nothing to buy.

## 10. Runbook: operating the FC27 ladder

FC27 is on sale and FIRST KICK runs from 25/09 to 31/10/2026, both from the
code defaults. From the admin:

1. Pricing → Economics: enter the supplier cost per 1M (and per platform if
   it differs), the payment fee, the margin floor. Save. Until then every
   margin reads UNKNOWN and the page says so.
2. Read the evaluation table. A red row means the ladder needs a higher price
   or a cheaper supply.
3. Edit the ladder if needed (prices in whole shekels; the validator refuses
   an inverted ladder). Save, then press **Republish** to rewrite the rows.
4. To roll back, press **Deactivate**: FC26 returns, FC27 comes off, and the
   stored `draft` override survives every later deploy. **Activate** brings
   FC27 back.
5. Switch FIRST KICK under Launch; create and pause creator codes as
   agreements are signed.

No deploy is needed for any step, and no deploy undoes one.
