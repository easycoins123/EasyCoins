# EASYCOINS: API contract v1

The REST contract between the Angular storefront and the backend that will be
built in the next phase.

**Status: specification.** No backend implements this yet. The Angular app
already consumes it — `src/app/data/http/` contains a complete client written
against this document — but ships bound to the in-memory mock
(`environment.apiMode = 'mock'`). Flipping `apiMode` to `'http'` is the only
frontend change required to go live against a real server.

> Supersedes `docs/API-CONTRACTS.md` from Phase 2, which was unversioned.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | `{origin}/api/v1` |
| Encoding | UTF-8 JSON. `Content-Type: application/json` |
| Casing | `camelCase` for all JSON keys |
| Money | `{ "amountMinor": 5200, "currency": "ILS" }` — integer minor units, never a float |
| Localized text | `{ "he": "...", "en": "..." }`; `he` required, `en` optional |
| Timestamps | ISO-8601 UTC, e.g. `2026-08-29T09:14:22.000Z` |
| Ids | Opaque strings. The client never parses, sorts or constructs them |
| Paging | Request `?page=1&pageSize=12`; response `{ items, page, pageSize, total, hasMore }` |
| Enums | `SCREAMING_SNAKE_CASE`. Adding a member is **not** breaking (see §4) |
| Empty collections | `[]`, never `null` |

### Standard request headers

| Header | Sent on | Purpose |
|---|---|---|
| `X-Request-Id` | every request | Client-generated UUID; echoed into logs and error bodies |
| `X-Session-Trace` | every request | Stable per browsing session, for following one visit end to end |
| `Idempotency-Key` | mutating money/order operations | See §5 |
| `Cookie: tt_session` | authenticated requests | httpOnly session cookie; the client cannot read it |

### Standard response headers

| Header | When | Purpose |
|---|---|---|
| `X-Request-Id` | always | Mirrors the request id |
| `Retry-After` | 429, 503 | Seconds (or HTTP date) before retrying |
| `Cache-Control` | catalog reads | See per-endpoint notes |

---

## 2. Error envelope

Every non-2xx response uses one shape:

```json
{
  "kind": "VALIDATION",
  "code": "REGION_NOT_CONFIRMED",
  "message": "Region confirmation missing for offer offer_123",
  "userMessage": {
    "he": "יש לאשר את אזור החנות כדי להמשיך.",
    "en": "Please confirm the store region to continue."
  },
  "fieldErrors": [
    { "field": "REGION_CONFIRMATION", "message": { "he": "יש לאשר כדי להמשיך." } }
  ],
  "retryable": false,
  "correlationId": "req_01J9..."
}
```

| Field | Notes |
|---|---|
| `kind` | `API`, `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PAYMENT`, `FULFILLMENT`, `SERVER` |
| `code` | Stable machine-readable code. The UI may branch on it; it must not change meaning |
| `message` | English, for logs. **Never rendered to a customer** |
| `userMessage` | The only field shown to a customer. Optional — the client has a safe default per status |
| `fieldErrors[].field` | Matches a `CheckoutFieldKey` or request field name so the UI can mark the control |
| `retryable` | Advisory. The client's own retry policy is in §5 |

**The server must never place a stack trace, SQL fragment, provider response code
or internal hostname in any field.** The client's mapping is implemented in
`src/app/data/http/http-error.mapper.ts` and covered by 24 unit tests.

### Status code map

| Status | Client behaviour |
|---|---|
| 200/201 | Success |
| 204 | Success, no body |
| 400 | Validation error; fields marked |
| 401 | Session expired; offer sign-in. Client never auto-retries |
| 403 | Not permitted; no retry |
| 404 | Not found; renders an empty/not-found state |
| 409 | Conflict; shows the server's `userMessage` and re-fetches |
| 422 | Validation error, semantic (same treatment as 400) |
| 429 | Rate limited; shows wait time from `Retry-After` |
| 500/502/503/504 | Server error; retries once if the call is idempotent |
| Network / timeout | Mapped to `NETWORK`; retries once for reads |

---

## 3. Authentication

Passwordless email OTP. Full lifecycle in `docs/SECURITY-ARCHITECTURE.md` §2.

- Session is an **httpOnly, Secure, SameSite=Lax cookie** (`tt_session`).
- The frontend **never receives, stores or transmits a token**, so there is
  nothing for XSS to steal from `localStorage`.
- All requests are sent with `withCredentials: true`.
- CSRF: `SameSite=Lax` plus an `Origin` check on every mutating request. If
  cross-site embedding is ever needed, add a double-submit CSRF token.

Endpoints are marked:

- **public** — no session required
- **optional** — works anonymously, richer when authenticated
- **required** — 401 without a valid session

---

## 4. Versioning

All endpoints live under `/api/v1`.

**Non-breaking (allowed within v1):** adding an endpoint, adding an optional
request field, adding a response field, adding an enum member.

The client is built to tolerate the last of these: unknown enum values are
mapped to a safe member rather than crashing (`toEnum` in
`src/app/data/http/mappers/index.ts`). An unknown `fulfillmentMethod` becomes
`NOT_SUPPORTED`, an unknown `paymentStatus` becomes `PROCESSING`, an unknown
`inventoryStatus` becomes `OUT_OF_STOCK` — every fallback fails toward *not
selling* and *not claiming success*.

**Breaking (requires v2):** removing or renaming a field, changing a type,
changing the meaning of a code, making an optional request field required.

**v1/v2 coexistence.** Both versions are served by the same deployment from the
same domain services; only the transport layer is duplicated. v1 controllers
map to the same application services as v2 and are frozen. Policy: v2 ships,
v1 is announced deprecated with a sunset date at least 6 months out, and
`Deprecation` / `Sunset` headers are returned on v1 responses in the meantime.
The frontend pins one version via `environment.apiVersion`.

---

## 5. Idempotency

Mandatory for every operation that can create money or an order.

**Client behaviour** (`src/app/data/http/idempotency.ts`): keys are derived from
the resource being acted on, not randomly generated, so a retry of the *same
logical attempt* reuses the key:

| Operation | Key |
|---|---|
| Create payment intent | `payment-intent:{checkoutSessionId}` |
| Confirm payment | `payment-confirm:{paymentIntentId}` |
| Cancel payment | `payment-cancel:{paymentIntentId}` |
| Create order | `order-create:{checkoutSessionId}` |

**Server behaviour:**

1. On receipt, look up `(idempotency_key, endpoint)`.
2. **Miss** — insert a row with status `IN_PROGRESS` inside the same transaction
   as the work, then store the response body and status.
3. **Hit, completed** — return the stored response verbatim, with the original
   status code. Do not re-execute.
4. **Hit, in progress** — return `409 IDEMPOTENT_REQUEST_IN_PROGRESS`; the client
   backs off and re-reads.
5. **Hit with a different request body** — return `422 IDEMPOTENCY_KEY_REUSED`.
   Silently returning the old result for a different request would hide a bug.
6. Keys are retained **24 hours**, then purged.

A retry must never produce two charges, two orders or two fulfillment jobs.

**Client retry policy:** reads (`GET`) retry once on a transient failure. Writes
retry **only if they carry an idempotency key**. A write without one is never
retried automatically.

---

## 6. Rate limiting

Per-IP and per-identity, whichever is stricter. Enforced at the edge and again
in the application, because the edge can be bypassed.

| Endpoint group | Limit | Notes |
|---|---|---|
| `POST /auth/request-code` | 3 / 15 min per email, 10 / hour per IP | Always 204 regardless (§7) |
| `POST /auth/verify-code` | 5 attempts per code, 10 / hour per IP | Code invalidated after 5 failures |
| `POST /checkout/sessions` | 20 / hour per session | |
| `POST /payment/intents` | 10 / hour per customer | |
| `POST /payment/intents/:id/confirm` | 5 per intent | |
| `POST /orders` | 20 / hour per customer | |
| `POST /promotions/validate` | 20 / hour per session | Coupon brute-forcing |
| `POST /support/tickets` | 5 / hour per email | |
| Catalog reads | 600 / min per IP | Generous; these are cacheable |

429 responses carry `Retry-After`. The client renders a Hebrew message
including the wait time.

---

## 7. Endpoints

### 7.1 Catalog

#### `GET /api/v1/games`
- **Auth** public · **Cache** `public, max-age=300`
- **Response 200** `GameDto[]`

```json
[{
  "id": "game-ea-fc", "slug": "ea-sports-fc",
  "name": { "he": "EA SPORTS FC", "en": "EA SPORTS FC" },
  "publisher": "Electronic Arts",
  "shortDescription": { "he": "מטבעות, נקודות FC ושירותי Ultimate Team." },
  "platformIds": ["plat-ps5", "plat-ps4"],
  "accentColor": "#00e5a0", "active": true, "featured": true, "sortOrder": 1
}]
```
- **Errors** none beyond transport. An empty list is valid.
- **Idempotency** n/a · **Rate limit** catalog group

#### `GET /api/v1/games/{slug}`
- **Auth** public · **Response 200** `GameDto`
- **Business errors** `404 GAME_NOT_FOUND` — unknown slug, or the game is inactive.
  Inactive games are 404, not 200-with-a-flag, so an unpublished game cannot leak.

#### `GET /api/v1/platforms` · `GET /api/v1/regions`
- **Auth** public · **Cache** `public, max-age=3600`
- **Response 200** `PlatformDto[]` / `RegionDto[]`
- `RegionDto.restrictionNotice` is **required whenever `isRegionFree` is false.**
  The storefront renders it verbatim before purchase; a region-locked offer with
  no notice is a contract violation.

#### `GET /api/v1/catalog/facets`
- **Auth** public · **Response 200** `CatalogFacetsDto`
- Must reflect only currently purchasable inventory, so the filter bar cannot
  offer a filter that returns nothing.

#### `GET /api/v1/products`
- **Auth** public · **Cache** `public, max-age=60`
- **Query**

| Param | Type | Notes |
|---|---|---|
| `search` | string | Matches name, description, slug, tags |
| `gameIds` | string[] | Repeated param |
| `platformIds`, `regionIds`, `types`, `tags` | string[] | Repeated |
| `minPriceMinor`, `maxPriceMinor` | int | Against the product's cheapest offer |
| `featuredOnly` | bool | |
| `sort` | enum | `relevance｜price-asc｜price-desc｜name-asc｜newest｜popular` |
| `page`, `pageSize` | int | `pageSize` capped server-side at 48 |

- **Response 200** `PageDto<ProductDto>`. Each `ProductDto` carries `fromPrice`
  (cheapest current offer) so a grid renders from one request.
- **Validation errors** `400 INVALID_PAGE` (page < 1), `400 INVALID_SORT`.
  Unknown filter *values* are ignored rather than rejected — a stale bookmark
  should degrade, not error.

#### `GET /api/v1/products/{slug}`
- **Auth** public · **Response 200** `ProductDetailDto` = `{ product, offers }`
- `offers` contains every active offer: one per (variant × platform × region),
  each with its own `price`, `inventory`, `fulfillmentMethod`,
  `checkoutRequirements` and `terms`.
- **Business errors** `404 PRODUCT_NOT_FOUND`

#### `GET /api/v1/offers`
- **Auth** public · **Query** `productSlug` (required) or `offerIds[]`
- **Response 200** `OfferDto[]` · **Errors** `400 MISSING_FILTER`

#### `GET /api/v1/offers/{offerId}` — `OfferDto` · `404 OFFER_NOT_FOUND`

#### `GET /api/v1/products/{slug}/related?limit=4`
- **Response 200** `ProductDto[]`. Never errors; returns `[]` when empty.

---

### 7.2 Cart

The anonymous cart lives in the browser (`localStorage`, offer ids and
quantities only). **The server is authoritative for price and availability.**

#### `POST /api/v1/cart/items`
- **Auth** optional · **Idempotency** not required
- **Request** `{ "offerId": "offer_123", "quantity": 2 }`
- **Response 201** `CartItemDto` — priced by the server. The client never
  constructs a cart line or a price.
- **Validation** `422 INVALID_QUANTITY` (< 1 or > 99)
- **Business errors** `404 OFFER_NOT_FOUND`; `409 OFFER_UNAVAILABLE` (inactive or
  `NOT_SUPPORTED` fulfillment); `409 OUT_OF_STOCK`
- Quantity above `inventory.maxPerOrder` is **clamped**, not rejected, and the
  clamped value returned.

#### `POST /api/v1/cart/validate`
- **Auth** optional · **Request** `{ items: [{ offerId, quantity }], couponCode? }`

Note what is *not* in the request: no prices. Sending them would be meaningless
(the server re-derives) and a tampering vector.

- **Response 200** `CartValidationDto` = `{ cart, issues[], valid }`
- Issue codes: `OFFER_UNAVAILABLE`, `PRICE_CHANGED`, `QUANTITY_REDUCED`,
  `OUT_OF_STOCK`, `COUPON_INVALID`, each with a `userMessage`.
- **A client that skips this call must not be able to obtain a cheaper order** —
  order creation re-validates server-side regardless.

#### `POST /api/v1/cart/price`
- Same request; returns pricing only (`CartTotalsDto`) without availability
  checks. For fast recalculation while the customer adjusts quantities.

---

### 7.3 Checkout

#### `POST /api/v1/checkout/sessions`
- **Auth** optional · **Idempotency** recommended
- **Request** `{ items: [{ offerId, quantity }], couponCode? }`
- **Response 201** `CheckoutSessionDto`

```json
{
  "id": "cs_01J9...",
  "cart": { "...": "server-priced snapshot" },
  "requirements": [ { "key": "EMAIL", "control": "email", "label": {"he":"אימייל"}, "required": true } ],
  "availableProviders": [ { "id": "ISRAEL_CARD", "enabled": true, "simulated": false, "...": "" } ],
  "status": "READY_FOR_PAYMENT",
  "expiresAt": "2026-08-29T10:14:22.000Z"
}
```

- **The session freezes a pricing snapshot.** A catalog price change afterwards
  must not change the amount of an already-created session or its payment.
- **`requirements` is the heart of the contract.** The union of the base contact
  fields and every requirement the cart's offers declare.
- **`requirements[].key` must come from this closed vocabulary:** `EMAIL`,
  `FULL_NAME`, `PHONE`, `REGION_CONFIRMATION`, `PLATFORM_ACCOUNT_HANDLE`,
  `GAME_PLAYER_ID`, `PLATFORM_SELECTION`, `SERVICE_NOTE`, `TERMS_ACCEPTANCE`.
  **Any other key — in particular anything resembling a password, verification
  code or recovery code — is dropped by the client and must be treated as a
  compromised backend.** This is enforced in `toCheckoutRequirement` and covered
  by unit tests.
- **Expiry** 30 minutes. See §7.3 status machine below.
- **Errors** `422 EMPTY_CART`; `409 CART_INVALID` (with issues)

#### `GET /api/v1/checkout/sessions/{id}`
- **Auth** optional; the session id is a bearer capability, so it must be a
  high-entropy unguessable id (≥128 bits), never sequential.
- **Response 200** `CheckoutSessionDto` · **Errors** `404`, `410 SESSION_EXPIRED`

#### `POST /api/v1/checkout/sessions/{id}/validate`
- **Request** `{ "values": { "EMAIL": "a@b.co", "TERMS_ACCEPTANCE": true } }`
- **Response 200** `{ session, issues[], orderId? }`
- **Validation is server-side and authoritative** — required fields, max lengths,
  email format and required checkboxes are re-checked regardless of what the
  client allowed.
- A failed validation is **200 with a non-empty `issues[]`**, not an error: an
  invalid form is an expected outcome, not an exception.
- **Errors** `410 SESSION_EXPIRED`; `409 SESSION_NOT_OPEN`

**Checkout session status machine** (server-owned; clients never set status):

```
OPEN ──▶ VALIDATING ──▶ READY_FOR_PAYMENT ──▶ PAYMENT_PENDING ──▶ COMPLETED
  │            │                │                    │
  └────────────┴────────────────┴────────────────────┴──▶ EXPIRED | CANCELLED
```

---

### 7.4 Payment

Provider-agnostic. **No endpoint accepts card data.** PAN/expiry/CVV are entered
in the provider's hosted field or on the provider's own page. See
`docs/PAYMENT-ARCHITECTURE.md`.

#### `POST /api/v1/payment/intents`
- **Auth** optional · **Idempotency required** — `payment-intent:{checkoutSessionId}`
- **Request** `{ "checkoutSessionId": "cs_...", "provider": "ISRAEL_CARD" }`
- **Response 201** `PaymentSessionDto` = `{ intent, availableProviders[], instruments? }`
- `intent.action` is `{ kind: "REDIRECT", url }`, `{ kind: "CONFIRM", prompt }` or
  `{ kind: "NONE" }`.
- `intent.clientToken` may only ever be a **publishable** provider key. A secret
  key in this field is a security incident.
- `instruments` is populated **only** when the provider is flagged `simulated`.
- **If an unsettled intent already exists for the order, return it** rather than
  creating a second. This is what makes a double-clicked Pay button safe.
- **Errors** `409 ORDER_ALREADY_PAID`; `400 PROVIDER_NOT_ENABLED`;
  `410 SESSION_EXPIRED`; `422 AMOUNT_MISMATCH`

#### `GET /api/v1/payment/intents/{id}`
- **Response 200** `PaymentResultDto`. Used to poll a pending payment.

#### `POST /api/v1/payment/intents/{id}/confirm`
- **Idempotency required** — `payment-confirm:{intentId}`
- **Request** `{ "instrument": { "token": "tok_provider_opaque" } }`
- **Response 200** `PaymentResultDto`
- **Must be idempotent by intent id**: confirming an already-settled intent
  returns the settled result and charges nothing further.
- **`PROCESSING` is a real success response**, not an error — the client shows
  "still processing, do not pay again" and polls.
- **The authoritative settlement is the webhook** (§7.8), not this response.
  This endpoint reports what is known *now*.
- **Errors** `404`; `409 INTENT_NOT_CONFIRMABLE`; `402 PAYMENT_DECLINED`

#### `POST /api/v1/payment/intents/{id}/cancel` — `PaymentResultDto`, idempotent.

---

### 7.5 Orders

#### `POST /api/v1/orders`
- **Auth** optional · **Idempotency required** — `order-create:{checkoutSessionId}`
- **Request** `{ "checkoutSessionId": "cs_..." }`
- **Response 201** `OrderDto`
- **One checkout session yields exactly one order.** A repeat call returns the
  existing order with `200`. This is the duplicate-order guard.
- The order copies the session's **pricing snapshot**. Later catalog price
  changes never alter a historical order.
- **Errors** `422 IDEMPOTENCY_KEY_REQUIRED` (the header is mandatory here);
  `422 MISSING_CONTACT_EMAIL`; `404` for a checkout the caller does not own, in
  place of both "not found" and "forbidden"; `409 SESSION_EXPIRED`;
  `409 SESSION_NOT_OPEN` (details incomplete, or already ordered);
  `409 CART_INVALID` (a line is no longer sellable, or the stored totals
  disagree with the lines); `409 OUT_OF_STOCK` (stock ran out between the quote
  and the order)

**Implemented behaviour**, as of the order-creation phase:

- Stock is held in the same transaction as the order. There is no state where an
  order exists and its inventory was never reserved.
- Reservation is a single conditional `UPDATE`, so N units can never satisfy
  more than N concurrent buyers. The `inventory_reserved_within_available`
  CHECK constraint is the backstop beneath it.
- A failed creation writes nothing: no order, no items, no hold, and the
  idempotency key is released so the customer can retry.
- The order copies its own pricing snapshot. Later catalog changes, including
  withdrawing the offer entirely, never alter a historical order.

#### `GET /api/v1/orders/{id}`
- **Auth** the owning customer, **or** an anonymous holder of the order's signed
  access token from the confirmation email (`?token=...`).
- **An order id alone must never be sufficient.** Ids must be non-sequential and
  high-entropy; otherwise enumeration leaks customer email addresses. This is
  the IDOR case to test explicitly.
- **Errors** `404` (preferred over 403, so existence is not confirmed to a
  stranger)

#### `GET /api/v1/orders/{id}/status`
- Deliberately smaller than the full order: the client polls it every 2.5s until
  the status is terminal. Should be cheap and cacheable for ~1s.
- **Response 200** `OrderStatusDto`

#### `GET /api/v1/account/orders`
- **Auth required** · **Response 200** `PageDto<OrderDto>`, newest first
- **Errors** `401`

---

### 7.6 Fulfillment

#### `GET /api/v1/fulfillment/descriptors`
- **Auth** public · **Cache** `public, max-age=3600`
- **Response 200** `FulfillmentDescriptorDto[]`
- **The ETA fields are a promise.** Omit them rather than guess; the UI renders
  no estimate when they are absent, which is correct behaviour.
- `method: AUTOMATED_API` may only be returned for a method with a live,
  authorised supplier integration behind it.

#### `GET /api/v1/orders/{id}/fulfillments`
- **Auth** same as `GET /orders/{id}`
- **`delivery.payload` must be withheld until the order is paid.** A code
  returned before payment is a code given away.

---

### 7.7 Customer & auth

#### `POST /api/v1/auth/request-code`
- **Auth** public · **Request** `{ "email": "a@b.co" }` · **Response 204**
- **Always 204**, whether or not the address exists, so the endpoint cannot
  enumerate customers.
- **Rate limit** 3 / 15 min per email, 10 / hour per IP.
- **Errors** `422 INVALID_EMAIL` (malformed only); `429`

#### `POST /api/v1/auth/verify-code`
- **Request** `{ "email": "a@b.co", "code": "123456" }`
- **Response 200** `{ "customer": CustomerDto }` **+ `Set-Cookie: tt_session=...;
  HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`**
- No token in the body. The cookie is the session.
- Code: 6 digits, single-use, 10-minute TTL, invalidated after 5 failed attempts,
  stored hashed. On success, all outstanding codes for that email are consumed.
- **Errors** `401 INVALID_CODE`; `410 CODE_EXPIRED`; `429 TOO_MANY_ATTEMPTS`

#### `POST /api/v1/auth/logout`
- **Auth required** · **Response 204** + `Set-Cookie` clearing the session.
- Revokes the session **server-side**; clearing the cookie alone is not enough.

#### `GET /api/v1/me`
- **Auth** optional · **Response 200** `{ "authenticated": false }` or
  `{ "authenticated": true, "customer": CustomerDto }`
- Returns 200 for anonymous callers, not 401 — "who am I" is a valid question
  with the answer "nobody".

#### `PATCH /api/v1/me`
- **Auth required** · **Request** `{ displayName?, phone?, preferredLocale?, preferredRegion? }`
- Email is **not** patchable here; changing it requires re-verification.

---

### 7.7a Accounts and federated sign-in

Added after the passwordless code above; the session model is unchanged. Every
successful sign-in rotates the session cookie and claims the guest session's
orders. See `docs/GOOGLE-OAUTH.md` and `docs/SECURITY-ARCHITECTURE.md`.

#### `GET /api/v1/auth/methods`
- **Auth** public · **Response 200** `{ password, google, emailCode, passwordReset }`
- `google` is true only when the server holds Google credentials; `emailCode`
  and `passwordReset` are true only when a mail transport exists. The
  storefront hides what cannot work.

#### `POST /api/v1/auth/register` — `{ email, password, displayName? }` → **204**
- Always 204. A session cookie is issued **only** when an account was created;
  an address that already has one gets the same 204 and no cookie, so the
  endpoint cannot enumerate customers. Clients follow with `GET /me`.
- **Errors** `422 WEAK_PASSWORD` (field error on `password`); `429`

#### `POST /api/v1/auth/login` — `{ email, password }` → **200** `MeDto` + `Set-Cookie`
- **Errors** `401 INVALID_CREDENTIALS` (one message for unknown address, no
  password and wrong password); `401 ACCOUNT_INACTIVE`; `429`

#### `POST /api/v1/auth/password/forgot` `{ email }` → 204 · `POST /api/v1/auth/password/reset` `{ token, password }` → 200 `MeDto` · `POST /api/v1/auth/password/change` `{ currentPassword, newPassword }` → 204 (auth required)

#### `GET /api/v1/auth/google?returnTo=/path` → **302** to Google
- Sets an httpOnly `tt_oauth_state` cookie holding only the hash of the state.
  `returnTo` must be a same-site path. **503** when Google is not configured.

#### `GET /api/v1/auth/google/callback` → **302** to the storefront
- Success: `Set-Cookie: tt_session` and a redirect to `APP_BASE_URL` + `returnTo`.
- Cancelled at Google (`error=access_denied`): `APP_BASE_URL/account?auth=cancelled`.
- Any other failure (missing or forged state, exchange or token failure,
  unverified email): `APP_BASE_URL/account?auth=failed`. No session either way.

---

### 7.8 Webhooks (provider → backend)

Not called by the browser. Documented because they are the authoritative path.

#### `POST /api/v1/webhooks/payments/{provider}`
- **Auth** provider signature (HMAC), **not** a session
- **Required checks, in order:** verify signature over the raw body → check
  timestamp within 5 minutes → look up `provider_event_id`; if seen, return 200
  and stop → process in a transaction → record the event id.
- **Always return 200** once accepted, even for a duplicate; a non-2xx makes the
  provider retry.
- Full design in `docs/PAYMENT-ARCHITECTURE.md` §5.

---

### 7.9 Promotions, reviews, support

#### `POST /api/v1/promotions/validate`
- **Request** `{ items: [{ offerId, quantity }], code }`
- **Response 200** `CouponApplicationDto` — `{ applied, code, discount, message }`
- **A rejected coupon is a 200 with `applied: false`**, not an error.
- **Discount is computed server-side.** The frontend displays the result.
- **Rate limit** 20/hour per session, to stop code brute-forcing.

#### `GET /api/v1/promotions` — `PromotionDto[]` (active only), public.

#### `GET /api/v1/reviews?productId&page&pageSize` — `PageDto<ReviewDto>`, public.
#### `GET /api/v1/reviews/summary?productId` — `ReviewSummaryDto`, public.
- Only reviews attached to a fulfilled order may carry `verifiedPurchase: true`.
  The UI shows that as a trust signal, so the server must earn it.

#### `GET /api/v1/faq` — `FaqEntryDto[]`, public, cacheable.

#### `POST /api/v1/support/tickets`
- **Auth** optional · **Request** `{ topic, contactEmail, subject, message, orderReference? }`
- **Response 201** `SupportTicketDto`
- **Validation** `subject` ≤ 120, `message` ≤ 1500, enforced server-side.
- Content is untrusted: stored as text, never rendered as HTML.
- **Rate limit** 5/hour per email → `429`, never a silent 200.

---

## 8. What the client already guarantees

Verified by the test suite, so the backend can rely on it:

1. No component calls `HttpClient`; everything goes through `ApiClient`.
2. The client never invents a price — cart lines are built server-side.
3. The client never marks an order paid on its own.
4. The client renders only requirement keys from the closed vocabulary.
5. Order, intent and session ids are treated as opaque.
6. Unknown enum values fail toward *not selling* and *not claiming success*.
7. Every mutating money/order call carries an idempotency key.
8. Every request carries a correlation id and is sent with credentials.
9. No `Authorization` header and no token storage — the session is a cookie.

## 9. Not specified yet

- Customer-initiated cancellation and refund requests
- Review submission (the store only reads reviews today)
- Invoicing / Israeli tax receipt data
- Stock reservation is specified in `docs/FULFILLMENT-ARCHITECTURE.md` but has no
  endpoint, because it happens inside checkout session creation
- Admin/operator endpoints (see `docs/BACKEND-ARCHITECTURE.md` §8)
- Multi-currency: the model supports it; every endpoint currently assumes ILS
