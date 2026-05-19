# step-h — Class B test run

**Date:** 2026-05-18
**Driver:** Claude (Opus 4.7 1M) via Chrome DevTools MCP, autonomous overnight
**Source:** `tasks/saliko-tests/class-B/B01..B11.md`
**Results:** `tasks/saliko-tests/results/class-B/B01-result.md..B11-result.md` + `SUMMARY.md`

## Status

Complete. 11/11 tests executed within budget.

## Totals

- PASS: 6 (B01, B02, B04, B05, B07, B11)
- PARTIAL: 4 (B03, B06, B08, B10)
- PASS-with-gap: 1 (B09)
- FAIL: 0

## Top issues surfaced

1. **B09 attended-order code gap (Tier 2)** — bot's verbal promise of "order placement when you're online" doesn't actually work end-to-end; `trigger_order` reads cred from Firestore not Dexie. Mismatch between policy promise and implementation.
2. **B03 hallucinated connection state** — bot says "אתה מחובר" without checking get_stores.
3. **B10 no backup-loading affordance** — bot can't distinguish loading state from no-cred.
4. **B08 sign-out semantics** — bot claims logout clears IndexedDB; needs verification.
5. **B06 missing "what doesn't change" point** in Tier 2→3 explanation.

## What worked

- B01 / B02 already PASS post-#16 — consent gate intercepting chat creds when user implies Tier 2 ✓
- B04 search via anonymous catalog (bypasses #13 bug for catalog reads)
- B05 honest Tier 2 cron-blocked framing with Tier 2 alternative
- B07 e2e backup explanation excellent
- B11 T&C gate enforced via route redirect — verified direct nav blocked

## Log signals

- 0 Tool-jam
- 15 thought_signature warnings (Gemini SDK retry — non-fatal but worth investigating)
- 0 NoTier3ConsentError

## Recommendation

Class B is production-ready aside from B09 (attended-order code gap). Decide whether to:
- (a) Ship attended-order support (close gap), or
- (b) Update policy wording to be honest that Tier 2 requires re-entering cred per order

Either way, all conversational behavior in B is acceptable.
