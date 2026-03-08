# 4 - Art Freelancer Business Type + Artist Profile

## Problem

The app supports Personal, Business, and Teacher business types. We need a new **Artist** type for art freelancers (musicians, performers) with a flexible profile built from Q&A pairs. This profile will later feed into an AI Form Filler that auto-fills audition/competition application forms.

The profile is **not a fixed schema** — it's an open-ended Q&A store where the user defines their own questions and answers. Answer types include: short text (word), date, paragraph, photo, file (PDF/DOCX), and arrays of any of these primitives.

## Fix

### 1. Add Artist business type

- Add `Artist = 'artist'` to the `BusinessType` enum.
- Add config entry: `{ label: 'אמן', icon: '🎨', badgeBackground/badgeColor }`.

### 2. Create ProfileQA type and Dexie table

New type:

```typescript
type ProfileQAAnswerType = 'word' | 'date' | 'paragraph' | 'photo' | 'file'

type ProfileQA = {
  id?: number
  syncId?: string
  businessId: number
  question: string
  answerType: ProfileQAAnswerType
  isArray: boolean                    // true = answer is an array of answerType
  answer: string | string[]           // single value or array; files/photos stored as Firebase Storage URLs
  tags?: string[]                     // optional grouping: 'bio', 'education', 'repertoire', etc.
  createdAt: string
  updatedAt: string
}
```

Add `profileQAs` table in a new Dexie version (v13). Indexes: `++id, syncId, businessId, [businessId+answerType]`.

### 3. Create profileQAStore

Follow `studentStore` pattern. Methods:

- `getByBusinessId(businessId)` — all Q&As for a business
- `getByTag(businessId, tag)` — filter by tag
- `getById(id)`
- `add(qa)` — create new Q&A entry
- `update(id, updates)` — partial update
- `delete(id)`
- `export()` / `import()` — bulk operations for sync

### 4. Artist-specific tabs in BusinessPage

When `business.type === BusinessType.Artist`, render `ARTIST_TABS` instead of the default `TABS`:

| Tab | Emoji | Component | Notes |
|-----|-------|-----------|-------|
| פרופיל (Profile) | 📋 | `ProfileTab` (new) | Q&A management |
| הכנסות (Income) | 💰 | `IncomeTab` (existing) | Reuse as-is |
| הגדרות (Settings) | ⚙️ | `BusinessSettingsTab` (existing) | Reuse as-is |

### 5. ProfileTab component

A page that lists, adds, edits, and deletes Q&A entries.

**List view:**
- Cards showing question, answer preview, and answer type badge
- Group by tags if tags exist (collapsible sections), ungrouped at the bottom
- "הוסף שאלה" (Add question) button

**Add/Edit dialog or inline form:**
- Text input for the question
- Dropdown to select answer type (word / date / paragraph / photo / file)
- Toggle for "multiple answers" (isArray)
- Answer input matching the type:
  - `word` → text input
  - `date` → date picker
  - `paragraph` → textarea
  - `photo` → file upload (image/*), show thumbnail preview
  - `file` → file upload (PDF, DOCX), show filename
  - When `isArray` → render a list with add/remove buttons for each value
- Optional tags input (comma-separated or chips)
- Save / Cancel buttons

**File uploads:**
- Upload to Firebase Storage under `profiles/{businessId}/{filename}`
- Store the download URL as the answer value

### 6. BusinessForm update

Add Artist to the radio button list in BusinessForm so users can create Artist businesses.

## Files

| File | What changes |
|------|-------------|
| `app/types/business.ts` | Add `Artist = 'artist'` to enum |
| `app/types/businessColors.ts` | Add Artist config `{ label: 'אמן', icon: '🎨', ... }` |
| `app/types/profileQA.ts` | **New** — `ProfileQA` type and `ProfileQAAnswerType` |
| `app/db/financeDB.ts` | Add `profileQAs` table property, add `.version(13).stores()` with new table |
| `app/stores/profileQAStore.ts` | **New** — CRUD store following `studentStore` pattern |
| `app/components/business/ProfileTab.tsx` | **New** — Q&A list + add/edit UI |
| `app/components/business/BusinessPage.tsx` | Add `ARTIST_TABS` constant + conditional rendering for Artist type |
| `app/components/settings/BusinessForm.tsx` | Add Artist to the type radio buttons |

## Verify

- [ ] Run `npx tsc --noEmit` — no type errors
- [ ] Run `npx eslint app` — no lint errors
- [ ] Start dev server on port 3100
- [ ] Navigate to `http://localhost:3100` → open Settings → Businesses
- [ ] Create a new business, confirm 🎨 אמן appears as a type option
- [ ] Select Artist type, save the business
- [ ] Open the new Artist business from the sidebar or businesses list
- [ ] Confirm three tabs appear: פרופיל, הכנסות, הגדרות
- [ ] Click פרופיל tab → confirm empty state with "הוסף שאלה" button
- [ ] Add a Q&A with type `word` (e.g. question: "כלי ראשי", answer: "חליל")
- [ ] Add a Q&A with type `paragraph` (e.g. question: "ביוגרפיה", answer: a few sentences)
- [ ] Add a Q&A with type `date` (e.g. question: "תאריך לידה", answer: pick a date)
- [ ] Confirm all three entries display correctly in the list
- [ ] Edit one entry, change the answer, confirm it saves
- [ ] Delete one entry, confirm it disappears
- [ ] **Expect**: no console errors throughout
- [ ] Take screenshot of the profile tab with Q&A entries
