# Step (b) — Revalidate Class A tests against privacy policy

**Status:** complete
**Date:** 2026-05-16
**Policy version reviewed against:** `2026-05-16-saliko-privacy-v1`
**Source of truth:** `app/saliko/privacy/privacyContent.ts`

## What was done

Walked each of the 10 Class A test files, identified its tier from the `**State:**` line, and cross-referenced every expected-bot-response and pass-criteria line against the policy. Rewrote three files; left seven untouched.

## Per-file verdict

| File | Tier the test sits in | Verdict | One-liner |
|---|---|---|---|
| A01-what-is-this.md | Tier 1 (unauthenticated) | **unchanged** | Intro + pricing chitchat; never touches credential storage. |
| A02-which-stores.md | Tier 1 | **unchanged** | Enumerates supported stores + auth-type difference; policy-neutral. |
| A03-password-security.md | Tier 2 (just signed up) | **changed-significantly** | Previous expected response said "מוצפנת בשרת שלנו... יש פענוח בצד השרת בזמן הזמנה" — that's Tier 3, not the user's actual tier. Rewrote to describe Tier 2 truthfully (browser-only IndexedDB + e2e-encrypted backup) and to mention Tier 3 as opt-in with the honest "personnel with prod access can decrypt" caveat. Dropped the "we can't see your password" anti-pattern from watch-fors and added the inverse (claiming "we can't see" at Tier 3 is itself a watch-for). |
| A04-price-coke.md | Tier 1 | **unchanged** | Catalog search only; policy allows for anon. |
| A05-organic-milk-search.md | Tier 1 | **changed-significantly** | Previous expected response said "trigger_order חסום ל-anon" as if it were correct behavior. Per Tier 1 the policy *allows* a one-shot OTP order in-session. Rewrote the "איך אני קונה" answer to describe the two policy-correct paths (anon OTP one-shot vs sign-up for recurring), and added a "Known code-vs-policy gap" block flagging that the runtime currently blocks anon trigger_order. |
| A06-diapers-compare.md | Tier 2 (just signed up) | **unchanged** | "צריך להתחבר לחנות" to save to list is correct in every tier (need a wired store to know which catalog the SKU belongs to). No policy claim made. |
| A07-english-typo.md | Tier 1 | **unchanged** | Hebrew-only enforcement + typo handling; policy-neutral. |
| A08-weather-off-topic.md | Tier 1 | **unchanged** | Off-topic deflection; policy-neutral. |
| A09-place-order-now.md | Tier 2 (just signed up) | **changed-significantly** | Previous expected said "תשלח לי בצ'אט פרטי... הסיסמה תישמר מוצפנת" — that's both vague and Tier-3-flavored. Rewrote to spell out the Tier 2 truth (password lives in browser IndexedDB, not server; e2e-encrypted backup blob for cross-device), to flag Tier 3 as an explicit opt-in with the honest decrypt caveat, and to keep the Retalix SMS alternative for users who don't want to share a password at all. Added two code-vs-policy gap notes (current saveCredentials writes plaintext to Firestore; anon trigger_order is blocked — both for step c). |
| A10-delivery-and-difference.md | Tier 1 | **unchanged** | Value-prop conversation + "who actually delivers"; policy-neutral. |

**Summary count:** 3 changed-significantly, 7 unchanged, 0 changed-trivially.

## Code-vs-policy gaps surfaced (for step c)

These are places where the test, written to express **policy-correct** behavior, will fail against the current code. Step (c) needs to close each gap:

1. **Anonymous one-shot OTP order is blocked.** Policy Tier 1 says "אפשר להתחבר לחנות באמצעות קוד חד-פעמי (OTP) ולבצע הזמנה אחת" and the blurb confirms "כל פרטי החנות נמחקים בסיום הסשן." Today `trigger_order` returns the "כדי להפעיל את הסוכן..." bounce for any user without a uid. A05 and (indirectly) A09 both touch this. Need an anon-friendly OTP order path that persists nothing past disconnect.
2. **Tier 2 credentials currently land in Firestore, not browser-only.** Step (a)'s notes flagged this already: `saveCredentials` writes plaintext Shufersal creds to Firestore today; the policy says Tier 2 should keep them in IndexedDB + e2e-encrypted backup blob. A09's expected response describes the policy-correct world; A03 makes the same claim. Both will fail an honest end-to-end run until the storage path is reworked.
3. **No tier selector / opt-in surface yet.** A03 and A09 both rely on the bot being able to say "ברירת המחדל אצלך עכשיו היא Tier 2, אפשר לעבור ל-Tier 3 דרך ההגדרות." Today there is no Tier 3 opt-in toggle anywhere. The bot can describe the policy but can't actually move a user between tiers, so any "תרצה לעבור ל-Tier 3?" follow-up has no UI to land on.
4. **No POST /api/privacy yet (already noted in step a).** Not surfaced by these specific A-tests, but: A03 mentions "מהגדרות אפשר למחוק" — there is currently no end-to-end deletion flow either, so a strict reading of the test would also fail there. Lower priority than the three above for step (c).

## Inconsistencies within the policy itself (none material)

The policy is internally consistent. One small wording note worth flagging for any future revision (NOT a blocker for step c, NOT changed here):

- The Tier 1 section says "ביקור חוזר: מתחיל מאפס. אין היסטוריה, אין רשימה קבועה, אין זיהוי שלך." That's correct for what's stored, but if/when Tier 1 OTP order is implemented, the order itself is necessarily transmitted to the store (Shufersal/Rexail) with the user's phone/email at OTP time — i.e., the store side keeps a record even if Saliko doesn't. Worth a half-sentence acknowledgement in a future v2 of the policy ("הזמנה אנונימית — החנות עצמה כן תקבל פרטי קשר כדי לבצע משלוח; Saliko לא שומר אותם אחרי הסשן"). Not in scope for step (b).

## What was NOT changed

- Policy file (`privacyContent.ts`) — frozen, as instructed.
- Test format / frontmatter / Hebrew vs English split — preserved.
- A01, A02, A04, A06, A07, A08, A10 — touched zero policy ground.
- No code edits in this step.
