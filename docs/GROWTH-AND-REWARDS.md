# Growth and rewards

The customer-value system: EASYDROP, EASYCLUB, custom coins, the player goal,
referral, the founders' seats, the streak, EasyBack, the Drop Zone and the
trust metrics. One principle runs through all of it: **the server issues,
prices, redeems and counts; the storefront only shows what the server says.**

Code: `backend/src/modules/growth/`. Configuration defaults:
`growth-config.ts` (`GROWTH_DEFAULTS`), overridable per key through
`PUT /api/v1/admin/growth/settings/:key` (stored in `growth_settings`,
validated by `sanitizeGrowthSetting`, cached for 30 seconds).

## 1. What is real and active, what is built but off

| Programme | State | Where it shows |
|---|---|---|
| EASYDROP (guaranteed post-purchase reward) | **active** by default | order page after payment; reward saved in EASYCLUB |
| EASYCLUB (points, tiers, wallet, history) | **active** (computed from paid orders) | `/account/club`, account page, header menu |
| Custom coins (amount / budget) | **active** | store, "כמות מותאמת" |
| Player goal calculator | **active**, manual entry only | store, "כמה חסר לי?" |
| Referral (friend brings friend) | **active** | `/account/club`, `/r/:code` |
| Founders' seats (FIRST XI) | **active**, cap 100 | `/account/club`, offers page |
| Streak (#2, #3 rewards) | **active** | `/account/club` |
| Drop Zone campaigns | **built**; one campaign seeded as **DRAFT** (not visible) | `/deals`, home rewards band |
| EasyBack (comeback credit) | **built, disabled** (`easyback.enabled: false`) | nowhere until enabled |
| Trust metrics | **built**; publishes only past thresholds (none met yet) | home, above the trust rail |
| Verified reviews | **active** submission; publication is manual (`autoPublishVerified: false`) | order page when FULFILLED; admin review queue |
| Live player-price lookup | **not built** (COMING SOON internally) | never shown as available |
| EXTRA_COINS and OFFER_UNLOCK reward kinds | **refused** by configuration validation in V1 (nothing can deliver or honour them yet) | – |

"Active" means the code path runs on a real paid order. No reward has been
valued against supplier cost, because no verified supplier cost exists; the
defaults below are deliberately small and every one is configurable before
production activation.

## 2. Configuration values (defaults)

### EASYDROP
- `easydrop.enabled` true · `cardsPerDrop` 3 · `rewardDays` 30 (reward expiry)
- Pools by paid order total (in shekels; the first pool whose threshold the
  order reaches, highest first):
  - **DROP** (≥ ₪0): NEXT_ORDER_COINS 10,000 (min next order ₪31) weight 50 ·
    POINTS_BONUS 50 weight 30 · NEXT_ORDER_CREDIT ₪3 (min ₪39) weight 20
  - **DROP+** (≥ ₪60): NEXT_ORDER_COINS 25,000 (min ₪58) weight 45 ·
    POINTS_MULTIPLIER ×2 weight 25 · NEXT_ORDER_CREDIT ₪5 (min ₪58) weight 30
  - **VIP DROP** (≥ ₪150): NEXT_ORDER_COINS 50,000 (min ₪109) weight 45 ·
    NEXT_ORDER_CREDIT ₪10 (min ₪109) weight 30 · TIER_BOOST +1 tier for 30
    days weight 25
- Every card in a pool is a reward. There is no empty card and no "lost".

### EASYCLUB
- `pointsPerShekel` 1 (on the paid total, after discounts)
- Tiers: STARTER 0 · PRO 250 · ELITE 750 · ICON 2,000 points (perk text only;
  no automatic monetary perk is granted by tier in V1)
- `tierBoostDays` 30

### Founders (FIRST XI)
- enabled · cap 100 · reward POINTS_BONUS 100 on the customer's first paid
  order from an authenticated account · owner can disable or change the cap

### Streak
- enabled · window 60 days between paid orders · order #2 POINTS_BONUS 100 ·
  order #3 POINTS_BONUS 200 · nothing after #3 in V1

### Referral
- enabled · referrer reward NEXT_ORDER_COINS 25,000 (min ₪31) · friend
  reward NEXT_ORDER_COINS 10,000 (min ₪31) · attribution 30 days · friend's
  first order must be ≥ ₪15 · cap 10 referrer rewards per calendar month

### EasyBack
- **disabled** · when enabled: NEXT_ORDER_CREDIT ₪5, min order ₪50, 30 days,
  first-order customers only (`eligibility: 'first-order'`)

### Custom coins
- enabled · 100,000 to 10,000,000 coins · step 10,000 · price = per-coin rate
  of the largest ladder rung at or below the amount, rounded up to a whole
  shekel · bonus = that rung's launch-bonus rate, floored to 1,000 · maximum
  one custom line per order · unused custom offers pruned after 7 days

### Trust
- enabled · publish thresholds: completed orders 25 · coins delivered
  25,000,000 · fulfillment samples 20 (median time) · repeat customers 10 ·
  verified reviews 5 · a metric below its threshold is simply absent

### Reviews
- `autoPublishVerified` false: a verified review is stored unpublished until
  an admin publishes it

## 3. Anti-abuse rules (all server-side)

**Rewards ledger**
- One reward per `(source, sourceOrderId)` (unique index); re-running the
  paid event never issues twice.
- A reward is reserved for an order with a conditional update
  (`status = AVAILABLE AND redeemedOrderId IS NULL`), redeemed inside the
  payment settlement transaction, released if the order is cancelled,
  expired or refunded before settlement.
- Reward ownership follows the order's ownership rule (customer id, else
  session id); a reward can only be used by its owner.
- Expired rewards are swept by housekeeping.

**EASYDROP**
- Issued only from `onOrderPaid`, once per order, after commit.
- Cards are drawn once at issue (cryptographic weighted draw, without
  replacement) and stored; the reveal is a conditional update
  (`pickedIndex IS NULL`) so a refresh or a second click returns the same card.
- Only the order's owner can read or reveal; a wrong owner gets 404.
- A refund or cancellation closes the drop and releases its unredeemed reward.

**Stacking** (`benefit-policy.ts`)
- LAUNCH_BONUS combines with REWARD and LOYALTY; REWARD with LAUNCH_BONUS and
  LOYALTY; COUPON with nothing. Precedence LAUNCH_BONUS > REWARD > LOYALTY >
  COUPON; one benefit per kind. The cart returns `COUPON_NOT_COMBINABLE`,
  `REWARD_NOT_APPLICABLE` or `COUPON_NOT_APPLICABLE` with the reason.
- A reward's minimum order is enforced against the subtotal on the server.

**Custom coins**
- Only the server prices; the client sends an amount or budget and a
  platform. Amount is snapped to the step; outside min/max → 422.
- The result is a real offer row the cart adds by id; the price on the row
  is what was quoted, never what the client posted.
- Per-coin price never undercuts the largest ladder rung below the amount.

**Referral**
- Code per authenticated customer (`EC` + 6 characters), minted once.
- Attach is rate-limited 30/hour per IP and never rewards anything.
- Qualification runs on the friend's paid order and rejects, with a stored
  reason: `ATTRIBUTION_EXPIRED`, `SELF_REFERRAL`, `REFERRER_INACTIVE`,
  `SAME_EMAIL`, `NOT_FIRST_ORDER` (any prior qualifying order by customer,
  session or contact email), `ORDER_TOO_SMALL`, `REFERRER_MONTHLY_CAP`.
- A rejected attribution never becomes pending again.

**Founders / streak / campaigns**
- Founders' seats are assigned in a transaction with a unique seat number and
  a retry; the cap is checked inside it.
- Streak position is computed from paid orders in order, never from a counter
  the client can move.
- Campaign caps use a conditional increment (`claimed < cap`).

**Trust**
- Metrics are computed from orders and fulfillments with SQL; a metric under
  its threshold is not returned at all.
- A review needs a FULFILLED order owned by the caller; one review per order.

## 4. Reward kinds and how each is used

| Kind | Issued | Used |
|---|---|---|
| NEXT_ORDER_COINS | EasyDrop, referral | chosen in the cart (`rewardId`), added as `rewardCoins` to the paid order's fulfillment |
| NEXT_ORDER_CREDIT | EasyDrop, EasyBack | chosen in the cart, a REWARD discount on the total |
| POINTS_BONUS | EasyDrop, founders, streak | redeemed immediately into EasyPoints |
| POINTS_MULTIPLIER | EasyDrop | applied automatically to the next paid order's points |
| TIER_BOOST | EasyDrop | redeemed immediately; tier index +1 for `tierBoostDays` |
| EXTRA_COINS, OFFER_UNLOCK | – | refused by validation in V1 |

## 5. Admin API

`/api/v1/admin/growth` (bearer admin token): `overview`, `settings`
(GET / PUT `:key` / DELETE `:key` with audit log), `campaigns`
(GET / POST / PATCH `:id`), `trust` (raw and published), `reviews`
(GET queue, POST `:id/publish`).
