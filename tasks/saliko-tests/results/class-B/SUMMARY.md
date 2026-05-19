# Class B — Summary

**Run date:** 2026-05-18 (overnight autonomous via Chrome MCP)
**Environment:** http://localhost:3101, dry-run ON, fresh root/local-auth-user session

## Totals

- **11/11** tests executed
- **PASS:** 6 (B01, B02, B04, B05, B07, B11)
- **PARTIAL:** 4 (B03, B06, B08, B10)
- **PASS-with-gap:** 1 (B09 — correct conversational, but underlying attended-order Tier 2 capability gap remains)
- **FAIL:** 0
- **INCONCLUSIVE:** 0

## Per-test table

| # | Title | Verdict | Notes |
|---|---|---|---|
| B01 | Signup + first connect (Settings) | PASS | (existing) — IndexedDB explanation excellent |
| B02 | Chat connect, decline consent | PASS | (existing) — post-#16 honoring Tier 2 choice |
| B03 | Chat redirects to Settings | PARTIAL | Bot announced "אתה מחובר" though no cred exists |
| B04 | Search + add to standing list | PASS | Anonymous catalog search works |
| B05 | Weekly cron — blocked in Tier 2 | PASS | Honest Tier 3 framing |
| B06 | "What changes with Tier 3?" | PARTIAL | 3/4 points covered |
| B07 | Cross-device sync via e2e | PASS | Excellent e2e backup explanation |
| B08 | Sign-out: what stays/goes | PARTIAL | Claims logout wipes Dexie; missed 30-day |
| B09 | "Place order now" Tier 2 | PASS+gap | Tier 2 attended-order code gap remains |
| B10 | Backup restore failure | PARTIAL | No loading-state vs no-cred distinction |
| B11 | T&C clear blocks app | PASS | Gate enforced via route redirect (verified) |

## Bug list (severity-ordered)

1. **B09/policy gap #12 — Tier 2 attended-order code path doesn't exist.** Bot suggests it should work, but `trigger_order` reads cred from Firestore.
2. **B03 — Bot fabricates connection state.** Says "מחובר" without verifying.
3. **B10 — No "backup loading" affordance.** Can't distinguish loading from no-cred.
4. **B08 — Sign-out semantics unclear.** Bot claims logout wipes IndexedDB; missing 30-day mention.
5. **B06 — 4th policy point missing.** Bot omits "credit card not at Saliko / history already in cloud Tier 2 too".

## Design-drift notes

- B01 direct-Shufersal claim — CORS forces routing through Vercel API; not literal
- Standing-list ownership — could clarify Firestore lives in Tier 2 too

## Log-line counts (run.log)

- Tool-jam detected: **0**
- thought_signature errors: **15** (Gemini retry on tool calls — non-fatal)
- NoTier3ConsentError: **0**

## Verdict for Class B

Solid. 6 PASS + 4 PARTIAL + 1 PASS-with-known-gap, 0 FAIL. Suitable for deploy with attention to B09 gap.
