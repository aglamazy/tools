# YPAY Credit Clearing — design spike (#73)

**Status:** design only, no code. Awaiting Agla approval to implement.
**Chosen flow (Agla, 2026-06-22):** *shareable payment link* — generate a YPAY-hosted
payment page for a precise amount, send the customer a link, reconcile on payment via webhook.

## Why

YPAY's own credit-clearing UI builds the wrong payment (no control over amount/items). The
**Credit Clearing API** (`POST /api/v1/payment`, YPAY API doc v1.9 p.8–10) returns a hosted
payment-page **URL** for an amount **we** specify via `items[]`. Card capture stays on YPAY's
PCI page → no card-data scope for us. On success YPAY auto-issues the receipt and POSTs us a
confirmation.

## Flow (shareable link)

1. In a business's billing UI, user enters amount/items + customer contact, clicks "צור קישור תשלום".
2. Client `ypayService.createPaymentLink(business, {items, contact})` → `POST /api/ypay`
   `action:'createPayment'`.
3. Server (`/api/ypay/route.ts`): `getAccessToken(getCredentials(business))` → `POST {BASE_URL}/payment`
   with the body below → YPAY returns `{ url, responseCode }`.
4. Persist a `ypayPaymentLinks` record (status `pending`, the returned `url`, our `chargeIdentifier`).
5. UI surfaces the `url` to copy / WhatsApp / email to the customer.
6. Customer opens the link, pays on YPAY's page. YPAY then: (a) generates the receipt doc
   (108/109) and emails it (`mail:true`), (b) redirects to our `successUrl`/`failureUrl`,
   (c) POSTs the transaction result to our `notifyUrl`.
7. `/api/ypay/payment-callback` (webhook) validates + flips the record to `paid`, stores the
   receipt `serial_number`/`url` and `paidAt`.

## Request body (POST /api/v1/payment)

```
{
  chargeIdentifier: "agl-<businessId>-<uuid>",   // M — our unique txn id, = record key
  docType: 108 | 109,                            // exempt→108 קבלה, authorized→109 חשבונית מס/קבלה
  mail: true,                                    // YPAY emails the receipt to contact
  payments: 1,                                   // installments (max 12); default single payment
  lang: "he", currency: "ILS",
  contact: { email, name, businessID, phone, mobile, address, ... },   // M
  items: [ { price, quantity, vatIncluded: false, name, description } ], // M — sets the exact amount
  notifyUrl:  "<APP_URL>/api/ypay/payment-callback?cid=<chargeIdentifier>&k=<perBizSecret>",
  successUrl: "<APP_URL>/app/pay/success?cid=<chargeIdentifier>",
  failureUrl: "<APP_URL>/app/pay/failure?cid=<chargeIdentifier>"
}
```
Response: `{ url, responseCode }` — `url` is the payment page (iFrame-able or shareable).

## Reuse (already in the codebase)

- **Auth + dispatch:** `getAccessToken()` + `action` switch in `app/api/ypay/route.ts`
  (`BASE_URL = https://ypay.co.il/api/v1`). Add one `action:'createPayment'` branch → `POST /payment`.
- **Per-business creds:** `getCredentials(business)`.
- **Item/Contact + VAT convention:** `vatIncluded:false` (net prices, B2B) — same as
  `createDocument`/`createItemBasedInvoice` in `ypayService.ts`. The 2026-04-28 "no VAT" incident
  rule applies: never omit `vatIncluded`.
- **docType selection:** mirror `getBillingDocType` — exempt→108, authorized→109 (the 0=none
  and 106=tax-invoice-only values are not used for a paid link).

## New surface (to build after approval)

1. `ypayService.createPaymentLink()` (client) + `action:'createPayment'` (server route).
2. **`/api/ypay/payment-callback`** — public webhook (YPAY calls it). Validate `cid` exists +
   per-business secret `k`; idempotent (ignore duplicate notifies); flips record `paid`/`failed`,
   stores receipt url/serial. Needs an eslint route-guard exception comment (public-by-design,
   validated by shared secret).
3. **`ypayPaymentLinks`** Dexie table — `{ chargeIdentifier (key), businessId, amount, items,
   contact, status: 'pending'|'paid'|'failed', paymentUrl, receiptUrl, serialNumber, createdAt,
   paidAt }`. **Must be added to `SYNCED_DB_TABLES`** (eslint `no-inline-table-lists`).
4. Lightweight `/app/pay/success` + `/app/pay/failure` pages (branded thank-you / retry).
5. UI: a "צור קישור תשלום" action in the business billing area + a list/badge of links with
   live `pending/paid` status (the webhook updates it; sync propagates).

## Decisions taken (small details — no need to confirm)

- `chargeIdentifier = agl-<businessId>-<uuid>`, generated client-side, = the record key (idempotent reconcile).
- `payments` defaults to 1; expose an installments picker later.
- `successUrl/failureUrl` are our own branded pages (not YPAY defaults), carrying `cid`.
- Validate the webhook by `cid` existence + a per-business shared secret; reconcile is idempotent.
- **Sandbox first:** YPAY ships sandbox `client_id`/`client_secret` + a Postman collection (doc p.3).
  Build + verify against sandbox before pointing at the live business creds.

## Open product question (next, not blocking this doc)

Where does "create payment link" live in the UI? Most natural: alongside the existing
business-invoice billing flow (`createBusinessInvoice`/`createItemBasedInvoice`), since it shares
items+contact. Confirm at build time.

## Estimate

~Half-day: route branch + service fn (1–2h), webhook + table + store (2h), success/failure pages +
UI trigger/list (2–3h), sandbox end-to-end verify (1h). No new dependency, no new auth pattern.
