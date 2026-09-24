# EASYCOINS: documentation

## Read in this order

| Document | What it answers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the Angular application is put together and why |
| [COMMERCE-FLOWS.md](COMMERCE-FLOWS.md) | What actually happens, end to end, when someone buys something |
| [API-CONTRACT.md](API-CONTRACT.md) | The versioned REST contract the frontend already consumes |
| [GROWTH-AND-REWARDS.md](GROWTH-AND-REWARDS.md) | EasyDrop, EasyClub, custom coins, referral, drops and trust: what is active, every configured value, every anti-abuse rule |
| [PRICING.md](PRICING.md) | The FC27 price ladder, the owner's controls, the safety rails, the FIRST KICK launch offer, stacking and creator codes |
| [FC27-MARKET-SNAPSHOT.md](FC27-MARKET-SNAPSHOT.md) | The Israeli FC27 coin market as checked on 2026-09-23, with sources, timestamps and what is not verified |
| [BACKEND-ARCHITECTURE.md](BACKEND-ARCHITECTURE.md) | The service to be built: layers, modules, stack, transactions |
| [DATABASE-DESIGN.md](DATABASE-DESIGN.md) | Conceptual schema, constraints and data-integrity invariants |
| [PAYMENT-ARCHITECTURE.md](PAYMENT-ARCHITECTURE.md) | Provider abstraction, intent lifecycle, webhooks, refunds |
| [FULFILLMENT-ARCHITECTURE.md](FULFILLMENT-ARCHITECTURE.md) | How a paid order becomes a delivered product |
| [ORDER-STATE-MACHINE.md](ORDER-STATE-MACHINE.md) | The legal states of an order, its payment and its stock, and how races resolve |
| [SECURITY-ARCHITECTURE.md](SECURITY-ARCHITECTURE.md) | Threat model, auth, authorization, secrets, headers, audit |
| [DEPLOYMENT.md](DEPLOYMENT.md) | What Render needs, and what the service refuses to start without |
| [COMPLIANCE.md](COMPLIANCE.md) | What a lawyer and an accountant must review before real money |
| [UPGRADE-PATH.md](UPGRADE-PATH.md) | Proposed Angular 16 → 20 upgrade, not yet performed |

## Point-in-time records

| Document | Written |
|---|---|
| [ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md) | The state of the codebase before the rebuild |
| [SECURITY-REVIEW.md](SECURITY-REVIEW.md) | What was verified in the browser, each claim backed by a check |

## Status

A real backend now exists. Catalog, cart pricing, checkout, order creation,
inventory reservation and the payment state machine all run against PostgreSQL,
and the storefront has been driven against them in a browser.

What is still specification only: refunds, fulfillment delivery, email, and any
real payment provider. `FULFILLMENT-ARCHITECTURE.md` and the refund sections of
`PAYMENT-ARCHITECTURE.md` describe systems that have tables and no mechanism.

Nothing is deployed. Nothing here is a claim of production readiness or legal
compliance. `CURRENT-STATE.md` in the repository root is the authority on what
exists on any given day.

## Verifying the claims

```bash
# backend, against a real PostgreSQL it starts and disposes of itself
cd backend && npm test

# storefront
npm run test:ci      # unit tests
npm run qa:all       # routes, purchase flows, accessibility, security, performance

# the storefront against the real backend
npx ng build --configuration staging
node backend/scripts/with-db.mjs node qa/http-flow.mjs
```

`qa/README.md` describes each harness.
