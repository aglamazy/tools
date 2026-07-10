# Epic: expenses-table — spec notes

Living doc for `epic/expenses-table`. Add to this as the spec firms up; nothing here is built yet.

## Item 1: Month × Supplier table

### Problem
Expenses tab (`app/components/business/ExpenseTab.tsx`, business detail → הוצאות)
only shows a flat chronological list of expense transactions. No way to see
totals broken down by month and by supplier at a glance.

### Goal
Pivot/matrix view: one axis = month, other axis = supplier, cells = summed
expense amount for that month+supplier. Row/column totals.

### Data model notes (from investigation, not yet confirmed by Agla)
- Source rows: `db.transactions` filtered to `category` ∈ business's expense
  subjects (`subjectStore`, `type==='expense'`, `businessId===businessId`) and
  `amount < 0` — same filter `ExpenseTab.loadTransactions()` already uses.
- **No explicit "supplier" field exists today.** Closest resolution chain,
  already used for the description column: `firstDoc?.vendor || t.merchant || t.description`
  (linked `ExpenseDocument.vendor` → card `merchant` → raw `description`).
- "נושא" (subject, `t.category`) is a **different axis** — it's the expense
  category (e.g. פרסום), not the supplier. Don't conflate the two.
- Month grouping key already exists: `Transaction.month` = `"MM/YYYY"`.

### Decisions (Agla, 2026-07-10)
1. **Supplier identity** — keep simple: the raw string that already shows on
   the description line (`firstDoc?.description || firstDoc?.vendor || t.merchant || t.description`
   for transactions, `d.vendor || d.fileName` for partner-paid docs). No
   normalization pass.
2. **Layout** — year-paged. Year selector on top, defaults to current year.
   **Months = columns** (Jan→Dec), suppliers = rows. Row sorted by supplier
   total (busiest first).
3. **Where it lives** — a small view toggle at the top of the Expenses tab:
   "רשימה" (existing list, default) / "טבלה" (new pivot). Pivot mode swaps
   the filter bar for just the year selector.
4. **Scope** — current business only (matches existing `ExpenseTab` pattern).
5. **Partner-paid docs** — included. Include both transaction-backed and
   partner-paid rows in the pivot, same as the list view.
6. **Content shown** — deliberately thin. Goal is (a) spot a supplier that
   was forgotten in a given month, (b) see totals per month, (c) see totals
   per supplier. Cell = summed amount only (no VAT, no party, no receipt
   status). Total row (per month) + total column (per supplier). Blank
   cells are the point — they're what surfaces a forgotten supplier.
7. **Refactor** — `ExpenseTab.tsx` (1101 lines, over the 850 cap) gets split
   into smaller reusable pieces alongside this feature, not just grown
   further:
   - `ExpenseFiltersBar.tsx` — period/party/amount filters + totals + zip/cash/import buttons
   - `ExpenseCashForm.tsx` — the inline "+ מזומן" form
   - `ExpenseRowsTable.tsx` — the existing list-view table
   - `ExpenseMonthSupplierPivot.tsx` — the new pivot view (self-loads its own year-scoped data)
   - `ExpenseTab.tsx` stays the orchestrator: state, data loading, view-mode toggle, wiring.
