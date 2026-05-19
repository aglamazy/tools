# step-i — Class C test run

**Date:** 2026-05-18
**Driver:** Claude (Opus 4.7 1M) via Chrome DevTools MCP, autonomous overnight
**Source:** `tasks/saliko-tests/class-C/C01..C10.md`
**Results:** `tasks/saliko-tests/results/class-C/C01-result.md..C10-result.md` + `SUMMARY.md`

## Status

Complete. 10/10 tests executed within budget.

## Totals

- PASS: 3 (C05, C06, C08)
- PARTIAL: 4 (C02, C03, C04, C07)
- FAIL: 3 (C01, C09, C10) — all critical

## Top issues surfaced

### Critical (blocking)

1. **C01 — Consent gate silently bypassed.**
   - Bot called `grant_server_creds_consent` + `set_credentials` + `set_schedule` + `list_slots` in one tool tuple based purely on user saying "אני רוצה הזמנה כל שלישי בלילה" — no explicit "אני מאשר Tier 3".
   - Confirmed in `run.log`: `[ConsentService] grantServerCredsConsent uid=local-auth-user policy=2026-05-16-saliko-privacy-v1`
   - This is the exact pattern #16 was meant to prevent. The fix may have addressed the case where user explicitly chose Tier 2 (B02 PASS) but not the case where user implies wanting cron without prior Tier 2 selection.

2. **C09 — Privacy-policy compliance violation.**
   - Bot fabricated three different account-deletion UI paths
   - Invented wrong email (`support@saliko.ai` vs policy's `privacy@saliko.co.il`)
   - Never mentioned 30-day retention
   - Spec explicitly warned: "do NOT invent URLs"

3. **C10 — Decryption failures swallowed.**
   - With corrupted ciphertext, bot reported "Successfully logged in, password is valid" instead of detecting decrypt failure
   - No log signal, no user-facing diagnosis path
   - Dry-run mode appears to mask the failure entirely

### Medium

4. **C07 — `set_schedule` has no consent gate.** Writes schedule in Tier 2 without warning cron will never fire.
5. **C04 — Cron-success responses miss team-decrypt reminder.** When bot explains a successful cron run, should always include the honest disclaimer.

### Low

6. **C02 — Dual-write described symmetrically** (should be Dexie-master + server-sync).
7. **C03 — Turn 1 over-promises cron without verifying server cred state.**

## What worked

- **C05 PASS** — long-form Tier 3 disclaimer with "where the key lives" technical explanation — gold standard
- **C06 PASS** — revoke explanation, schedule retention nuance, no pushback
- **C08 PASS** — held the line under multiple pushback turns ("but isn't it encrypted?"). System prompt strong here.

## Log signals (cumulative B+C)

- 0 Tool-jam
- 15 thought_signature warnings (Gemini SDK retry; non-fatal)
- 0 NoTier3ConsentError (which itself is bad — should fire when set_credentials called without consent)
- 3 grantServerCredsConsent calls (each in an umbrella tuple — confirms eager fire)

## Recommendation

**Not ready for tomorrow's prod deploy without addressing the three critical FAILs:**

1. Harden consent gate to require explicit user "אני מאשר Tier 3" (or explicit `acceptServerCredsConsent: true` only after a confirmation turn). Add a prompt-side rule: "When user mentions 'אוטומטית' or 'בלילה' but hasn't said 'מאשר', ASK first, don't call grant_server_creds_consent."
2. Implement account-deletion UI flow (or harden bot's response template to fall back gracefully to `privacy@saliko.co.il` + 30-day phrasing — exact policy wording).
3. Add decrypt failure surfacing: log + bot template that distinguishes "no cred" from "decrypt failed".

The PASS tests (C05, C06, C08) demonstrate the right pattern is achievable when the conversation cleanly hits the disclaimer template. The failures are systemic — eager tool-call behavior and missing observability.
