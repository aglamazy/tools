# 1 - Teacher Business Type (מורה פרטית)

## Problem
The app currently only supports project-oriented businesses (customer/projects, hourly or fixed rate). We need to support a new business type: **private teacher** (מורה פרטית).

A teacher manages students (each with a rate), teaches via classes that appear on Google Calendar, and needs a monthly accounting page that matches calendar events to students.

## Fix

### 1.1 — Add `'teacher'` to BusinessType

**File:** `app/types/business.ts`

Add `'teacher'` to the `BusinessType` union:
```typescript
export type BusinessType = 'personal' | 'business' | 'teacher'
```

Update the business creation UI to allow selecting the teacher type.

### 1.2 — Create Student model and studentStore

**New file:** `app/types/student.ts`
```typescript
export type Student = {
  id?: number
  syncId?: string
  businessId: number       // FK to Business (teacher)
  name: string             // e.g. "משה לוי"
  email?: string
  lessonRate: number       // price per lesson
  archived: boolean
  createdAt: string
  updatedAt: string
}
```

**New file:** `app/stores/studentStore.ts`

Follow the same Dexie pattern as `projectStore.ts`:
- `getAll()`
- `getByBusinessId(businessId)`
- `getById(id)`
- `add(student)`
- `update(id, updates)`
- `archive(id)`
- `delete(id)`
- `findByName(businessId, name)` — fuzzy match for calendar event matching
- `export()` / `import()`

**File:** `app/db/financeDB.ts`

Add `students` table to the Dexie schema (new version). Index on `businessId` and `name`.

### 1.3 — Student management UI

**File:** `app/business/[id]/page.tsx` (or its components)

When the business type is `'teacher'`, show a **Students** tab instead of Projects/Tasks:
- List of students with name, email, rate
- Add student button (inline form or modal)
- Edit/archive student
- Keep it simple — same style as the existing project list

### 1.4 — Monthly accounting page

**New file:** `app/business/[id]/accounting/page.tsx`

Page layout:
1. **Month selector** at top — defaults to previous month. Buttons for prev/next month.
2. **Calendar events list** — fetch all events for the selected month using `fetchCalendarEvents()` (call it for each day of the month, or adapt to support date ranges).
3. **Event-to-student matching** — for each calendar event:
   - Try to match `event.summary` to a student name (case-insensitive, partial match).
   - If matched: show the event with the student name + rate, row is green/confirmed.
   - If unmatched: show the event with a warning indicator + "צור תלמיד" (create student) button that pre-fills the name from the event summary.
4. **Monthly summary** at bottom:
   - Total lessons per student
   - Total amount per student (lessons × rate)
   - Grand total

### 1.5 — Quick student creation from unmatched events

On the accounting page, when an event doesn't match any student:
- Show a "צור תלמיד" button next to it
- Clicking opens a small inline form pre-filled with the event summary as the student name
- User enters rate (and optionally email)
- On save: creates the student AND retroactively matches all events with that name in the current month view

## Files
| File | What changes |
|------|-------------|
| `app/types/business.ts` | Add `'teacher'` to `BusinessType` |
| `app/types/student.ts` | **New** — Student type definition |
| `app/stores/studentStore.ts` | **New** — Dexie store for students |
| `app/db/financeDB.ts` | Add `students` table, bump DB version |
| `app/business/[id]/page.tsx` | Show Students tab for teacher businesses |
| `app/business/[id]/accounting/page.tsx` | **New** — monthly accounting page |
| `app/services/googleCalendarService.ts` | May need to add multi-day or month-range fetch |
| Business creation UI (settings or modal) | Add teacher type option |

## Verify

### Verify 1.1 + 1.2 — Business type + student store
- [ ] Navigate to `http://localhost:3100/tools/settings`
- [ ] Create a new business with type "מורה פרטית"
- [ ] **Expect**: business is created successfully, appears in the list
- [ ] Navigate to the business page (`/business/{id}`)
- [ ] **Expect**: a Students section/tab is visible (not Projects)
- [ ] Take screenshot

### Verify 1.3 — Student management
- [ ] On the teacher business page, click "Add student" (or similar)
- [ ] Fill in name "משה לוי", rate 150
- [ ] **Expect**: student appears in the list with name and rate
- [ ] **Expect**: no console errors
- [ ] Take screenshot

### Verify 1.4 + 1.5 — Accounting page
- [ ] Navigate to `/business/{id}/accounting`
- [ ] **Expect**: month selector is visible, defaults to previous month
- [ ] **Expect**: if Google Calendar is connected, events are listed
- [ ] **Expect**: matched events show student name + rate
- [ ] **Expect**: unmatched events show "צור תלמיד" button
- [ ] **Expect**: no console errors
- [ ] Take screenshot
