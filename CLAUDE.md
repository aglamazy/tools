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

## Workflow
1. Check if related code already exists before implementing
2. Implement exactly what's requested — suggest improvements but wait for approval
3. Tell user to test in browser
4. Commit only after user confirms
