# Step (g) — Run Class A tests

**Status:** complete
**Date:** 2026-05-17
**Env:** localhost:3101 (Saliko dev), `SALIKO_DRY_RUN=true`, anon isolated Chrome MCP context

## Result: 3 PASS / 3 PARTIAL / 4 FAIL (10 tests)

Per-test transcripts + criterion analysis: `tasks/saliko-tests/results/class-A/A0X-result.md` (×10)
Full roll-up: `tasks/saliko-tests/results/class-A/SUMMARY.md`

## Bug list (severity-ordered, for fix-pass before Class B/C if Yaakov chooses)

1. **[CRITICAL] Privacy-tier defaults inverted** — bot pitches Tier 3 (server storage) when asked about credentials, omits the decrypt disclaimer. Tier 2 should be the framed default; Tier 3 should be presented as opt-in with the honesty caveat from `privacyContent.ts`. Hits A03, A09. **Fix in the chat system prompt** (`chatProcessor.ts:92-172` credentials/privacy block).
2. **[HIGH] First-turn `call:` raw-text leak** — on the first action in a fresh anon session, the model emits the tool-call block as visible chat text instead of executing it. Cold-start parser drift. Hits A04, A07. **Fix in either the system-prompt format example or the action-block parser regex.**
3. **[HIGH] No Rexail/SMS alternative when password declined** — bot ignores the OTP path even though Makor HaShefa needs only a phone number. Hits A09. **Fix in chat system prompt** — when user pushes back on password, mention the SMS-only alternative.

## Lower-severity findings

- Store-name fuzzy mapping ("האורגני" not resolved from "תבדוק באורגני")
- Bot wrongly claims it can't search Shufersal without auth (catalog reads are public)
- Generic "SalikoBot family PA" persona drift
- Internal label "Retalix" leaked in user-facing copy
- Search quality: "האגיס מידה 4" returns nothing

## Pipeline state

Class A is the only class that can run anon. Class B + C need Yaakov logged in to Saliko on the MCP browser. The bugs above all affect Class B/C too (they share the same chat brain) — running B/C now would surface the same systemic prompt issues plus Tier-2/3 specifics.

**Decision point for Yaakov:** fix the 3 prompt-level bugs before Class B/C, or run B/C now to gather full evidence first?

## Run-quality

- All 10 tests completed end-to-end. No MCP disconnects.
- Isolated context kept Yaakov's logged-in tabs untouched.
- Dry-run gate verified working: A09 invoked `trigger_order`, no real order placed.
