@~/.claude/ARCHITECTURE.md
@~/.claude/VERCEL.md
# Aglamazo — Financial Management App

Rules marked `→ harness/<file>.md` are still IN FORCE from this one line; the file holds the
incident/reasoning, read only if you're about to break, dispute, or extend that rule.
Full pre-index text: `harness/00-FULL-PRE-INDEX-2026-09-11.md`.

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
- **No localStorage-backed stores** — all persistent app state goes in a Dexie synced table. → `harness/01-no-localstorage-stores.md`
- Extension changes: bump version in `extension/manifest.json`
- **Never use `git stash`** — commit (even WIP) instead. → `harness/02-never-git-stash.md`

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
- **This directory is shared by multiple Vercel projects** — use `scripts/vercel-deploy-scoped.sh <project-name> [args...]`, never a bare `vercel deploy`. → `harness/03-shared-vercel-directory.md`

## Integrations
- Telegram bot, Shufersal/grocery, grocery cron + dead-man check: `docs/integrations.md` (read before touching them)

## Testing & Tools
- MCP Chrome DevTools: use for browsing any web service (Gmail, Telegram Web, Shufersal, healthchecks.io) — don't ask user to do it manually
- Always test locally before deploying to prod
- When testing, go end-to-end (20 questions, not 3)

## Workflow
1. Check if related code already exists before implementing
2. Implement exactly what's requested — suggest improvements but wait for approval
3. Tell user to test in browser
4. Commit only after user confirms
