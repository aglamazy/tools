# Key transactions by category id instead of name

## Problem

Transactions store their category as a **name string** (`Transaction.category: string`).
When a category is renamed, every transaction that held the old name is silently
orphaned — the stored string no longer matches any existing category, so the
budget dropdown (`<select value={transaction.category}>`) falls back to
"בחר נושא" and the row looks unclassified. The data is still in the DB, but
nothing in the UI or in the BTL/tax math reaches it.

Same problem for `db.businessCategories` (the merchant → category learned
auto-classify map) and for `subjectStore.classifications`.

This has already bitten us twice in this session:
1. The BTL system seeder renamed `ביטוח לאומי` → `ביטוח לאומי (yaakov)`
   and wiped months of classifications.
2. The dynamic-option workaround in `/app/budget` emits labels based on the
   member's current display name. If the label changes (email → Hebrew name,
   etc.), all historical classifications using the old tag detach.

## Goal

Make rename a no-op for classifications. A user (or the app) can rename a
category, retag a member, or edit a BTL label without losing history.

## Proposed change

### 1. Data model

Add an optional `categoryId: string` to `Transaction` and `Classification`.
Keep the existing `category: string` (the display name) as a derived,
denormalized field for now — same string the UI already renders — so nothing
outside the classification pipeline needs to change day-one.

```ts
// app/db/financeDB.ts
interface Transaction {
  // ...existing
  category?: string     // display name (denormalized; rebuilt from id)
  categoryId?: string   // NEW: stable id, source of truth
}
```

### 2. Synthetic tax categories get stable symbolic ids

The dynamic tax options currently emit labels like
`ביטוח לאומי (yaakov)`. Replace the label-based identity with a
uid-scoped symbolic id.

```
tax.btl.{uid}                    // National Insurance monthly advance
tax.incomeTaxAdvance.{uid}       // Income tax monthly / bi-monthly advance
```

Rendering still shows the display name (resolved from household member
label at render time). But what gets written to `transaction.categoryId`
is the symbolic id. Renaming the member now changes only the display, not
the stored identity.

Scheme: reserve the `tax.*` namespace. Future tax-family categories
(VAT filings, self-reports) go under the same root.

### 3. Classification write path

`transactionStore.updateAny(id, { category: name, categoryId: id })` —
always set both. The display string is kept in sync so existing consumers
that read `transaction.category` keep working during the transition.

`saveBusinessCategory(business, id)` — learned map stores the id. When the
category is a synthetic tax one, `id` is `tax.btl.{uid}` etc.

### 4. Rendering

`<select value={transaction.categoryId}>` and `<option value={cat.id}>`.
For the synthetic options, `<option value={`tax.btl.${m.uid}`}>
{`ביטוח לאומי (${tag})`}</option>`.

Display lookup: given an id, look up the name.
- For stored categories: `subjectStore.getById(id)`.
- For `tax.*` ids: parse the type and uid, find the household member,
  compose the display string.

Centralize that into a single helper `resolveCategoryDisplay(id): string`.

### 5. BTL matcher (and similar)

Drops the string prefix match entirely. Match on id:

```ts
t.categoryId === `tax.btl.${personUid}`
```

No more label-dependent fragility.

### 6. One-shot migration

On app boot (or first load of `/app/budget` / `/app/taxes`), scan
`db.transactions` and `db.businessCategories` for rows that have a
`category` name but no `categoryId`. Resolve name → id and write the id
back. Include a best-effort mapping for the legacy BTL strings to their
new symbolic ids:

```
ביטוח לאומי                  → tax.btl.{current-user-uid}
ביטוח לאומי (yaakov)         → tax.btl.{yaakov-uid}
ביטוח לאומי (suzi)           → tax.btl.{suzi-uid}
מקדמות מס הכנסה              → tax.incomeTaxAdvance.{current-user-uid}
(etc.)
```

Idempotent: rows that already have `categoryId` are skipped. Run logs a
count to the console for sanity.

### 7. Rename becomes safe

CategoriesTab rename writes the new `name` on the category record. Nothing
else is touched. Transactions continue to reference the id. Display updates
automatically.

Optional: keep the old "sweep on rename" fallback as a belt-and-suspenders
for the transition period — can drop once every transaction has a
`categoryId`.

## Files likely to change

- `app/db/financeDB.ts` — add `categoryId` to Transaction, Classification.
- `app/stores/transactionStore.ts` — write both id + display name;
  auto-classify by id.
- `app/stores/subjectStore.ts` — `getById`, `resolveCategoryDisplay`,
  classifications keyed by id.
- `app/(dashboard)/app/budget/page.tsx` — select value = id; display by
  resolver. Tax options emit `tax.btl.{uid}` etc.
- `app/components/business/TaxSelfEmployedSections.tsx` — BTL matcher
  keyed on id.
- `app/components/business/TaxesTab.tsx` — pass `personUid` through
  (already does).
- New: `app/services/categoryMigration.ts` — one-shot name → id sweep.

## Out of scope (for this idea)

- Dropping the denormalized `category` string. Keep it through the
  migration period; revisit once everything reads through the resolver.
- A UI to retroactively reclassify legacy untagged entries when a
  household gains a second member (current uid → which member?).
- Category sub-tree refactor (parentId/subCategories still name-keyed
  internally — fine, they already use ids everywhere).
