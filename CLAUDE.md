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
- Extension changes: bump version in `extension/manifest.json`

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

## Workflow
1. Check if related code already exists before implementing
2. Implement exactly what's requested — suggest improvements but wait for approval
3. Tell user to test in browser
4. Commit only after user confirms
