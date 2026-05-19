# Step (d) — Class B test sessions (Tier 2: logged-in, no server-creds consent)

**Status:** complete (markdown only — no code)
**Date:** 2026-05-16
**Policy SoT:** `app/saliko/privacy/privacyContent.ts` → `SALIKO_PRIVACY_TIERS['logged-in-no-server-creds']`
**Persona for all 10 tests:** signed in via Google sign-in, opted-out of (or never asked for) Tier 3 server-side cred storage. Almost-full UX while online; no cron.

## The 10 files

| # | File | One-line summary |
|---|---|---|
| B01 | `class-B/B01-signup-first-connect-settings.md` | Fresh sign-up; bot routes to Settings → External Services for Dexie-only credential entry; does NOT push Tier 3. |
| B02 | `class-B/B02-chat-connect-decline-consent.md` | User asks chat to connect Shufersal; bot offers Tier 2/3 fairly; user declines Tier 3 → bot respects, explains "no cron" honestly. |
| B03 | `class-B/B03-chat-redirects-to-settings-after-decline.md` | Graceful degradation — bot redirects to Settings UI rather than trying chat-side `set_credentials` after Tier 3 declined. Covers cross-device backup truthfully. |
| B04 | `class-B/B04-search-and-add-to-list.md` | With cred in Dexie only — search + add to standing list both work; bot doesn't ask for creds or push Tier 3. |
| B05 | `class-B/B05-weekly-cron-schedule-blocked.md` | User asks for weekly cron; bot explains Tier 2 can't do unattended cron and offers Tier 3 as opt-in with the honest decrypt caveat; doesn't call `set_schedule`. |
| B06 | `class-B/B06-what-changes-if-i-allow-server-save.md` | User asks "what changes at Tier 3?"; bot quotes policy faithfully (added/enabled/trade-off/unchanged) and describes revoke flow. |
| B07 | `class-B/B07-cross-device-sync.md` | Same user signs in on second device; bot correctly says e2e-encrypted backup syncs the vault (Tier 2 promise), explains the user-held key. |
| B08 | `class-B/B08-signout-explanation.md` | Sign-out behavior: Dexie persists locally, backup persists in cloud, server never had plaintext. Distinguishes sign-out / Dexie clear / full account deletion. |
| B09 | `class-B/B09-place-order-via-chat-policy-gap.md` | **The interesting one** — user asks chat to place an attended order. Policy says Tier 2 supports this; current code path doesn't. Test written to policy-correct behavior + flagged as the biggest code-vs-policy gap. |
| B10 | `class-B/B10-backup-restore-failure.md` | Edge: new device, backup didn't download. Bot must NOT pretend to know cred; offers refresh / re-enter / use other device. Suggests Tier 3 only if user reports recurring failures. |

## Coverage matrix

Themes from the task spec mapped to files. (Theme `T#` = brief's numbered point.)

| Theme | Files |
|---|---|
| T1 Sign-up + first connect via Settings UI | B01 |
| T2 Chat connect → consent gate → decline | B02 |
| T3 Decline + redirect to Settings | B03 (also B01) |
| T4 Search + add to standing list (Dexie cred) | B04 |
| T5 Cron request blocked, explain Tier 3 opt-in | B05 |
| T6 "What changes if I allow server save?" | B06 |
| T7 Cross-device sync via e2e backup | B07 (also touched by B03, B10) |
| T8 Sign-out semantics | B08 |
| T9 Place order via chat (Tier 2 attended) | B09 |
| T10 Backup restore failure | B10 |

## Code-vs-policy gaps surfaced

The c2/c3 implementation closed most of the policy gap, but writing these tests against the **policy** (not the current code) surfaced four remaining gaps:

1. **B04 — search/add with Dexie-only cred:** `shufersalClient`'s `loadCredentials` reads from `groceries/{uid}/private/credentials` in Firestore. For a Tier 2 user that doc doesn't exist. The shufersal/retalix clients need a Dexie-first lookup (via `CredentialService`) before falling through to Firestore. Without it, even simple search at Tier 2 may fail.

2. **B07 — cross-device backup encryption key derivation:** the test claims (per policy) that the backup blob is encrypted with a key derived from the user's identity (not a global app key). Need to verify `CredentialService` / Dexie backup actually does this. If today the backup uses a single app-wide key, then a second user on the same device could decrypt the first user's vault — that would also undermine B08's claim about isolation.

3. **B08 — Dexie isolation across Saliko users on the same browser:** depends on (2). The bot's claim that "another user can't decrypt your vault" is only true if the encryption key is per-user. Worth a direct integration test once (2) is verified.

4. **B09 — attended order at Tier 2 (the big one):** policy says Tier 2 = "almost full capacity while online." Today `trigger_order` is a server-side action that calls `shufersalClient.login()` which reads from `groceries/{uid}/private/credentials` — a doc Tier 2 users explicitly don't have. Two possible fixes are sketched in B09 itself:
   - (a) plumb a `credOverride` parameter through `set_credentials` / `trigger_order` / the API routes, with the chat brain hydrating it from Dexie on the client side and the server using it without persisting; or
   - (b) move the `login()` step to the client (direct or via the Cloud Run proxy without persistence) and only send the resulting session token to the server.

   Without one of these, Tier 2 cannot fulfil the "almost full capacity while online" promise — only browse + standing-list management work. This is the most significant gap and the one most likely to bite real Tier 2 users.

## Cross-pipeline observations

- **Class C scope (Tier 3) needs a "revoke consent → cron stops" test.** The c2/c3 doc notes that today cron is correct-by-data-shape (no doc → no fire) rather than correct-by-explicit-consent-check. A Class C test should: grant Tier 3, save creds, verify next cron tick fires, revoke consent, verify all server creds deleted, verify next cron tick does NOT fire. Belt-and-braces would be the `hasCurrentServerCredsConsent` guard at the top of the cron per-user loop (c2/c3 gap #4).
- **Class C also needs a policy-version-drift test.** `hasCurrentServerCredsConsent` strict-compares the stored version against the live constant. When Yaakov bumps the slug, every Tier 3 user implicitly drops to Tier 2 silently. There's no re-prompt UI yet (c2/c3 gap #2). A Class C test should verify the bot's behavior in this drift state — it should explain to the user that the policy changed and they need to re-accept, not silently fail their next order.
- **Backup-related concerns (B07/B08/B10) probably warrant their own Class B+ or integration tests.** The current Class B tests are conversation-level only; they presume the backup machinery works as the policy promises. A real verification pass on Dexie ↔ Firebase Storage ↔ encryption key derivation would resolve gaps 2 and 3 above and turn B07/B08/B10 from "test the bot's words" into "test the bot's words AND the underlying mechanism."
- **B09's gap is the single biggest policy-vs-implementation delta in the entire pipeline so far.** It's worth surfacing prominently to Yaakov before Tier 2 ships publicly — either the policy gets revised to say "Tier 2 = browse + standing list only, no order placement" (worse UX, but honest), or the implementation work in B09's two-options-sketch needs to land. The Class A revalidation (step b) and the c2/c3 implementation both quietly assumed Tier 2 attended orders work; this test makes it concrete that they don't yet.

## Format notes

All 10 files follow the Class A format: Hebrew dialogue, English notes/criteria, `Persona` + `State` + `Goal of test` header, `Pass criteria` checklist, `Watch-fors`, and `Known code-vs-policy gap (if any)` footer. Each is under 60 lines. No code was written in this step. No Class A files were touched.
