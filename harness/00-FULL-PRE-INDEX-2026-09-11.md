@~/.claude/ARCHITECTURE.md
@~/.claude/VERCEL.md
# Aglamazo — Financial Management App

## Build & Dev
- Dev: `npm run dev` (port 3100)
- Build: `npm run build`
- Lint: `npm run lint`
- Type check: `npx tsc --noEmit`
- Pre-commit hooks: eslint fix + tsc + backup stores check (via husky/lint-staged)

## Stack
- Next.js 14 App Router, TypeScript strict
- Dexie (IndexedDB) for local DB, Firestore for sync
- RTL Hebrew UI (`dir="rtl"`)
- Google Drive API for document storage

## Architecture
- Components: `app/components/`
- DB schema & types: `app/db/financeDB.ts`
- Stores (data access): `app/stores/` — always use Store classes, never direct IndexedDB
- Services: `app/services/`
- Types: `app/types/`
- API routes: `app/api/`
- Synced tables registry: `app/services/syncedTables.ts` — add new tables here

## LLM Usage
- Platform provides Gemini as included — works out of the box, no user configuration needed.
- User can optionally use their own Anthropic key for Claude.
- In both cases, functionality must work transparently — APIs must not assume a specific provider.
- LLM abstraction: `app/services/llm/` — default provider is `gemini`, fall back to it when no Anthropic key is set.

## Rules
- Max file length: 850 lines (eslint enforced)
- No native browser dialogs (alert/confirm/prompt)
- API routes must use route guards (eslint: require-api-guard)
- New DB tables must be added to SYNCED_DB_TABLES (eslint: no-inline-table-lists)
- Quote shell paths containing `()` or `[]` (Next.js app router paths)
- Don't commit until user confirms it works in the browser
- Keep console.log until feature is verified working
- Use Store classes for data access, not direct localStorage/IndexedDB
- **No localStorage-backed stores.** All persistent app state goes in a Dexie synced table (registered in `SYNCED_DB_TABLES`) so it gets the generic syncId-merge + deletion-ledger for free. localStorage stores sit outside that path and sync by whole-blob overwrite — a thinner-but-newer remote wiped every business-scoped subject on 2026-07-11. `subjectStore`/`timerStore` were the last two exceptions; both are now Dexie-backed (`subjects`/`subjectClassifications` tables, and appSettings key `activeTimer`) — no exceptions remain, don't add one.
- Extension changes: bump version in `extension/manifest.json`
- **Never use `git stash`.** If a branch switch needs the working tree clean, commit the work first (a WIP commit is fine — amend or squash later) rather than stashing it. This repo already has 5+ pre-existing stashes nobody tracks the contents of; don't add to that pile. If you're unsure whether to commit, ask rather than stash.

## Landmines (worker-facing — `task-prepare` copies this into every baked spec)
Build/ship-breakers a memoryless worker WILL hit unless told. Check each against your change:
- **Dexie schema changes need a NEW version.** Never edit/delete an existing entry in `app/db/schemaVersions.ts` (corrupts the version chain). Add an unindexed optional field → no bump. Add/change an index or table → append a NEW version. REMOVE a table → append a new version with `tableName: null` (don't delete the old line).
- **New synced table → register in `SYNCED_DB_TABLES`** (`app/services/syncedTables.ts`) or CloudSync silently skips it (eslint: no-inline-table-lists).
- **Never persist app state in localStorage — use a Dexie synced table.** localStorage stores sync by whole-blob OVERWRITE (thinner-newer remote clobbers a richer local → data loss, incident 2026-07-11). Only Dexie synced tables get the syncId-merge + deletion ledger. If you must touch the legacy `subjectStore`/`timerStore`, their sync import MUST merge, not overwrite (`check-backup-stores.js` enforces this in pre-commit).
- **850-line file cap (eslint).** Files near the limit (e.g. `TimingTab.tsx`) reject additions — put new logic in a new file/component, don't grow the file.
- **Quote app-router paths with `()`/`[]`** in shell/git (e.g. `"app/(dashboard)/app/business/[id]/page.tsx"`) or the shell mangles them.
- **Never catch-and-swallow into a naked 500 or a silent default** — fix the cause; if you must catch, log/surface it (a swallowed throw was the Saliko `/api/chat` 500).
- **Inline `if/else` needs a separator** — `if (c) a; else b` or braces; `if (c) a else b` on one line is an SWC parse error (broke the build 2026-07-03).
- **DoD = merged AND runs on localhost:3100** (`tsc --noEmit` clean, the real UI action works). "Pushed to origin" is a separate deploy step — don't call it shipped when it's only committed. Keep console.logs until verified.
- **This directory is shared by multiple Vercel projects** (aglamazo, saliko, ...) distinguished by project-level env vars — `.vercel/project.json` only points at ONE at a time, so a bare `vercel deploy`/`vercel ls` silently targets whatever it's currently linked to, which may not be the one you mean (bit us 2026-08-02: a saliko-targeted deploy landed on aglamazo instead). Use `scripts/vercel-deploy-scoped.sh <project-name> [vercel deploy args...]` — it links, deploys, and restores the original link afterward even on failure.

## Telegram Bot (AglamazoBot)
- Webhook: `app/api/telegram/webhook/route.ts`
- Chat LLM: `app/services/telegram/chatProcessor.ts` (Gemini, action blocks)
- Action executor: `app/services/telegram/actionExecutor.ts`
- Test CLI: `scripts/telegram-test.sh` (supports product picker callbacks)
- Bot works in private chats and groups (admin, privacy mode off)
- Users resolved by Telegram user ID — no `/link` needed if private chat is linked

## Shufersal Integration
- HTTP client: `app/services/grocery/shufersalClient.ts` (direct in dev, Cloud Run proxy in prod)
- Proxy: `shu-test` on Cloud Run (me-west1), Python, source in GCS
- Grocery store: `app/services/grocery/groceryStore.ts` (Firestore: `groceries/{uid}`)
- Product resolver: `app/services/grocery/productResolver.ts` (name → catalogId cache)
- Smart search filter: LLM ranks/filters Shufersal results by user intent
- Checkout flow: auth → SSO token → set slot (with CSRF) → Payme JWT → placeOrder

## Cron & Monitoring
- Grocery cron: `app/api/grocery/cron/route.ts` — every 2 hours (vercel.json)
- Healthchecks.io: pings `HEALTHCHECK_CRON_URL` after each run, `/fail` on errors
- Schedule: `groceries/{uid}/schedule` — orderDay, preferredSlot, reviewReminderHours

## Testing & Tools
- MCP Chrome DevTools: use for browsing any web service (Gmail, Telegram Web, Shufersal, healthchecks.io) — don't ask user to do it manually
- Telegram test CLI: `scripts/telegram-test.sh` — supports product picker callbacks, type a number to pick
- Cloud Run proxy source: `gcloud run deploy shu-test --source . --region me-west1` (source in GCS)
- Always test locally before deploying to prod
- When testing, go end-to-end (20 questions, not 3)

## Workflow
1. Check if related code already exists before implementing
2. Implement exactly what's requested — suggest improvements but wait for approval
3. Tell user to test in browser
4. Commit only after user confirms
