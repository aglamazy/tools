# Step (g2) — Re-run Class A tests after fix-pass

**Status:** complete
**Date:** 2026-05-18
**Env:** localhost:3101 (Saliko dev), `SALIKO_DRY_RUN=true`, anon isolated Chrome MCP context `saliko-class-A-anon-rerun`

## Result: 5 PASS / 4 PARTIAL / 1 FAIL (10 tests)

**Delta vs prev (step-g):** 3 PASS / 3 PARTIAL / 4 FAIL → 5 PASS / 4 PARTIAL / 1 FAIL. Net +2 PASS, +1 PARTIAL, –3 FAIL.

Per-test transcripts + criterion analysis: `tasks/saliko-tests/results/class-A/A0X-result.md` (×10, all overwritten)
Full roll-up + bug list: `tasks/saliko-tests/results/class-A/SUMMARY.md`

## Verdict-per-test delta

| Test | Prev | New | Δ |
|---|---|---|---|
| A01 | PARTIAL | PASS | ↑ |
| A02 | PASS | PASS | = |
| A03 | FAIL | PASS | ↑↑ |
| A04 | FAIL | FAIL | = (different root cause) |
| A05 | FAIL | PARTIAL | ↑ |
| A06 | PARTIAL | PARTIAL | = (more honest failure) |
| A07 | PARTIAL | PARTIAL | = (cleaner) |
| A08 | PASS | PASS | = |
| A09 | FAIL | PASS | ↑↑ |
| A10 | PASS | PASS | = |

## Status of previously known bugs

1. **[RESOLVED] Privacy-tier defaults inverted** (fix #1) — verified end-to-end in A03 (full PASS) and A09 (full PASS). Bot now correctly frames Tier 1 / Tier 2 / Tier 3 storage at the user's actual current tier. The "we can't see your password" myth is gone.
2. **[RESOLVED — but by a different mechanism than the planned jam-detector]** First-turn `call:` raw-text leak. Root cause was the pinned `gemini-2.5-flash` model emitting the wrong output format. Fix #2's model alias change to `gemini-flash-latest` independently eliminated the leak — the model now uses the proper functionCall API. The accompanying `detectToolJam` regex never matched in this run (count = 0 across 10 tests). The escalation-to-`gemini-2.5-pro` path is currently dead code.
3. **[RESOLVED] Rexail/SMS alternative when password declined** (fix #3) — verified in A09. Bot volunteers the OTP path in turn 1 *before* the user pushes back, and re-confirms in turn 3.

## New bug list (severity-ordered, surfaced by the rerun)

1. **[HIGH] Shufersal catalog read fails for anon** — `shufersalClient.ts:325` throws "Shufersal credentials not configured" because the client calls `loadCredentials(uid)` before any search. Catalog reads should be public. Blocks A04 (FAIL), A06 (PARTIAL), A07 (PARTIAL).
2. **[MEDIUM] Gemini API thought_signature missing on 2nd model turn** — 15 occurrences in run.log. After a tool result is sent back, Gemini 400's with `INVALID_ARGUMENT: Function call is missing a thought_signature`. The retry path drops tools and produces a graceful "תקלה" reply, but the user's data request is lost. Fix: serialize the `thoughtSignature` field returned with the first-turn functionCall into the second-turn message history.
3. **[LOW] Stray "ok" tokens leak as raw chat bubbles** — seen in A04, A05 right before picker bubbles render. Likely a debug status string being treated as a bot message.
4. **[LOW] "Rexail" internal label leaks** — A02 ("רשת Rexail"), A05 ("חנויות ה-Rexail"). Same as prev run; not fixed yet.
5. **[LOW] Search query truncation** — A05 turn 1 ran "חלב" instead of "חלב אורגני".

## Pipeline state

Class A's three named bugs from step (g) are all closed. The new top blocker is the Shufersal-anon-catalog-read backend issue, which affects 3 of the 10 tests and would also affect Class B/C the moment a user without saved Shufersal creds runs a price-check. The thought_signature issue is a Gemini-SDK plumbing bug that is recoverable but hurts the UX every time a search runs.

**Decision points for Yaakov:**
- Fix the Shufersal anon catalog read (move `login()` out of the search path) before running Class B/C.
- Decide whether to keep the dead jam-detector code, prune it, or generalize it to catch the new thought_signature failure pattern.
- Class B/C still need a logged-in Saliko session on the MCP browser — they were not in scope for this rerun.

## Run-quality

- All 10 tests completed end-to-end. No MCP disconnects.
- Isolated context kept other browser tabs untouched.
- Dry-run gate not exercised this run (A09 didn't reach `trigger_order` — the bot redirected to OTP onboarding before any order trigger). Prev run reached the gate; new behaviour is policy-better (no need to bounce because no order attempt was made).
- Reset between tests via page reload + sessionStorage clear. Stable.
