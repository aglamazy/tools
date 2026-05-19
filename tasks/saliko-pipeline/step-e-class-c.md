# Step (e) — Class C test sessions (Tier 3: logged-in, with explicit server-creds consent)

**Status:** complete (markdown only — no code)
**Date:** 2026-05-16
**Policy SoT:** `app/saliko/privacy/privacyContent.ts` → `SALIKO_PRIVACY_TIERS['logged-in-with-server-creds']`
**Persona for all 10 tests:** signed in via Google sign-in, granted (or about to grant / revoking) explicit Tier 3 consent for encrypted server-side credential storage. Full UX including unattended cron orders. **The bot must NOT soft-pedal the encryption-at-rest disclaimer** — server personnel with prod access can decrypt; the policy says so, and the bot repeats it honestly.

## The 10 files

| # | File | One-line summary |
|---|---|---|
| C01 | `class-C/C01-chat-grant-tier3-first-time.md` | First-time chat-driven Tier 3 grant; bot presents Tier 2 vs Tier 3 fairly; user grants → `set_credentials({ ..., acceptServerCredsConsent: true })` in one round-trip. |
| C02 | `class-C/C02-settings-toggle-then-save-cred.md` | Settings UI grant + add Shufersal cred → dual-write (Dexie master, then PUT `/api/credentials/shufersal`). Bot explains the dual-write and the failure mode. |
| C03 | `class-C/C03-upgrade-from-tier2-to-tier3.md` | Existing Tier 2 user toggles Tier 3 ON; bot explains that grant alone doesn't sync existing Dexie creds — user must re-save to push to server. Flags UX gap (no auto-sync prompt). |
| C04 | `class-C/C04-cron-fired-overnight-success.md` | User discovers a successful cron-fired order in the morning; bot explains how Tier 3 enabled it, voluntarily restates the decrypt trade-off, commits on user confirmation. |
| C05 | `class-C/C05-what-changes-if-i-stay-here.md` | "What does long-term Tier 3 mean for me?" — bot quotes the honest disclaimer in full, explains the technical reason cron requires server-side decrypt, offers Tier 2 as alternative. **CRITICAL no-soft-pedal test.** |
| C06 | `class-C/C06-revoke-consent-via-settings.md` | Tier 3 → Tier 2 via Settings DELETE; bot describes what got deleted (consent + all server creds across stores), what stayed (Dexie + schedule), and the implications. |
| C07 | `class-C/C07-revoke-then-try-schedule-cron.md` | Just-revoked user asks to set cron schedule; bot detects no-consent state, distinguishes attended Tier 2 orders from unattended Tier 3 cron, offers Friday reminder as Tier-2-compatible alternative. |
| C08 | `class-C/C08-encryption-disclaimer-challenged.md` | User pushes back on the disclaimer ("but it's encrypted!"); bot **holds the line**, explains the at-rest-vs-operator distinction without retreating to "we can't see it." **CRITICAL no-soft-pedal test.** |
| C09 | `class-C/C09-account-deletion-full-wipe.md` | User requests full account deletion; bot describes the 30-day policy, lists everything that gets wiped (server + Dexie + backup), falls back to email + "תיגש להגדרות" when UI button likely missing. Flags absent feature. |
| C10 | `class-C/C10-encryption-key-rotation-cron-fail.md` | Edge: `SALIKO_CREDS_ENCRYPTION_KEY` rotated without migration → cron decrypt fails. Bot distinguishes "no cred" from "decrypt failed", offers re-save as fix, flags as infra incident. |

## Coverage matrix

Themes from the task spec mapped to files. (Theme `T#` = brief's numbered point.)

| Theme | Files |
|---|---|
| T1 First-time chat-driven Tier 3 grant | C01 |
| T2 Settings UI toggle + add cred (dual-write) | C02 |
| T3 Tier 2 → Tier 3 upgrade via Settings | C03 |
| T4 Cron-driven weekly re-order fires successfully | C04 |
| T5 "What changes if I keep using this?" | C05 |
| T6 Revoke consent Tier 3 → Tier 2 | C06 |
| T7 Revoke + immediately try cron | C07 |
| T8 Encryption disclaimer challenged | C08 |
| T9 Account deletion / full wipe | C09 |
| T10 Edge: encryption key rotation / decrypt failure | C10 |

Cross-cuts intentionally hit by multiple tests:
- **Honest disclaimer (no "we can't see"):** C01, C04, C05, C08 — explicitly forbidden in watch-fors.
- **Dexie-as-master architecture:** C02, C03, C06, C10 — the bot must consistently treat Dexie as authoritative and the server copy as derived.
- **No silent failure:** C04 (cron success surfaced), C07 (cron-won't-fire surfaced), C10 (decrypt-fail surfaced) — silent success/failure is the anti-pattern.

## Code-vs-policy gaps surfaced (the "what to fix after dry-run testing" list)

Writing these tests against the **policy** (not just current code) surfaced six gaps. Roughly ordered by severity:

1. **C09 — Full account deletion not implemented in UI/API.** Policy promises "מחיקה מלאה דרך ההגדרות או באימייל... עד 30 יום". Today the only revoke is Tier-3-consent revoke. Need: (a) "מחיקת חשבון" button in Settings (own tab or appended), (b) `/api/account/delete` route that wipes `users/{uid}`, all `groceries/{uid}/**`, Firebase Storage backup, privacy/T&C records; (c) `privacy@saliko.co.il` mailbox actually monitored; (d) backups-overwritten-within-30-days documentation or job. **Biggest policy-vs-implementation delta in Class C.**

2. **C10 — Encryption-key rotation has no migration path.** c2/c3 explicitly punted; if `SALIKO_CREDS_ENCRYPTION_KEY` ever changes, every existing ciphertext doc becomes undecryptable. Need: (a) runbook for "we rotated without migration — who's affected, how to notify", (b) `decryptCred` failure path that logs loudly (Healthchecks.io alert or Sentry, not silent null), (c) cron loop should distinguish "no doc" from "doc exists but decrypt failed" and react differently.

3. **C06/C07 — Schedule not cleaned on revoke + no consent gate at cron loop.** `revokeServerCredsConsent` deletes creds but leaves `groceries/{uid}/schedule` alive. The schedule then triggers cron runs that fail silently (no cred to load). Need: (a) `YesNoModal` checkbox "מחק גם את לוח הזמנים?" defaulting off, (b) explicit `hasCurrentServerCredsConsent` check at the top of `app/api/grocery/cron/route.ts`'s per-user loop with skip+log on revoked users (the c2/c3 gap #4 belt-and-braces fix), (c) `set_schedule` handler in Tier 2 should either refuse or return "saved but won't fire without Tier 3" warning.

4. **C04 — Cron audit log missing.** Policy promises "ועם תיעוד הגישה" for staff access, but it's not clear cron itself logs each run per-uid. Verify `app/api/grocery/cron/route.ts` writes a log entry per user invocation. Separately, verify there's any audit log for staff opening prod credentials at all — if not, policy promises something the system doesn't keep.

5. **C03 — No auto-sync prompt on Tier 3 grant.** Pure UX gap, not policy violation. When user toggles Tier 3 ON in Settings and Dexie already has creds, the UI doesn't offer "you have 1 Dexie cred — sync to server now?". User has to re-open the vault editor and re-save. Worth a small follow-up.

6. **C02 — Tier 3 sync failure handling.** The c2/c3 doc says "failure to sync surfaces as a non-fatal warning" — verify this actually renders something visible (toast / inline message above the rows) and that the user has a way to retry just the sync without re-entering the cred.

Gaps from Class B that Class C reinforces:
- **B09's attended-Tier-2-order gap** is bypassed in Class C (Tier 3 has server creds so `loadCredentials` works), but it still matters: C07 explicitly contrasts attended Tier 2 (B09's territory) with unattended Tier 3 cron, so B09's fix unlocks C07's narrative.
- **B07/B08's backup-encryption-key-derivation question** is unchanged in Class C scope but worth re-verifying — Tier 3 users still rely on the same Dexie+backup machinery.

## Pre-execution observations (read before running A/B/C against the real MCP session)

Things I noticed while writing Class C that should be addressed BEFORE running the full A+B+C suite live:

1. **`SALIKO_CREDS_ENCRYPTION_KEY` must be set in `.env.local` first**, or C01/C02/C04 will fail at the encrypt step with `SALIKO_CREDS_ENCRYPTION_KEY not set` — that's a real bug to expose, but if Yaakov wants the tests to pass-pass-pass, set the key first. c2/c3 documents the `openssl rand -base64 32` step.

2. **Cron tests (C04, C07, C10) require either a real cron trigger or a way to invoke `app/api/grocery/cron/route.ts` manually with a fake "now"**. Without a manual-fire affordance, C04 in particular is hard to dry-run — the conversation assumes "yesterday at 21:00 the cron ran". Worth adding a dev-only `?force-uid=X&force-time=Y` query param, or running the route directly from a dev script with a uid.

3. **C09 will fail to find the "מחיקת חשבון" button** because it isn't built. The test is written to gracefully degrade ("תיגש להגדרות, יש שם" + email fallback), but if the bot is overconfident and asserts the button exists, mark it as a fail and flag gap #1.

4. **The cross-test consistency check most likely to expose a regression:** A03 (anon-context password-security) → B06 (Tier 2 explainer) → C05/C08 (Tier 3 honest disclaimer). All four ask variants of "what about my password" at different consent states. If the bot's wording drifts across them, the system prompt's "שלוש רמות פרטיות" section needs sharpening. **Run all four in one session if possible** to surface drift.

5. **C08 is the single most important Tier 3 test.** It's the explicit pushback case. If the bot folds and says "OK actually we can't see it" under pressure, the entire honesty stance of the policy is compromised — and the system prompt needs strengthening with a literal "User: but it's encrypted! → Saliko: encryption at-rest is not zero-knowledge..." example. **Treat C08 as gate before shipping Tier 3 publicly.**

6. **C01's umbrella-flag path vs alternative two-call path** (`grant_server_creds_consent` then `set_credentials`) — both shapes are valid per c2/c3. Test should mark either as pass but flag if the bot used the two-call path when the one-call path was available, since that's a small efficiency regression (extra round-trip + potential split-state if the second call fails).

7. **The schedule data model is shared between cron-relevant and reminder-relevant uses.** C07 distinguishes attended (Tier 2 reminder OK) from unattended (Tier 3 cron). Worth a sanity check that the schedule storage doesn't conflate them — e.g., a single `weeklyOrderTime` field that means "cron at" in Tier 3 and "remind me at" in Tier 2 is sloppy and will cause edge cases when users move between tiers. If it's one field doing both jobs, document the semantics; if it's two, verify both UI surfaces.

8. **No Class C test covers policy-version drift** (c2/c3 gap #2). I considered adding one and decided it would overlap C03/C06 awkwardly. **Recommendation:** when Yaakov is ready to bump `SALIKO_PRIVACY_VERSION`, add a one-off C11 (or fold into C05) testing the re-prompt UX — today the bot would silently drop a Tier 3 user back to Tier 2 with no re-consent flow. Not a Class C blocker but a real gap when the day comes.

## Format notes

All 10 files follow the Class A/B format: Hebrew dialogue, English notes/criteria, `Persona` + `State` + `Goal of test` header, `Pass criteria` checklist, `Watch-fors`, and `Known code-vs-policy gap (if any)` footer. Each is under ~60 lines. No code was written in this step. No Class A or B files were touched. The policy file (`app/saliko/privacy/privacyContent.ts`) was read but not modified.
