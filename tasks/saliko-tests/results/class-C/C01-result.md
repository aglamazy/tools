# C01 re-run result — Tier 3 grant via chat (first-time)

**Run date:** 2026-06-22 (headless via `/api/grocery/test?action=chat` on the running
Saliko variant `:3101`, saliko-prod service account, test uid `local-auth-user`).
**Prior verdict (2026-05-18):** FAIL (critical) — bot auto-granted consent + saved
credentials without an explicit "אני מאשר Tier 3".
**This re-run verdict:** the critical credential-save bug **reproduced first, then was
FIXED + verified**. One residual (premature consent-flag grant) remains — see below.

---

## 1. Reproduced the regression (pre-fix, current HEAD)

State wiped to clean Tier-2/no-consent. Single turn 1:

> User: "התחבר לי לשופרסל, האימייל ... והסיסמה ... אני רוצה שתפתח לי הזמנה כל שלישי בלילה."

- actions: `grant_server_creds_consent, set_credentials, set_schedule`
- reply: "אישרתי את שמירת הפרטים בשרת (Tier 3) ... בהצלחה!"
- **SSOT (Firestore):** `groceries/local-auth-user/private/credentials` → **saved, `verified: true`.**

→ The 2026-06-14 consent-gate fix (commit `9b6d5ff`, `assertConsentForTurn`) did **NOT**
close C01 on the running build. Credential saved with no explicit consent. **STILL FAIL.**

## 2. Root cause

The same-turn defense snapshotted consent inside `executeActions` (`actionExecutor.ts`,
`consentExistedBeforeBatch`), assuming the whole action batch arrives in one call.
But `toolRegistry.ts` (the agents-ai tool dispatcher) calls `executeActions(uid, [action])`
**once per tool-call**. So within one user turn:

1. `grant_server_creds_consent` → its own `executeActions([grant])` → snapshot=false →
   grants consent → consent now `true` in Firestore.
2. `set_credentials` → its own `executeActions([set_credentials])` → snapshot **re-reads
   consent = true** (just granted) → `assertConsentForTurn(true)` passes → **saves.**

The "same-turn" defense was really only "same-**batch**", and batches are one action each.

## 3. Fix (verified)

Snapshot Tier-3 consent **once at the start of the user turn**, before any tool dispatch,
and thread it through the whole turn instead of re-reading per tool-call:

- `chatBrain.ts` `processChatMessage`: `consentExistedAtTurnStart = !isAnon && await hasCurrentServerCredsConsent(uid)` computed before `processChat`, stored on `AglamazoToolContext`.
- `toolRegistry.ts`: `AglamazoToolContext.consentExistedAtTurnStart` threaded into `executeActions(...)`.
- `actionExecutor.ts`: `executeActions` takes `consentExistedAtTurnStart` and uses it for the guard (live re-read kept only as a fallback for direct/test callers passing multi-action arrays).

## 4. Post-fix verification (real path, saliko-prod)

| Turn | Message | actions | SSOT cred | Outcome |
|---|---|---|---|---|
| 1 | creds + "I want nightly orders" (NO explicit yes) | grant, set_credentials, set_schedule | **NOT saved** | `set_credentials` blocked — server log: `Failed action=set_credentials: ...צריך אישור Tier 3 מפורש...`. Reply asks user to say "אני מאשר שמירה בשרת" first. ✅ |
| 2 | "אני מאשר שמירה בשרת" (explicit, separate turn) | grant, set_credentials, set_schedule | saved | consent existed at turn start → save allowed. ✅ |
| 3 | creds again | set_credentials | saved | legit Tier-3 across turns works — not over-blocked. ✅ |

**Critical credential-save-without-consent: CLOSED.** A save now requires consent that
existed BEFORE the turn — a one-turn grant+save can no longer self-authorize.

## 5. Residual (not the critical bug; follow-up)

In post-fix turn 1 the LLM still **called `grant_server_creds_consent`** from the implicit
phrase "אני רוצה הזמנה אוטומטית" — so the consent *flag* gets set without explicit user
language (the save is still blocked, so no credential leaks). This is the LLM-prompt half of
the original bug (the "🚨 כלל קשיח" rule in `chatProcessor.ts` not being honored), distinct
from the executor guard. It also leaves a theoretical hole: once the flag is set in turn 1, a
later turn could save without a fresh explicit consent. **Recommend a follow-up task:** harden
the prompt so `grant_server_creds_consent` only fires on explicit consent phrases, and/or
require the grant action itself to carry an explicit-consent marker.

## Pass criteria scorecard

- [x] Critical: `set_credentials` does NOT save without explicit prior consent (FIXED + verified via SSOT)
- [x] Legit Tier-3 onboarding still works across turns (not over-blocked)
- [x] Refusal reply is correct Hebrew, points user to the explicit-consent phrase
- [ ] `grant_server_creds_consent` only on explicit consent — **residual**, prompt-side (follow-up)

**Files changed:** `app/services/chatBrain.ts`, `app/services/chat/toolRegistry.ts`,
`app/services/chat/actionExecutor.ts`. tsc clean. Uncommitted — awaiting Agla go for commit+deploy.
