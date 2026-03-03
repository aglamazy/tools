# 2 - Teacher Receipt Creation

## Problem
After the teacher reviews the monthly accounting (task 1), they need to create receipts for students. Currently there's no way to generate a receipt from the lesson data.

## Fix

### 2.1 — Receipt model and store

**New file:** `app/types/receipt.ts`
```typescript
export type Receipt = {
  id?: number
  syncId?: string
  businessId: number        // FK to Business (teacher)
  studentId: number         // FK to Student
  receiptNumber: number     // Auto-incrementing per business
  periodStart: string       // ISO date — start of billing period
  periodEnd: string         // ISO date — end of billing period
  lessonCount: number       // Number of lessons in period
  lessonRate: number        // Rate at time of receipt (snapshot)
  totalAmount: number       // lessonCount × lessonRate
  createdAt: string
  updatedAt: string
}
```

**New file:** `app/stores/receiptStore.ts`

Dexie store following same pattern as studentStore:
- `getAll()`
- `getByBusinessId(businessId)`
- `getByStudentId(studentId)`
- `getLastByStudentId(studentId)` — returns most recent receipt for the student (needed to determine "since last receipt" date)
- `getNextReceiptNumber(businessId)` — max receipt number + 1
- `add(receipt)`
- `delete(id)`
- `export()` / `import()`

**File:** `app/db/financeDB.ts`

Add `receipts` table to Dexie schema (new version). Index on `businessId`, `studentId`.

### 2.2 — Receipt creation page

**New file:** `app/business/[id]/receipts/page.tsx`

Flow:
1. **Student selector** — dropdown/list of active students for this business.
2. On student selection, determine the default date range:
   - **Start date**: day after the last receipt's `periodEnd` for this student. If no previous receipt, use start of previous month.
   - **End date**: end of previous month (e.g. on Mar 2, end date = Feb 28).
   - Both dates are editable by the teacher.
3. **Lesson count** — count Google Calendar events in the date range that match the student name (same matching logic as the accounting page).
4. **Summary card** showing:
   - Student name
   - Period: {start} — {end}
   - Lessons: {count}
   - Rate: {rate} ₪
   - Total: {count × rate} ₪
   - Receipt number: {next number}
5. **"צור קבלה" (Create Receipt)** button — saves the receipt to the store.

### 2.3 — Receipt history

On the same page (or as a section below the creation form):
- List of past receipts for the selected student, sorted by date descending.
- Each row shows: receipt number, period, lesson count, total amount, date created.

## Files
| File | What changes |
|------|-------------|
| `app/types/receipt.ts` | **New** — Receipt type definition |
| `app/stores/receiptStore.ts` | **New** — Dexie store for receipts |
| `app/db/financeDB.ts` | Add `receipts` table, bump DB version |
| `app/business/[id]/receipts/page.tsx` | **New** — receipt creation page |
| `app/business/[id]/page.tsx` | Add link/tab to receipts page for teacher businesses |

## Verify

### Verify 2.1 — Receipt store
- [ ] Run `npx tsc --noEmit` — no type errors
- [ ] Run `npx eslint app` — no lint errors

### Verify 2.2 — Receipt creation
- [ ] Navigate to a teacher business page
- [ ] Click the receipts link/tab
- [ ] **Expect**: student selector is visible
- [ ] Select a student
- [ ] **Expect**: date range is shown (defaults to previous month)
- [ ] **Expect**: lesson count is displayed (from calendar matching)
- [ ] **Expect**: summary card shows student name, period, lessons, rate, total
- [ ] Click "צור קבלה"
- [ ] **Expect**: receipt is saved, appears in the history below
- [ ] **Expect**: no console errors
- [ ] Take screenshot

### Verify 2.3 — Receipt history
- [ ] After creating a receipt, verify it appears in the history list
- [ ] **Expect**: receipt number, period, lesson count, total are shown
- [ ] Take screenshot
