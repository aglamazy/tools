# No localStorage-backed stores

All persistent app state goes in a Dexie synced table (registered in `SYNCED_DB_TABLES`) so it
gets the generic syncId-merge + deletion-ledger for free. localStorage stores sit outside that
path and sync by whole-blob overwrite.

**Incident:** a thinner-but-newer remote wiped every business-scoped subject on 2026-07-11.
`subjectStore`/`timerStore` were the last two exceptions; both are now Dexie-backed
(`subjects`/`subjectClassifications` tables, and appSettings key `activeTimer`) — no exceptions
remain, don't add one.
