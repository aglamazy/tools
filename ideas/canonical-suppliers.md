# Canonical suppliers — one entity, many aliases

Triggered 2026-07-13 while fixing the VAT report: "VERCEL INC." (bank/card
description), "Vercel" (the recognized-expense vendor label), and
`invoice+statements@vercel.com` (the Gmail sender that carries the actual
invoice) are all the same real-world supplier, but the app has no entity
that says so — each surface (transaction description, receipt matcher,
category name) independently guesses/matches by its own string.

Same root pattern as [`guid-for-key-entities.md`](guid-for-key-entities.md):
name-string matching instead of a stable id.

## Proposed shape

A new `Supplier` entity:
```ts
interface Supplier {
  id: string              // real uuid (crypto.randomUUID())
  name: string             // canonical display name, e.g. "Vercel"
  bankCardAliases: string[]  // raw strings seen in transaction.description/merchant, e.g. "VERCEL INC."
  emailSenders: string[]     // sender addresses for invoice matching, e.g. "invoice+statements@vercel.com"
  isForeign?: boolean         // no Israeli VAT on their invoices — relevant to the VAT report filter just added
  syncId?: string
}
```

## Where this would plug in

- `app/services/receiptMatchService.ts` — email-sender matching already exists
  ad hoc (`URL_ONLY_INVOICE_SENDERS` allow-list per `day-2026-05-12.md`); a
  Supplier's `emailSenders` would generalize that pattern instead of a
  hardcoded list.
- `TaxVatSection.tsx` — the `isForeign` flag would let the report distinguish
  "confirmed 0 VAT, foreign vendor" rows from "missing document, might still
  have real VAT" rows structurally, instead of inferring it from whether a
  document happens to be linked (see the filter added 2026-07-13 for the
  current, weaker proxy).
- Budget page `business` derivation (`t.description` / `t.merchant || t.description`)
  — could resolve through a supplier lookup for a cleaner display name than
  the raw bank/card string ("VERCEL INC." → "Vercel").

## Out of scope (for this idea)

Actually implementing this — capture only, per Agla 2026-07-13. No migration
plan written yet (unlike `category-id-key-transactions.md`, which already has
one) — worth scoping a real plan only once this and the category-id idea are
prioritized together, since they'd likely share the same alias-resolution
infrastructure.
