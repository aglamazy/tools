# Grow Payment Gateway Integration — SPEC (#309, stage-a: spec only)

**Status:** design only, no code. Agla gates before build.
**Decision context:** fleet-wide provider survey (Librarian + Agla, 2026-08-07,
[artifact](https://claude.ai/code/artifact/f3e2b3de-50d8-4fda-bf21-b703e6f63569)) —
**Grow** (fka Meshulam) wins: only provider of the 8 surveyed that is the actual
acquirer, natively covers all 4 requirements (hosted checkout, recurring, webhook,
native IL invoice), and is the only one with a fully public rate card. Ownership
stays with Aglamazo per the locked 2026-06-28 billing decision: Aglamazo holds all
gateway creds + does the integration; horizontals only PULL a typed `PaymentStatus`
via `agents-billing`. No signed inbound push, no gateway creds outside this repo.

## Why Grow, briefly

| | Grow | Cardcom | PayPlus | Tranzila |
|---|---|---|---|---|
| Native IL invoice | yes, auto | yes, auto | add-on, opt-in | yes (own product) |
| Pricing | **public** (₪59/mo, 0.75%/tx) | not public | not public | not public |
| Recurring | yes, tokenized ("Growin", PCI-L1) | yes (token+standing-order module) | yes | yes |

Stripe is not eligible (Israel isn't a supported merchant country, full stop).
Paddle is technically complete but its Merchant-of-Record invoice model has an
open, unresolved question against רשות המסים compliance — not worth the risk
when Grow clears every box natively. Green Invoice's payments feature is not an
independent option — its own docs say clearing routes through Grow underneath,
so it's "Grow plus a documents layer," not a 5th vendor.

## Flow — same shape as the live YPAY path (docs/13-ypay-credit-clearing.md)

1. Aglamazo backend creates a Grow-hosted payment link for a precise amount
   (`POST /api/light/server/1.0/CreatePaymentLink`, base `sandboxapi.grow.link`
   in sandbox) — mirrors `ypayService.createPaymentLink` today.
2. Customer opens the link, pays on Grow's hosted page (PCI stays out of scope
   — same reasoning as YPAY's `Url` redirect / Cardcom's `LowProfile`).
3. Grow auto-generates the invoice/receipt (חשבונית מס / חשבונית מס קבלה /
   קבלה) natively — no separate doc-generation call needed, unlike YPAY where
   we drive `docType` ourselves. Confirm at build time whether Grow's
   auto-doc covers our existing `getBillingDocType` exempt/authorized split or
   whether we still pick `vatType` (see below) — from the API surface, we do:
   `products[data][].vatType` (1 = regular, 3 = exempt) is a request field, so
   this is the same shape as YPAY's `docType`, just renamed.
4. Grow POSTs a webhook to our `notifyUrl` — same role as `/api/ypay/payment-callback`
   and `/api/upay/payment-callback` today. New route: `/api/grow/payment-callback`,
   same shape: store raw event, reconcile a `growPaymentLinks` record, call the
   **existing shared** `upsertBillingStatus` (`app/lib/billingLedger.ts`) when the
   link carries billing metadata. No new ledger code needed — Grow becomes a
   third caller of the same shared function YPAY and Upay already use.
5. Horizontals keep pulling `GET /api/billing/status` (unchanged) — Grow is
   invisible to them, exactly as intended by the PULL model.

## Grow API specifics (verified against developers.grow.business, 2026-08-07)

- **Auth:** `x-api-key` header, mandatory on every request. Per-business key,
  same custody pattern as `getCredentials(business)` for YPAY today (Vercel
  sensitive env or per-business Firestore field — decide at build time which,
  matching whichever pattern `ypayService.ts` already uses per business).
- **Payment link creation:** `multipart/form-data`, NOT JSON — different from
  YPAY's JSON body. Required fields include `userId`, `pageCode`,
  `paymentLinkType`, `products[data][0][{name,price,vatType}]`,
  `pageFieldSettings[fullName][value]`, `pageFieldSettings[phone][value]`
  (Israeli mobile — required, unlike YPAY where phone is optional in `contact`).
  Optional: `notifyUrl`, `invoiceNotifyUrl` (separate from the payment
  notify — two webhook URLs, not one), `successUrl`, `cField1-9` (custom
  passthrough fields — useful for carrying our own `chargeIdentifier`
  equivalent without relying on Grow's own IDs).
- **Recurring / standing billing:** "הוראת קבע" (`grow.business/auto-pay`),
  full control via app or API (amount, date, pause/stop/close), backed by
  PCI-Level-1 tokenization branded "Growin." Exact token-creation/charge API
  field shape was **not directly read** in this pass (the survey covered the
  payment-link API in detail; the recurring/token API needs its own doc fetch
  at build time — same "verify before coding against it as gospel" discipline
  AH's Cardcom spec (PR#40) correctly insisted on for its own token API).
- **Webhooks:** must be enabled by contacting Grow support — no self-service
  toggle. Ten distinct event types (one-time, recurring 2nd+ charge, failed
  recurring, payment-link-specific, invoice creation, POS, etc.) — we need at
  minimum: one-time success, recurring charge, failed recurring charge.
  **No signature/secret validation mechanism in Grow's own docs** — payload
  carries a `webhookKey` field but there's no documented HMAC/signing scheme.
  Mitigate exactly like the existing Upay callback: validate a **shared secret
  we control** as a query param (`?k=<perBizSecret>`, matching
  `UPAY_WEBHOOK_SECRET` today) rather than trusting `webhookKey` alone — same
  reasoning as the `verified: !!expected && k === expected` check in
  `app/api/upay/payment-callback/route.ts`.
- **Payload fields (one-time):** `webhookKey`, `transactionCode`,
  `transactionType`, `paymentSum`, `fullName`, `payerPhone`, `payerEmail`,
  `cardSuffix`, `cardBrand`, `paymentDate`, `asmachta`. Recurring adds
  `paymentsNum`, `allPaymentNum`, `periodicalPaymentSum`, `directDebitId`.

## VAT / doc-type handling — our own gotcha list applies

The 2026-04-28 "no VAT" incident rule (never omit an explicit VAT flag) and the
`items.vatIncluded` silent-drop gotcha documented in `ypayService.ts` are
YPAY-specific field names, but the underlying discipline transfers directly:
Grow's `products[data][].vatType` (1 = regular / 3 = exempt) is the equivalent
control point — **always set it explicitly per business's VAT status** (same
source as today: the business's `TaxProfileSection`/vatType, already read for
YPAY's `docType` selection), never rely on a Grow default.

## agents-billing `PaymentStatus` extensions needed (hand to Librarian)

Checked `~/develop/Aglamaz/agents-billing/src/types.ts` directly: the PULL
contract's `PaymentStatus` type (customer, kind, amount_ils, currency,
period_start, period_length_days, paid_through, tier) is **already richer**
than what Aglamazo's own `GET /api/billing/status` currently returns — the live
`BillingStatus` type (`app/types/billing.ts`) only has `{tier, kind,
paid_through, updatedAt, service_status?}`. No `amount_ils`, `currency`,
`period_start`, or `period_length_days` are populated today by
`upsertBillingStatus`. This gap exists **independent of Grow** (it's true today
with YPAY/Upay) but adding Grow as a second/third live gateway makes it more
urgent to close, since horizontals will increasingly want the fuller shape.
Recommend to Librarian: either (a) extend `upsertBillingStatus` to populate the
full `PaymentStatus` shape now (small change, the data — amount, currency,
period — is already on every gateway's webhook payload), or (b) confirm no
current consumer actually reads the missing fields yet and defer. No gateway
field is needed in `PaymentStatus` itself — which processor was used is an
Aglamazo-internal concern, correctly invisible to the PULL contract.

## AH's Cardcom spec (PR#40, agents-head.com) — disposition

Per this task's explicit instruction: **fold in as researched input, don't let
a second AH-owned gateway client happen.** The PR (2026-08-05, before the
2026-08-07 survey) locked Cardcom and specced `src/lib/cardcom.ts` living
**inside agents-head.com** with its own creds — that is exactly the
creds-scatter pattern the 2026-06-28 decision closed, and it now also names
the wrong gateway (Grow won the actual comparative survey two days later,
which the Cardcom PR never had). It should not be built as written.

What IS worth carrying over from it:
- **The verification discipline** — quoting exact wire field names from a real
  reference implementation instead of guessing, and explicitly flagging one
  load-bearing unverified fact (Cardcom token lifetime) rather than assuming
  it. Applied the same discipline above to Grow (recurring-token API depth,
  webhook signature gap) rather than re-guess a shape that needs a build-time
  doc fetch.
- **The open-risk pattern generalizes**: Cardcom's spec correctly refused to
  assume token lifetime without confirming with Cardcom directly. Grow's
  recurring/token API needs the same treatment at build time — confirm actual
  token lifetime + any 2FA/re-auth requirement with Grow support before
  designing a "register once, bill forever" flow around it.
- **Dunning/failure-handling is undesigned in both** — AH's spec correctly
  scoped it out as its own product decision, not guessed at. Same applies
  here: a failed recurring Grow charge needs a retry/grace/notify policy,
  not specced in this pass.

Action: this task's completion should message AH/Buddy that Cardcom is
superseded and their PR shouldn't be merged/built as a live integration —
Grow is the fleet gateway, Aglamazo owns it.

## Per-business multi-tenant creds

Same shape as YPAY today: `getCredentials(business)`-equivalent lookup, one
Grow `x-api-key` per business (or per Aglamazo-tenant, if Grow's `userId`
field maps to a business rather than a top-level merchant account — needs
confirming against Grow's own multi-merchant docs at build time, since the
survey didn't cover sub-merchant/multi-tenant account structure).

## New surface (stage-b, after Agla's gate — not built now)

1. `growService.createPaymentLink()` (client) + `/api/grow` route (server),
   mirroring `ypayService.ts` / `app/api/ypay/route.ts` structure.
2. `/api/grow/payment-callback` — public webhook, shared-secret validated
   (mirrors `/api/upay/payment-callback`), calls the existing
   `upsertBillingStatus`.
3. `growPaymentLinks` Dexie table — same shape as `ypayPaymentLinks`
   (chargeIdentifier-equivalent key, businessId, amount, items, contact,
   status, paymentUrl, receiptUrl, serialNumber, createdAt, paidAt). **Must
   be added to `SYNCED_DB_TABLES`.**
4. Recurring-token flow (setup + monthly charge) — genuinely new, no existing
   Aglamazo analog (YPAY integration today is single-charge links only, no
   recurring token yet) — needs its own build-time API-shape verification per
   the open-risk note above before estimating.
5. `/app/pay/success` + `/app/pay/failure` pages — likely reusable as-is from
   the existing YPAY ones, just gateway-agnostic already if built that way.

## Open questions for Agla's gate review

1. Survey verdict (Grow) — confirmed, or does the Paddle tax-compliance
   question change anything? (Recommend: no — Grow is strictly simpler and
   fully native, no reason to take on Paddle's open compliance risk.)
2. Recurring-token build-time verification (Grow token lifetime, 2FA/re-auth)
   — who owns confirming this with Grow support before stage-b starts?
3. `PaymentStatus` field-completeness gap (amount_ils/currency/period_start
   missing from what we actually populate today) — close now as part of this
   work, or separate follow-up?
4. AH's Cardcom PR#40 — should I message AH directly that it's superseded, or
   does Buddy handle that notification?

## Estimate (stage-b, once gated)

Payment-link path (mirrors YPAY, ~half-day per that doc's own estimate):
route + service fn (1-2h), webhook + table + store (2h), success/failure pages
(reuse, ~0), sandbox verify (1h). **Recurring/token path is a separate,
larger estimate** — genuinely new surface for this codebase, blocked on the
build-time API verification above; don't estimate blind.
