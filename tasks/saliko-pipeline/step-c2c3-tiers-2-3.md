# Step (c2 + c3) — Tier 2 + Tier 3 for logged-in users

**Status:** code-complete; pending one env-var Yaakov needs to generate + browser smoke test
**Date:** 2026-05-16
**Policy version implemented against:** `2026-05-16-saliko-privacy-v1`
**Policy SoT:** `app/saliko/privacy/privacyContent.ts`

## What this step delivers

A logged-in Saliko user now has a real choice between Tier 2 and Tier 3, with that choice enforced everywhere creds touch the server.

- **Tier 2 (default for new users):** credential lives only in the user's browser (Dexie, via `credentialStore`). E2E-encrypted backup blob syncs across devices. The server never has a usable copy. Cron is silent for these users.
- **Tier 3 (opt-in):** in addition to Dexie, an encrypted ciphertext copy lives on the server at `groceries/{uid}/private/credentials` (Shufersal) and `groceries/{uid}/stores/{retalixStoreId}/private/credentials` (each Rexail chain). Server decrypts at login time via an env-var key (KMS migration is a separate, focused step later — see TODO in `credEncryption.ts`).

Architectural model: **Dexie is the master for all logged-in user store credentials.** The Firestore copy is a derived ciphertext that exists ONLY for Tier 3. Granting consent + saving a cred in the UI writes Dexie first, then pushes to the server. Revoking consent deletes the server copies; Dexie stays.

## Files changed

| File | Change |
|---|---|
| `app/services/security/credEncryption.ts` | **NEW.** AES-256-GCM helper. `encryptCred(plaintext)` → `ivB64:tagB64:cipherB64`. `decryptCred(ct)` → plaintext. `looksEncrypted(v)` sniff for the rollout window. Key from `SALIKO_CREDS_ENCRYPTION_KEY` env var, 32 bytes base64. TODO marker for the future KMS swap. |
| `app/services/consentService.ts` | **NEW.** `getServerCredsConsent(uid)`, `hasCurrentServerCredsConsent(uid)`, `grantServerCredsConsent(uid)`, `revokeServerCredsConsent(uid)`. Revoke also enumerates `groceries/{uid}/stores/*` and deletes every server-side cred copy. Exports `NoTier3ConsentError` sentinel. |
| `app/services/grocery/shufersalClient.ts` | `loadCredentials` now decrypts on read (with `looksEncrypted` sniff for rollout safety). `saveCredentials` pre-flights `hasCurrentServerCredsConsent` and throws `NoTier3ConsentError` if absent; on success, encrypts both email + password. |
| `app/services/grocery/retalixClient.ts` | Same split inside `readCredDoc`: anon branch untouched (TTL-bounded plaintext), logged-in branch decrypts on read. `saveRetalixCredentials` for logged-in uids now pre-flights consent + encrypts phone. `verifyOtp` for logged-in uids encrypts the token before writing. Anon branch from c1 is preserved byte-for-byte. |
| `app/services/telegram/actionExecutor.ts` | `set_credentials` handler accepts new optional `acceptServerCredsConsent: true` flag, calls `grantServerCredsConsent` first, then `saveCredentials`. Catches `NoTier3ConsentError` and returns a clear Hebrew explanation. `set_otp_phone` does the same for logged-in users (anon path untouched). New `grant_server_creds_consent` action for standalone "I agree" turns. |
| `app/services/telegram/actionDeclarations.ts` | `set_credentials` and `set_otp_phone` declarations updated with `acceptServerCredsConsent` boolean. New `grant_server_creds_consent` declaration. Descriptions explain the Tier-3 gate to the LLM. |
| `app/services/telegram/chatProcessor.ts` | System prompt grew a "שלוש רמות פרטיות" section explaining all three tiers using the canonical labels + the honest-about-decrypt disclaimer. New "מתי לבקש אישור Tier 3" block tells the LLM exactly when to walk a user through consent. `UserContext.serverCredsConsent` field added. Context block surfaces consent state to the LLM. |
| `app/services/chatBrain.ts` | `buildContext` loads consent via `getServerCredsConsent` and threads it into the `UserContext` passed to `chatProcessor`. |
| `app/components/settings/ExternalServicesTab.tsx` | New Saliko-only Tier-3 toggle row at the top of the tab. Reads `/api/consent/server-creds` GET on mount; POST to grant, DELETE to revoke (with `YesNoModal` confirmation explaining what gets deleted). When Tier-3 is on and the user saves a Shufersal credential, the upsert also calls the new `/api/credentials/shufersal` PUT to mirror it to the encrypted server-side store. Failure to sync surfaces as a non-fatal warning — Dexie remains the master. |
| `app/api/consent/server-creds/route.ts` | **NEW.** GET / POST / DELETE handlers, all `requireAuth`-gated, all 404 on Aglamazo variant. POST records consent at the current policy version. DELETE delegates to `revokeServerCredsConsent` (deletes Shufersal + every per-store Rexail cred, then clears the consent flag). |
| `app/api/credentials/shufersal/route.ts` | **NEW.** PUT body `{email, password}` → `saveCredentials`. Returns 412 with `code: 'NO_TIER3_CONSENT'` when consent isn't on file, so the UI can re-prompt cleanly. |
| `.env.example` | Added `SALIKO_CREDS_ENCRYPTION_KEY` with the `openssl rand -base64 32` instruction. |

## Action still required by Yaakov

Generate and set the encryption key. **One-time, per environment.**

```bash
openssl rand -base64 32
```

Put the resulting string into:
- `.env.local` for local dev (`SALIKO_CREDS_ENCRYPTION_KEY=<output>`)
- The Saliko Vercel project's environment variables (Production + Preview + Development) — use `printf` to avoid the trailing-newline trap (see `~/.claude/CLAUDE.md`):
  ```bash
  printf '%s' "<the base64 string>" | vercel env add SALIKO_CREDS_ENCRYPTION_KEY production
  ```

**Important:** if the key is ever rotated, every existing ciphertext doc becomes undecryptable. Rotation is a real migration (decrypt-with-old → encrypt-with-new) — out of scope for this step. The current key should be backed up to the same place as other production secrets.

Until the key is set, granting consent will succeed but the first attempt to save a credential will throw with a clear `SALIKO_CREDS_ENCRYPTION_KEY not set` message. The Dexie-only Tier 2 flow doesn't depend on the key.

## New Firestore paths

- `users/{uid}.serverCredsConsent = { acceptedAt: ISO, policyVersion: '2026-05-16-saliko-privacy-v1' }` — absence = no consent.
- `groceries/{uid}/private/credentials` (Shufersal): now stores `{ email: <ciphertext>, password: <ciphertext>, verified: boolean }`. Pre-Tier-3 plaintext docs are auto-detected by `looksEncrypted` and pass through during the rollout window.
- `groceries/{uid}/stores/{retalixStoreId}/private/credentials` (each Rexail chain): now `{ phone: <ciphertext>, token: <ciphertext|null>, config: <plaintext>, verified, otpPending }`. `config` is non-user-specific chain metadata so it's not encrypted.

Ciphertext format: `ivB64:tagB64:payloadB64` — three base64 strings joined by `:`. AES-256-GCM with a 96-bit IV per call.

## New API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/consent/server-creds` | required | Returns `{ success, consent: { acceptedAt, policyVersion } \| null }`. |
| POST | `/api/consent/server-creds` | required | Grants consent (pinned to current policy version). Idempotent. |
| DELETE | `/api/consent/server-creds` | required | Revokes consent **and** deletes every server-side credential copy under `groceries/{uid}` for this user. Returns `{ success, deleted: [paths], failed: [] }`. |
| PUT | `/api/credentials/shufersal` | required | Body `{ email, password }` → `saveCredentials`. 412 + `code: NO_TIER3_CONSENT` if not consented. |

All four return 404 on the Aglamazo variant.

## Chat-side flow when a logged-in user without consent tries to connect a store

Paraphrased:

1. User: "התחבר לי לשופרסל, האימייל שלי X, הסיסמה Y"
2. LLM (sees `Tier 3 consent: NOT granted` in context): walks the user through the choice in one short message — "כדי שאוכל לפתוח לך הזמנות אוטומטיות גם כשאתה לא מחובר, אני צריך לשמור את הסיסמה מוצפנת בשרת. צוות עם גישה לפרודקשן יכול עקרונית לפענח. אישור?"
3. User: "כן, מאשר"
4. LLM calls `set_credentials({ email, password, acceptServerCredsConsent: true })` — handler grants consent first, then `saveCredentials` succeeds.

Alternative path: if the LLM doesn't pre-empt and just calls `set_credentials` without the flag, the handler catches `NoTier3ConsentError` and returns a Hebrew explanation that the LLM relays. User says "אני מאשר" → LLM calls `grant_server_creds_consent` then retries the original call. Both shapes work; the umbrella flag is preferred (one round-trip).

For a user who *doesn't* want Tier 3, the LLM should explain that Tier 2 works fully while they're online and offer the Retalix OTP path for chains where it's available — only the unattended overnight cron is blocked.

## Settings UI placement

Top of "חיבורים חיצוניים" tab (Settings → Saliko variant only). Box with the toggle button on the right, label + 1-line blurb from `SALIKO_PRIVACY_TIER_BLURBS['logged-in-with-server-creds']` on the left. Background goes green when granted. Button text flips between "אשר Tier 3" and "בטל אישור". Revoke triggers a `YesNoModal` that explains what gets deleted (server-side ciphertext copies, including across all stores) and what stays (Dexie copies in the browser).

Below the toggle, the existing Dexie-vault rows + editor work as before. The only change to the save flow: when service is `shufersal` AND Tier-3 is granted, the upsert also fires a PUT to `/api/credentials/shufersal`. A server-sync failure surfaces as a non-fatal warning above the rows — the Dexie write already succeeded.

## Gaps

1. **Retalix isn't on the Settings-UI server-sync path yet.** Today only `shufersal` is in `CredentialService`; the Settings tab can't even hold a Retalix credential since the auth shape is phone-only, no password. Retalix server-side encryption IS wired in `retalixClient.ts` + the chat-side `set_otp_phone` handler — the only piece that's intentionally not built is a UI control in `ExternalServicesTab` for "connect Rexail chain via phone." The chat flow is the canonical entry point for OTP today, which keeps this step focused. If Yaakov wants a UI-side Retalix connect later, the new `/api/credentials/{service}/route.ts` shape can extend to a `retalix` sibling without further server changes.
2. **Policy-version drift = no re-prompt yet.** `hasCurrentServerCredsConsent` strictly compares stored `policyVersion` against the live constant, so the moment Yaakov bumps the version slug, every Tier-3 user implicitly drops back to Tier 2 (their next cred-save will throw `NoTier3ConsentError`). That's the *safe* failure mode, but the UI doesn't yet surface "your consent is stale, please re-accept." TODO comment in `consentService.ts` flags it. Step (c4) or later can add a re-consent modal.
3. **Existing pre-Tier-3 plaintext docs.** Per the brief, Saliko isn't deployed yet so there are no plaintext credential docs in prod to worry about. The `looksEncrypted` sniff in both clients is defensive against any local dev / staging plaintext from before this step — it auto-passes plaintext through on read and the next save will re-write encrypted. No migration script needed.
4. **Cron itself doesn't yet check consent at the gate.** Today the cron paths assume "if a credential doc exists, use it." Since this step encrypts every new write and refuses to write without consent, the population of "user with cred doc on server" is by construction the Tier-3 population. So cron is correct by data shape, not by an explicit consent re-check. If you want belt+braces, add a `hasCurrentServerCredsConsent` check at the top of `app/api/grocery/cron/route.ts`'s per-user loop and skip silently for revoked users (whose creds we already deleted, so they'd fail at read anyway).

## Test plan (manual smoke, 5 bullets)

Run on `localhost:3100` with `NEXT_PUBLIC_PRODUCT=saliko` and `SALIKO_CREDS_ENCRYPTION_KEY` set in `.env.local`.

- **Tier 2 (decline consent):** sign in fresh. Open chat, type "תחבר לי לשופרסל, האימייל שלי X הסיסמה Y" without first granting consent. Expect the LLM to explain Tier 3 in one message and ask. Type "לא, אני מעדיף Tier 2." Expect the LLM to confirm and explain that cron won't fire but interactive use works. Verify Firestore: no `groceries/{uid}/private/credentials` doc exists. Verify Dexie isn't touched by this chat-only flow (Dexie path is Settings UI).
- **Tier 3 via chat (one-shot):** in the same session, type "תחבר לי לשופרסל, האימייל שלי X הסיסמה Y, ואני מאשר לשמור בשרת." Expect the LLM to fire `set_credentials({ ..., acceptServerCredsConsent: true })`. Verify `users/{uid}.serverCredsConsent` now exists. Verify `groceries/{uid}/private/credentials` exists with `email` + `password` looking like `ivB64:tagB64:cipherB64` (NOT plaintext — should not contain `@` or the password chars).
- **Tier 3 via Settings UI:** sign in as a different test account. Settings → חיבורים חיצוניים → click "אשר Tier 3". Verify the box turns green and `users/{uid}.serverCredsConsent` exists. Now add a Shufersal credential through the normal "הוסף פרטי גישה" UI. Verify both: (a) Dexie has the row (open in DevTools → IndexedDB → financeDB → credentials), (b) Firestore has the encrypted doc.
- **Revoke (3 → 2):** with that same account, click "בטל אישור" → confirm in the modal. Verify Firestore: `users/{uid}.serverCredsConsent` is gone AND `groceries/{uid}/private/credentials` is gone. Verify Dexie: the credential row is STILL there (UI should still show it). Try to save a new credential — server sync should now silently no-op (no PUT call fires because `tier3Granted` is false). Re-grant consent: re-saving the same cred should re-create the Firestore doc.
- **Anon Tier 1 still works:** open an incognito window (no sign-in). Hit Saliko, open chat, run the Tier 1 OTP flow from c1 (phone → SMS → verify → one-shot order from a Rexail chain). Verify the anon path: `anonSessions/{sessionId}` doc exists with PLAINTEXT phone + token (anon branch was preserved). No `users/{uid}` doc was touched. No `groceries/anon:{sessionId}/private/credentials` was created.
