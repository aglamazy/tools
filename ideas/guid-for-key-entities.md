# Use proper GUIDs for key entity identity, not names or Date.now() strings

## Trigger

2026-07-13: a category named "תשתיות" got created twice (Settings has no
duplicate-name guard — since fixed, see commit history) and both rows showed
the identical usage count, because `Category.id` is `` `custom-${Date.now()}` ``
(`app/components/settings/CategoriesTab.tsx:198,216`) — not a real UUID — and
`Transaction.category` only ever stores the category **name**, never an id
(`app/db/financeDB.ts:22-54` has no `categoryId` field at all). Two categories
sharing a name are structurally indistinguishable to every consumer that
joins by name (`TaxesTab.tsx`, `TaxVatSection.tsx`, `CategoriesTab.tsx`'s
usage badge).

## Scope

Broader than the specific Transaction↔Category link already scoped in detail
in [`category-id-key-transactions.md`](category-id-key-transactions.md) (read
that one first — it has the full migration plan for that specific case).
This idea is the general principle behind it:

1. **Id generation**: `` `custom-${Date.now()}` `` is a collision-prone,
   non-standard id scheme (two saves in the same millisecond collide; it's
   also not globally unique across devices/syncId merges). Replace with a
   real UUID generator (`crypto.randomUUID()` is available in all target
   browsers) everywhere an entity mints its own client-side id instead of
   relying on Dexie's auto-increment.
2. **Reference-by-name anti-pattern**: audit other places besides
   `Transaction.category` that reference an entity by its display name/label
   string instead of a stable id — the BTL/tax synthetic category labels
   (`ביטוח לאומי (${tag})`) are a second known instance, already noted in the
   sibling idea doc's "Synthetic tax categories" section.

## Why this matters beyond the one bug

Name-based references break silently on rename (already bit us twice per the
sibling doc) and can't be disambiguated when a name collides — no way to
retroactively tell which of two identically-named rows 3,534 ₪ worth of
historical transactions actually belonged to. GUID identity is what makes
rename, merge, and dedup all safe operations instead of destructive ones.

## Out of scope

Actually implementing this — capture only, per Agla 2026-07-13 ("add to
ideas bank"). See `category-id-key-transactions.md` for the one piece that's
already scoped to an implementable plan.
