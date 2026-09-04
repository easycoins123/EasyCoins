# EASYCOINS: commerce flows

End-to-end flows across frontend, backend, providers and database. Read this
alongside `docs/API-CONTRACT.md` for payloads and
`docs/DATABASE-DESIGN.md` for the tables named here.

Legend: **FE** frontend · **BE** backend · **DB** database · **PP** payment
provider · **FP** fulfillment provider

---

## 1. Canonical purchase

```
FE  browse → product page → select variant × platform × region
             │  the three selections resolve to exactly ONE offer id
             ▼
FE  POST /cart/items { offerId, quantity }
BE    price the line from the offer                          ← server prices
BE    check offer active, purchasable, quantity ≤ maxPerOrder
DB    read offers, inventory
FE  ← CartItemDto (priced)                     stored locally: ids + quantities
             ▼
FE  cart page → "checkout"
FE  POST /cart/validate { items: [{offerId, quantity}] }      ← no prices sent
BE    re-derive every price from the catalog
BE    check availability; emit issues for changes
FE  ← { cart, issues, valid }   issues surfaced to the customer
             ▼
FE  POST /checkout/sessions { items, couponCode? }
BE    re-price; compute discounts server-side
BE    RESERVE INVENTORY  (§4)
BE    resolve checkout requirements from the offers in the cart
DB    INSERT checkout_sessions (pricing_snapshot FROZEN) + checkout_items
                              + inventory_reservations
FE  ← CheckoutSessionDto { requirements[], expiresAt, status: READY_FOR_PAYMENT }
             ▼
FE  render exactly the requirements returned — no invented fields
FE  POST /checkout/sessions/{id}/validate { values }
BE    validate server-side, authoritatively
FE  ← 200 { issues: [] }   (or 200 with issues, which is not an error)
             ▼
FE  POST /orders { checkoutSessionId }        Idempotency-Key: order-create:{id}
BE    re-validate the cart one final time
DB    INSERT orders (pricing_snapshot COPIED) + order_items
DB    reservations → COMMITTED
FE  ← OrderDto { status: PENDING }
             ▼
FE  POST /payment/intents { checkoutSessionId, provider }
                                          Idempotency-Key: payment-intent:{id}
BE    amount from the FROZEN snapshot, never the request
PP    create intent
DB    INSERT payment_intents (partial unique index: one live intent per order)
FE  ← { intent: { status: REQUIRES_ACTION, action } }
             ▼
FE  render action  (REDIRECT → provider page | CONFIRM → prompt)
FE  POST /payment/intents/{id}/confirm { instrument: { token } }
                                        Idempotency-Key: payment-confirm:{id}
PP    processes
FE  ← PaymentResultDto  (SUCCEEDED | PROCESSING | FAILED | CANCELLED)
             ▼
PP  ──── webhook ────► BE   ← THE AUTHORITATIVE SETTLEMENT
BE    verify signature over the raw body, check timestamp, dedup event id
DB    BEGIN
        INSERT webhook_events, payment_events
        SELECT order FOR UPDATE
        payment_intents → SUCCEEDED
        orders → PAID
        inventory: reserved → sold
        INSERT fulfillments (PENDING), enqueue jobs
        INSERT audit_logs
      COMMIT
             ▼
FP  worker fulfils each item                                  (§5)
DB    fulfillments → DELIVERED, orders → DELIVERED when all items are done
BE  notify: order confirmed, then fulfillment completed
             ▼
FE  order page polls GET /orders/{id}/status every 2.5s until terminal
FE  reveals the delivery payload once the order is PAID
```

**Where the money is decided:** the checkout session's frozen snapshot. Not the
cart, not the request body, not a live catalog read at payment time. A price
change between session creation and payment does not move the amount.

---

## 2. Region safety through the flow

Region is not a label; it is part of the offer's identity.

```
Offer = (variant × platform × region)
   │  a US gift card and an IL gift card are DIFFERENT offers
   │  with different ids, prices and inventory pools
   ▼
Product page   region chips; selecting one changes the resolved offer id
               region badge + restriction notice shown before purchase
   ▼
Cart line      carries region_id; badge repeated on every line
   ▼
Checkout       REGION_CONFIRMATION requirement is added by the backend for any
               region-locked offer, and validated server-side
   ▼
Order item     region_id copied, never re-derived
   ▼
Fulfillment    codes are stocked per offer, so the region pool is physically
               separate — an IL order cannot draw a US code
```

**A US PlayStation Store product can never silently become an IL one**, because
they are not the same row at any layer. The frontend enforcement (badges,
confirmation checkbox) is a usability layer over a structural guarantee.

Backend responsibilities: reject a checkout whose `REGION_CONFIRMATION` is
missing for a region-locked offer; never substitute an offer from another region
when one is out of stock; keep `restriction_notice` mandatory for locked regions
(there is a `CHECK` constraint for this).

---

## 3. Dynamic checkout requirements

```
Cart contains offers
      │
      ▼
BE  requirements = BASE ∪ (⋃ offer.checkoutRequirements)
      │  BASE = FULL_NAME, EMAIL, PHONE(optional), TERMS_ACCEPTANCE
      ▼
   deduplicate by key, required wins over optional
      ▼
FE  render exactly this list
```

| Cart contains | Additional requirements |
|---|---|
| Gift card (region-locked) | `REGION_CONFIRMATION` |
| PS Plus (region-locked) | `REGION_CONFIRMATION` |
| EA FC coins (manual delivery) | `PLATFORM_ACCOUNT_HANDLE`, `SERVICE_NOTE` |
| SBC service (in-game) | `GAME_PLAYER_ID`, `SERVICE_NOTE` |
| V-Bucks (region-free code) | none beyond base |
| Mixed cart | The union, deduplicated |

**Never, for any product:** password, 2FA code, recovery code, security answer.
The vocabulary has no member that could express one, and the frontend mapper
drops any key outside it.

Both sides validate: the frontend for immediate feedback, the backend
authoritatively. A client that skips validation gets a 200 with issues, not an
order.

---

## 4. Inventory reservation

Prevents overselling a finite pool of codes.

```
Available ──reserve──► Reserved ──commit──► Sold
                          │
                          └──release / expire──► Available
```

```
POST /checkout/sessions
   │
   ▼
BEGIN
  for each line:
    SELECT … FROM inventory WHERE offer_id = $1 FOR UPDATE
    IF quantity_available - quantity_reserved < qty  → 409 OUT_OF_STOCK
    INSERT inventory_reservations (HELD, expires_at = now + 30 min)
    UPDATE inventory SET quantity_reserved = quantity_reserved + qty
COMMIT
```

| Event | Effect |
|---|---|
| Order created | Reservation → `COMMITTED`, linked to the order |
| Payment succeeded | `quantity_reserved -= n`, `quantity_sold += n`; units → `SOLD` |
| Payment failed / cancelled | Reservation → `RELEASED`, `quantity_reserved -= n` |
| Session expires (30 min) | Sweep job: reservation → `EXPIRED`, stock returned |
| Order refunded | Units stay `SOLD` — a revealed code cannot return to stock |

The sweep runs every minute over `reservations_expiry_idx`. Unlimited-stock
offers (manual services) have `quantity_available IS NULL` and skip reservation
entirely.

---

## 5. Fulfillment dispatch

```
order → PAID
   │
   ├─ digital code line ──► DigitalCodeFulfillment
   │     claim units FOR UPDATE SKIP LOCKED → DELIVERED (0–5 min)
   │
   ├─ manual line ────────► ManualFulfillment
   │     operator queue → contact → deliver → DELIVERED (5–30 min)
   │
   ├─ in-game line ───────► AccountBasedFulfillment
   │     schedule with the customer → perform → DELIVERED (30–240 min)
   │
   └─ flagged REVIEW ─────► ManualReviewFulfillment
         approve → delegate | reject → cancel + refund
```

Order `fulfillment_status` = the **least advanced** item status, so a partially
delivered order never reports as delivered. Detail in
`docs/FULFILLMENT-ARCHITECTURE.md`.

---

## 6. Failure paths

### Payment declined

```
confirm → FAILED
   │  order → PAYMENT_FAILED
   │  reservations RELEASED, stock returned
   ▼
FE shows a safe reason and offers a retry
   retry creates a NEW intent against the same order
   the checkout session must still be valid; if expired, the customer restarts
```

### Payment pending (timeout)

```
confirm → PROCESSING
   │  order stays PAYMENT_PROCESSING; reservations stay HELD
   ▼
FE  "still processing — do not pay again"; Pay is disabled
FE  polls GET /payment/intents/{id}
BE  webhook settles it either way; a sweep expires it after 60 minutes
```

### Fulfillment failed

```
provider → FAILED (after retries)
   │  fulfillment → FAILED, order → FULFILLMENT_FAILED
   ▼
notify the customer honestly; open an operator task; refund path available
```

**The customer is never left without an explanation, and never sees a stack
trace.**

### Checkout session expired

```
30 minutes with no order
   │  session → EXPIRED, reservations released
   ▼
FE  410 SESSION_EXPIRED → return to the cart, which is still intact locally
```

---

## 7. Authentication

```
FE  /account → enter email
FE  POST /auth/request-code            rate limited; ALWAYS 204
BE  generate 6-digit code, store Argon2id hash, TTL 10 min, single use
BE  email the plaintext (its only appearance)
FE  enter code → POST /auth/verify-code
BE  constant-time compare; ≤5 attempts; consume all outstanding codes on success
BE  create session → Set-Cookie: tt_session (HttpOnly, Secure, SameSite=Lax)
FE  GET /me → { authenticated: true, customer }
FE  order history now available at /account/orders
```

No password exists at any point. The frontend never holds a token.

---

## 8. Coupons

```
FE  enter code → POST /promotions/validate { items, code }
BE  look up coupon → active? not expired? min subtotal met?
BE  redemption limits: global and per customer
BE  targeting: game / product / region
BE  compute the discount SERVER-SIDE
FE  ← { applied, discount, message }      rejection is a 200, not an error
      ▼
   checkout session recomputes the discount and freezes it in the snapshot
      ▼
   order creation records coupon_redemptions (unique per coupon+order)
```

The frontend displays a discount; it never calculates one.

---

## 9. Anonymous → authenticated

```
Anonymous cart (localStorage: offer ids + quantities)
      │
      │  customer signs in mid-session
      ▼
FE  POST /cart/validate with the local items
BE  associate the cart with the customer
      │
      ▼
Checkout session carries customer_id; the order is linked to the account
and appears in /account/orders
```

The local cart is never authoritative — it is a list of intentions that the
server re-prices on every read.

---

## 10. Order status polling

```
FE  order page mounts
      │
      ▼
   timer(0, 2500) → GET /orders/{id}/status
      │
      ├─ non-terminal → keep polling
      └─ terminal (DELIVERED | FAILED | CANCELLED | REFUNDED) → stop
```

Polling rather than websockets: an order settles in minutes, the endpoint is
cheap and cacheable, and a socket layer is infrastructure this business does not
need yet. Revisit if fulfillment times grow.

---

## 11. What the frontend guarantees

Verified by 157 unit tests and 124 browser checks:

1. Never invents a price — cart lines are built server-side.
2. Never decides a payment succeeded.
3. Never renders a requirement key outside the closed vocabulary.
4. Never stores contact, order or payment data in the browser.
5. Always carries an idempotency key on money/order mutations.
6. Always displays region and delivery method before purchase.
7. Always has a loading, empty and error state for every async surface.
8. Fails toward *not selling* and *not claiming success* on unknown values.

## 8. Promotion stacking

One benefit per order, decided by the server. A coin bundle carries its launch bonus in the variant (`metadata.launchBonus`, spelled out in the variant name so every order line records the promise). `PricingService` refuses any coupon code on a cart that holds a bonus line and answers `COUPON_NOT_COMBINABLE`; the storefront only repeats that answer. The `LAUNCH10` promotion and coupon rows are inactive for the bonus period (`prisma/seed.ts`), so the code is refused as inactive even before the rule runs. Future first-purchase and referral rewards are server-issued single-use codes, valid only on orders without bonus lines. The mock data layer mirrors the rule and keeps a development-only `QA10` code on products without a bonus so the coupon path stays testable.
