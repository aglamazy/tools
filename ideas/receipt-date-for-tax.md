# Use receipt date for tax calculations

## Problem
Tax calculations use the bank transaction date, but income should be attributed to the period when the receipt/invoice was issued. Example: receipt dated 31/12/2025, bank credit on 02/01/2026 — income shows in January instead of December.

## What needs to change
- `YpayDocument` has no document date field (only `createdAt`)
- All tax grouping (7+ locations in TaxesTab.tsx + TaxExemptBadge.tsx) uses `transaction.month`
- Need to prefer receipt date over transaction date when a receipt exists

## Complexity: Medium
- Schema migration: add `docDate` to YpayDocument
- Store document date when creating YPAY documents
- Build join: transactions → ypay docs at tax calculation time
- Update all `t.month` filtering to use effective date helper
- Backfill: use `createdAt` for existing records

## Files involved
- `app/db/financeDB.ts` — add `docDate` to YpayDocument
- `app/db/schemaVersions.ts` — new version
- `app/services/ypayService.ts` — store docDate on create
- `app/components/business/TaxesTab.tsx` — 5 filter points
- `app/components/TaxExemptBadge.tsx` — 2 filter points
