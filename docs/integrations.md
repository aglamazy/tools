# Integrations reference (Telegram, Shufersal, cron)

Moved out of CLAUDE.md (aglamazo#442) to keep the per-turn context small. Read when working on these areas.

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
- Cockpit dead-man check for the grocery cron (aglamazo#409, was Healthchecks.io): `pingDeadman` after each successful run, nothing on failure (ok-only — a missed ping is the alert). Declared in `dead-man-checks.json`, registered by `npm run pre-deploy` (refuses to run without an explicit `OCTOPUS_DEADMAN_BASE_URL`); the slug is a credential and lives only in env (`DEADMAN_SLUG_GROCERY_CRON`) — unset = ping skipped
- Schedule: `groceries/{uid}/schedule` — orderDay, preferredSlot, reviewReminderHours

## Tools
- Telegram test CLI: `scripts/telegram-test.sh` — supports product picker callbacks, type a number to pick
- Cloud Run proxy source: `gcloud run deploy shu-test --source . --region me-west1` (source in GCS)
