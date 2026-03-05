# 5 - Audition Scout (Search Robot)

## Config overrides
- start_branch: dev
- pr_target: dev
- create_pr: false (keep on feature branch until mature)

## Problem

An art freelancer (musician) needs to find auditions, competitions, and performance opportunities regularly. Currently this is a manual process — browsing websites, checking social media, word of mouth. We need an automated scout that:

1. Lets the user describe what they're looking for via a chat interface with Claude
2. Runs daily background searches using Claude API + web search tools
3. Saves found opportunities and emails a summary to the user
4. Learns from user feedback (useful / not useful) to improve over time

## Fix

### 1. Chat UI for search configuration

New chat component inside the Artist business page. This is a scoped conversation — the user tells Claude what to search for:

- "אני מחפש אודישנים לחליל עם פרס כספי"
- "תחרויות בינלאומיות לנגנים צעירים"
- "הופעות סולו או קאמרי באירופה"

During the chat, Claude runs live web searches to validate and show examples. Once the user is satisfied, Claude saves a search configuration.

**Chat component:**
- Message list (user + assistant bubbles, RTL)
- Text input + send button
- Calls a Next.js API route that proxies to Claude API with search tools enabled
- Conversation history persisted so user can return and refine

**Search config storage:**
- Flexible format — a JSON document that Claude both writes and reads
- Stored in Firestore under the business (or a new Dexie table)
- Contains whatever Claude decides is useful: keywords, locations, instrument, opportunity types, natural language summary, example URLs, exclusions, etc.
- The format should be self-describing so the cron agent can interpret it

### 2. Opportunity results table

New Dexie table `scoutResults` (v14 if after Task 4, or v13 if standalone):

```typescript
type ScoutResult = {
  id?: number
  syncId?: string
  businessId: number
  title: string                    // opportunity name
  url?: string                     // link to the listing
  source?: string                  // where it was found
  summary: string                  // Claude-generated summary
  deadline?: string                // application deadline if known
  details?: string                 // additional info (prize, location, requirements)
  status: 'new' | 'useful' | 'not_useful' | 'apply' | 'not_yet' | 'not_available'
  foundAt: string                  // ISO timestamp when discovered
  createdAt: string
  updatedAt: string
}
```

Indexes: `++id, syncId, businessId, status, [businessId+status]`.

### 3. scoutResultStore

Follow standard store pattern. Methods:
- `getByBusinessId(businessId)`
- `getByStatus(businessId, status)`
- `getNew(businessId)` — shortcut for status='new'
- `add(result)`, `update(id, updates)`, `delete(id)`
- `updateStatus(id, status)` — feedback shortcut
- `export()` / `import()`

### 4. Daily cron job (8am)

**Vercel cron config** in `vercel.json`:
```json
{ "crons": [{ "path": "/api/scout/run", "schedule": "0 5 * * *" }] }
```
(5 UTC = 8am Israel)

**API route** `/app/api/scout/run/route.ts`:
- Fetch all Artist businesses with a saved search config
- For each, call Claude API with web search tools + the saved config as context
- Claude searches, finds opportunities, returns structured results
- Deduplicate against existing results (by URL or title similarity)
- Save new results to `scoutResults` table (via Firestore since cron runs server-side)
- Send summary email via Gmail API

**Manual trigger**: The same API route should be callable manually from the UI (a "חפש עכשיו" button) for testing and on-demand searches.

### 5. Email summary via Gmail API

Add `sendEmail(to, subject, htmlBody)` method to `gmailService.ts`. The `gmail.modify` scope already covers sending.

Daily email contains:
- Count of new opportunities found
- List with title, summary, deadline, link
- "פתח באפליקציה" link back to the results page

### 6. Results UI — Auditions tab

New tab in the Artist business page (add to `ARTIST_TABS` from Task 4):

| Tab | Emoji | Component |
|-----|-------|-----------|
| אודישנים (Auditions) | 🔍 | `AuditionsTab` (new) |

**AuditionsTab layout:**
- Filter bar: status filter (all / new / useful / apply / not yet)
- Result cards showing: title, summary, deadline, source link, status badge
- Feedback buttons on each card: ✅ שימושי / ❌ לא רלוונטי / 📝 להגיש / ⏳ עוד לא / 🚫 לא זמין
- "חפש עכשיו" button to trigger manual search
- "הגדרות חיפוש" button to open/reopen the search config chat

### 7. Search settings access

User can return to the chat to refine search criteria at any time. The chat loads previous conversation history so Claude has context of what was already configured.

## Files

| File | What changes |
|------|-------------|
| `app/types/scoutResult.ts` | **New** — `ScoutResult` type |
| `app/types/scoutConfig.ts` | **New** — `ScoutConfig` type (flexible JSON structure) |
| `app/db/financeDB.ts` | Add `scoutResults` table + new version |
| `app/stores/scoutResultStore.ts` | **New** — CRUD store for scout results |
| `app/services/gmailService.ts` | Add `sendEmail()` method using Gmail API |
| `app/api/scout/chat/route.ts` | **New** — API route proxying chat to Claude API with search tools |
| `app/api/scout/run/route.ts` | **New** — API route for daily cron + manual trigger |
| `app/components/business/AuditionsTab.tsx` | **New** — results list + feedback UI |
| `app/components/business/ScoutChatDialog.tsx` | **New** — chat UI for search configuration |
| `app/components/business/BusinessPage.tsx` | Add אודישנים tab to `ARTIST_TABS` |
| `vercel.json` | Add cron schedule for `/api/scout/run` |

## Verify

- [ ] Run `npx tsc --noEmit` — no type errors
- [ ] Run `npx eslint app` — no lint errors
- [ ] Start dev server on port 3100
- [ ] Open an Artist business → confirm אודישנים tab appears
- [ ] Click "הגדרות חיפוש" → chat dialog opens
- [ ] Type a search request (e.g. "תחרויות חליל בינלאומיות") → Claude responds with search results and saves config
- [ ] Close chat → click "חפש עכשיו" → manual search triggers
- [ ] **Expect**: new results appear in the list with status "new"
- [ ] Click feedback buttons on a result → status updates correctly
- [ ] Filter by status → list filters correctly
- [ ] Call `/api/scout/run` directly (via curl or browser) → returns results
- [ ] Check Gmail sent folder → summary email was sent
- [ ] **Expect**: no console errors throughout
- [ ] Take screenshot of AuditionsTab with results and feedback buttons
