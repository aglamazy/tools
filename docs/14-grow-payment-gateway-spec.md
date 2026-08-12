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

## Grow API specifics (verified against developers.grow.business, 2026-08-07; auth model + sandbox re-verified 2026-08-11)

- **Auth — two distinct models, we need the multi-tenant one:** Grow's docs
  describe "Direct Business Payments" (a single business, `userId` +
  `pageCode` only) vs "Multiple Business Payments" (a platform acting for
  several businesses, adds a platform-level `apiKey` on top of each
  business's own `userId` + `pageCode`). Aglamazo is the latter — ONE
  Aglamazo-level `apiKey`, then per-business `userId`/`pageCode`, same
  custody pattern as `getCredentials(business)` for YPAY today (Vercel
  sensitive env for the platform key, per-business Firestore field for
  `userId`/`pageCode` — decide at build time which store, matching whichever
  pattern `ypayService.ts` already uses per business). Docs don't specify the
  exact header/param placement for these three values — confirm against a
  real sandbox call before writing the client, don't guess the wire format.
- **Sandbox environment exists and is genuinely separate from production**
  (`sandbox.meshulam.co.il/api/light/server/1.0/...` — note the legacy
  Meshulam domain, not `grow.business`; production presumably swaps this
  host, confirm at build time). Each environment has its own `userId`,
  `pageCode`, and `apiKey` — sandbox creds are NOT the same values as
  production. Real test card numbers documented: `4580458045804580` (single-
  payment + failed-transaction scenarios), `4580000000000000`,
  `4580111111111121`; mock bank transfer details (bank `41`, branch `410`,
  account `411111111`). Bit/Google Pay/Apple Pay have NO sandbox — those
  process live even in testing. PayBox is production-only. How sandbox
  credentials themselves are obtained isn't documented — likely comes with
  account signup (confirm when creating the account per bob#12) or needs
  asking Grow directly; don't assume production creds also work against the
  sandbox host.
- **Payment link creation:** `multipart/form-data`, NOT JSON — different from
  YPAY's JSON body. Required fields include `userId`, `pageCode`,
  `paymentLinkType`, `products[data][0][{name,price,vatType}]`,
  `pageFieldSettings[fullName][value]`, `pageFieldSettings[phone][value]`
  (Israeli mobile — required, unlike YPAY where phone is optional in `contact`).
  Optional: `notifyUrl`, `invoiceNotifyUrl` (separate from the payment
  notify — two webhook URLs, not one), `successUrl`, `cField1-9` (custom
  passthrough fields — useful for carrying our own `chargeIdentifier`
  equivalent without relying on Grow's own IDs).
- **Recurring / standing billing — TWO distinct mechanisms, verified against
  developers.grow.business directly (2026-08-10, Librarian):**
  - **"Billing"** — Grow manages the full schedule (amount, charge day, count),
    editing/canceling via "Edit Direct Debit," webhooks fire per charge/failure.
  - **"Tokens"** — you save a card as a token, then trigger each charge
    yourself on your own schedule. Grow's own guidance, quoted directly: *use
    Tokens if you already have a system in place for billing management,
    including monthly charges and refunds; use Billing if you lack one.*
  - **DECISION: Tokens.** Aglamazo already owns the ledger/period/schedule
    logic (`upsertBillingStatus`, the whole YPAY-era system) — Billing would
    duplicate that inside Grow for no benefit, and would fight our own
    `paid_through`/period model instead of feeding it.
  - **Verified field shape — `createTransactionWithToken` (the actual
    charge-with-token endpoint), server-to-server only, client/browser calls
    explicitly blocked by Grow — re-verified 2026-08-11 directly against the
    raw embedded OpenAPI spec on the reference page (not just the rendered
    text) after finding two required fields missing from the earlier pass:**
    required — `cardToken`, `userId`, `sum` (double), `description`,
    `paymentType` (`1` = direct debit for this endpoint), `paymentNum` (2-12,
    installment count — NOT months of recurrence), `pageField[fullName]`,
    `pageField[phone]` (IL mobile format), **`transactionUniqueIdentifier`**
    (integer — **this is the idempotency key**: Grow checks whether this
    business has ever sent this value before and rejects the request
    outright if so, "regardless of the status of the first request with this
    ID" — MUST generate and persist one per attempted charge before calling,
    and reuse the SAME value on a retry of the same logical charge, or a
    network-blip retry becomes a genuine double-charge), **`isRecurringDebitPayment`**
    (integer, `1` = "creating a premium direct debit" — required on every
    call to this endpoint, which means the endpoint itself sits behind
    Grow's "premium" tier; reinforces, doesn't just repeat, the "tokens need
    explicit permission from Grow" finding below — the permission gate is on
    THIS specific field/endpoint, not a vague blanket "tokens" toggle).
    Optional — `pageField[email]`, `cField1`-`cField9` (custom passthrough,
    good fit for our own charge-identifier equivalent), `transactionGroupIdentifier`
    (rejects if a PRIOR successful payment already used this value — a
    duplicate-prevention field, distinct from `transactionUniqueIdentifier`'s
    per-attempt idempotency).
  - **How the token is actually obtained:** NOT a separate tokenize-only call
    by default — the token arrives as `transactionToken` on the webhook
    callback from the FIRST regular (non-token) payment-link charge (a
    "token-only, no immediate charge" option also exists per Grow's docs, not
    yet detailed here). **Field-name correction to this doc's earlier draft:**
    the value is `transactionToken` on that first callback, but becomes
    `cardToken` when sent BACK on the later `createTransactionWithToken`
    charge request — same value, two different field names at two different
    steps. Easy to get wrong; keep this note next to whichever code reads it.
  - **`ApproveTransaction` (the webhook-ack call) is explicitly NOT required
    for token transactions or save-token-only scenarios** per Grow's own
    docs — only for the regular non-token payment-link flow. One less moving
    part for the recurring/token path specifically.
  - **Operational:** working with tokens requires explicit permission from
    Grow — not self-service, same enablement pattern as webhooks below. One
    combined ask to Grow support, tracked via bob#12.
  - **STILL OPEN, genuinely unverifiable from the docs — same "don't assume,
    ask" discipline as Cardcom's token-lifetime question in AH's spec:** no
    documented token lifetime/expiry policy, and no mention of a periodic
    2FA/re-auth requirement anywhere in Grow's reference docs. Searched
    explicitly, found nothing either way. **Must ask Grow support directly**
    before designing a register-once-bill-forever flow around it — do not
    assume indefinite validity. Owner: whoever makes the next Grow support
    contact (bob#12).
- **Webhooks — genuine discrepancy between docs and the live dashboard, found
  2026-08-11 (Agla was in the account):** the published docs page
  (developers.grow.business/docs/webhooks) states "Contact our support team
  to enable Webhooks for your account" with no self-service option
  mentioned. But the live dashboard's "ניהול ווהוקים" (Webhook Management)
  screen shows a working "יצירת ווהוק חדש" (Create New Webhook) button with
  no support-contact caveat in its own copy. **Not resolved either way yet**
  — possible the docs are stale, or the button creates a webhook ENTRY that
  Grow's backend won't actually fire events to until support flips a
  server-side switch (a "looks self-service, isn't functionally" trap).
  Don't create one from the dashboard yet regardless — Aglamazo has no live
  endpoint to receive it (stage-b, not built). Verify by creating one once
  the endpoint exists and confirming an event actually arrives, rather than
  trusting either source blind. Ten distinct event types (one-time, recurring
  2nd+ charge, failed recurring, payment-link-specific, invoice creation,
  POS, etc.) — we need at minimum: one-time success, recurring charge, failed
  recurring charge.
  **No signature/secret validation mechanism in Grow's own docs** — payload
  carries a `webhookKey` field but there's no documented HMAC/signing scheme.
  Mitigate exactly like the existing Upay callback: validate a **shared secret
  we control** as a query param (`?k=<perBizSecret>`, matching
  `UPAY_WEBHOOK_SECRET` today) rather than trusting `webhookKey` alone — same
  reasoning as the `verified: !!expected && k === expected` check in
  `app/api/upay/payment-callback/route.ts`.
- **Payload fields (one-time, VERIFIED 2026-08-10 against
  `recurring-payment-callback` — corrects this doc's earlier guessed field
  names):** `err`, `status`, and a `data` object carrying `status` (Hebrew
  text), `statusCode`, `transactionTypeId`, `paymentType`, `sum`,
  `paymentsNum`, `allPaymentsNum`, `paymentDate`, `description`, `fullName`,
  `payerPhone`, `payerEmail`, `transactionId` (not `transactionCode` as
  earlier guessed), `transactionToken` (the saved card token — see above),
  `directDebitId`, `recurringDebitId` (two separate recurring identifiers,
  not previously documented), `asmachta`, `cardSuffix`, `cardType`,
  `cardTypeCode`, `cardBrand`, `cardBrandCode`, `cardExp`, `firstPaymentSum`,
  `periodicalPaymentSum`, `payerBankAccountDetails`, `processId`,
  `processToken`, and `customFields` (our own `cField1`-`cField9` echoed
  back). `sum` replaces the earlier-guessed `paymentSum`. A test tool exists:
  `GET sandboxapi.grow.link/api/light/server/1.0/updateMyUrl/?url=<ourUrl>`
  simulates the callback against our own endpoint for integration testing.

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
   recurring token yet). Field shape now VERIFIED (see "Recurring / standing
   billing" above) — `createTransactionWithToken` request/response and the
   token-capture path are specced. Only remaining unknown is the token
   lifetime/2FA question, which doesn't block writing the code, only
   validating the "bill forever" assumption before relying on it in prod.
5. `/app/pay/success` + `/app/pay/failure` pages — likely reusable as-is from
   the existing YPAY ones, just gateway-agnostic already if built that way.

## Open questions for Agla's gate review

1. Survey verdict (Grow) — confirmed, or does the Paddle tax-compliance
   question change anything? (Recommend: no — Grow is strictly simpler and
   fully native, no reason to take on Paddle's open compliance risk.)
2. Recurring-token build-time verification — NARROWED (2026-08-10, Librarian):
   the API field shape itself is now verified directly against Grow's docs
   (see above), so this is no longer a blanket unknown. What's still genuinely
   open is narrower: token lifetime/expiry and any 2FA/re-auth requirement —
   nothing in Grow's docs states either way. Routed to Bob (bob#12) as one
   combined ask alongside enabling tokens + webhooks for the account.
3. `PaymentStatus` field-completeness gap (amount_ils/currency/period_start
   missing from what we actually populate today) — close now as part of this
   work, or separate follow-up?
4. AH's Cardcom PR#40 — should I message AH directly that it's superseded, or
   does Buddy handle that notification?

## Estimate (stage-b, once gated)

Payment-link path (mirrors YPAY, ~half-day per that doc's own estimate):
route + service fn (1-2h), webhook + table + store (2h), success/failure pages
(reuse, ~0), sandbox verify (1h).

**Recurring/token path** (2026-08-10 update: field shape now verified, no
longer blocked on an unknown API surface): `createTransactionWithToken`
client call + capturing `transactionToken` off the first-charge webhook +
storing it per business (2-3h), monthly-charge cron/trigger against
Aglamazo's own period logic (2-3h), error handling for a dead/expired token
per Grow's own guidance (cease charging, delete, prompt for a new card) (1h).
Still gated on the token-lifetime/2FA answer from Grow support (bob#12)
before relying on "register once, bill forever" in prod — code can be
written and sandbox-tested before that answer lands, just don't ship live
recurring billing on an unconfirmed lifetime assumption.
