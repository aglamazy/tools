# Class A test run — SUMMARY (rerun)

**Run:** 2026-05-18
**Env:** localhost:3101 (Saliko dev), `SALIKO_DRY_RUN=true`, isolated Chrome MCP context `saliko-class-A-anon-rerun`, anon (Tier 1), sessionStorage cleared between tests, page reloaded between tests.

## Totals: 5 PASS / 4 PARTIAL / 1 FAIL  (prev: 3 PASS / 3 PARTIAL / 4 FAIL)

| Test | Prev verdict | New verdict | Delta |
|---|---|---|---|
| A01 — intro | PARTIAL | **PASS** | Saliko-specific identity now used; Tier 1 disclaimer volunteered |
| A02 — supported stores | PASS | **PASS** | Same verdict; explanation in turn 3 now Tier-1-aware |
| A03 — privacy & security | FAIL | **PASS** | Tier-default inversion fixed end-to-end |
| A04 — Coke price compare | FAIL | **FAIL** | `call:` leak gone; new blocker is Shufersal-anon-auth |
| A05 — organic milk search | FAIL | **PARTIAL** | Store-name "האורגני" now resolves; OTP Tier 1 path described correctly |
| A06 — diapers compare | PARTIAL | **PARTIAL** | Same verdict; bot now distinguishes "Shufersal error" vs "MhS empty" |
| A07 — English + typo | PARTIAL | **PARTIAL** | `call:` leak gone; Shufersal-anon-auth blocker remains |
| A08 — off-topic | PASS | **PASS** | Same verdict; warmer voice (emoji + joke) |
| A09 — order 5 items now | FAIL | **PASS** | Privacy-tier defaults fixed *and* Rexail/SMS alternative offered |
| A10 — delivery & value-prop | PASS | **PASS** | Same verdict |

**Net: +2 PASS, +1 PARTIAL, –3 FAIL.**

## Status of the 3 named bugs

| # | Bug | Status |
|---|---|---|
| 1 | Privacy-tier defaults inverted (A03, A09) | **RESOLVED.** A03 PASS, A09 PASS. Bot now opens Tier 1 / Tier 2 framings correctly and avoids the "we don't see your password" myth. |
| 2 | First-turn `call:` raw text leak (A04, A07) | **RESOLVED, by a different mechanism.** The jam detector (`detectToolJam`) never fired (`Tool-jam detected` count = 0 in run.log). Reason: model alias change from pinned `gemini-2.5-flash` to `gemini-flash-latest` means the model now emits proper `functionCall` API objects rather than the `call:` text pattern. The jam-recovery code is now dead-code paying for a bug that no longer occurs syntactically. New failure modes in those paths are different — see new bugs below. |
| 3 | Missing Rexail/SMS alternative when password declined (A09) | **RESOLVED.** Bot now volunteers the OTP-store alternative in turn 1 and again in turn 3 when the user explicitly declines a password. |

## New bug list (severity-ordered)

### 1. [HIGH] Shufersal catalog read fails for anon users
**Hits:** A04, A06, A07. Server log: `Error: Shufersal credentials not configured at app/services/grocery/shufersalClient.ts:325`. The Shufersal client calls `login(uid)` → `loadCredentials(uid)` before any search, even though catalog reads are public per the test spec. For Tier 1 there is no `uid` and no creds, so every Shufersal search fails. Bot handles it gracefully ("תקלה זמנית בחיפוש") but the test goals (price compare, milk price) cannot be met.
**Fix location:** `app/services/grocery/shufersalClient.ts` — split catalog reads (public) from authenticated actions (cart, orders) into separate code paths. The Shufersal site's public catalog endpoints don't require auth.

### 2. [MEDIUM] Gemini API "thought_signature missing" 400 errors
**Hits:** all tests that triggered a tool call followed by a tool result (A04, A05, A06, A07, A10). Run.log shows 15 occurrences. After a function call returns a tool result, the second model turn errors with `400 INVALID_ARGUMENT: Function call is missing a thought_signature in functionCall parts`. The chat-processor retry path (`sleep 1s + temperature=0`, then drop tools) eventually returns a graceful "תקלה" reply, but the data the user asked for is lost.
**Fix location:** `app/services/llm/geminiClient.ts` — the message-history serialization for function-call turns needs to preserve the `thoughtSignature` field that Gemini returns on the first turn, so the second turn can include it. This is a documented Gemini API requirement (https://ai.google.dev/gemini-api/docs/thought-signatures) that the current client doesn't honor.

### 3. [LOW] Stray "ok" tokens leak as raw chat text
**Hits:** A04 (turn 3 picker block), A05 (turn 1 picker block). A bare `ok` shows up as a chat message just before a selection picker is rendered. Likely a debug marker or echo of an internal "ok" status string being rendered in a bubble.
**Fix location:** `app/components/AppChat*` rendering layer or the action-execution loop — find where `ok` is being pushed as a message body and either drop it or skip rendering empty/short status strings.

### 4. [LOW] "Rexail" internal label leaks in user-facing copy
**Hits:** A02 (turn 3), A05 (turn 3). User-facing text uses "רשת Rexail" / "חנויות ה-Rexail" instead of "רקסייל" or skipping the technical label entirely. Same as prev run.
**Fix location:** chat system prompt — instruct the bot to use "רקסייל" / "מקור השפע ועוד" rather than the technical "Rexail" name.

### 5. [LOW] Search query simplification
**Hits:** A05 (turn 1 — "חלב אורגני" was simplified to plain "חלב"). The picker showed dairy generally, not specifically organic milk. Search-quality issue rather than chat issue.

## Tool-jam escalation log

- `Tool-jam detected` log lines across 10 tests: **0**.
- `gemini-flash-latest` API calls: 62.
- `gemini-2.5-pro` escalation invocations: 0.
- Empty Gemini response retries: 7 (these are the `thought_signature` recovery paths).

The jam-detection code path is currently dead — the model never emits the `call: name(args)` text pattern that the regex looks for. The model alias change to `gemini-flash-latest` independently eliminated the original jam symptom by making the model use the proper functionCall API. The escalation-to-pro path is therefore not exercised in this run; if the underlying jam returns (e.g. after another model version bump), the detector should catch it. For now there's no evidence the escalation ladder is actually solving any problem.

## Run-quality notes

- All 10 tests completed end-to-end, no MCP disconnects.
- Isolated context worked cleanly — no leakage between tests; logged-in tabs in other contexts untouched.
- Dry-run gate not exercised this run because A09's flow never reached `trigger_order` (the bot redirected to OTP-store onboarding instead, before any order trigger).
- Per-test reset: page reload + sessionStorage clear between every test. Reliable.
