# Step (c1) — Tier 1 anonymous one-shot OTP order (redo, no-server-persistence)

**Status:** code-complete; manual browser smoke test pending
**Date:** 2026-05-17
**Policy version implemented against:** `2026-05-16-saliko-privacy-v1`
**Policy source of truth:** `app/saliko/privacy/privacyContent.ts` (`SALIKO_PRIVACY_TIERS.anonymous`)

## Background — why the first c1 was redone

The first c1 cut (2026-05-16) stored anonymous OTP credentials in
`anonSessions/{sessionId}` Firestore docs with a 2-hour TTL. The user pushed
back: Tier 1's policy line — "ברגע ההתנתקות (או בסגירת הטאב, או כשהסשן פג).
שום פרט התחברות לא נשמר אחרי הסשן" — means **nothing on our server, ever**,
not "short-lived on our server with TTL." A 2-hour DB window is still our
data, our backup tape, our subpoena exposure surface. The redo strips every
Firestore touch from the anon path.

## The new model — sessionStorage-only, server is request-stateless

Anonymous Tier-1 credential state lives **only** in the browser's
`sessionStorage` under key `saliko.anonStoreCreds`. The client:

1. Reads the key before every `POST /api/chat`.
2. Sends it in the request body.
3. Writes back whatever the server returns on the response.

The server uses the cred in-memory for the duration of one HTTP request and
forgets. No Firestore reads, no Firestore writes, no in-memory caches that
outlive the request. The browser tab closes → state gone, full stop.

### State shape

```ts
type AnonStoreCreds = {
  storeId: string            // e.g. 'retalix', 'rexail_basra'
  phone: string              // captured at set_otp_phone
  token?: string             // set by verify_otp on success
  orderedOnce?: boolean      // set after a successful Tier-1 trigger_order
}
```

`orderedOnce` enforces the policy's one-shot rule: the server sets it to
`true` after a successful `trigger_order` and the next anon `trigger_order`
attempt is refused with a Hebrew message pointing the user at registration.

## Wire contract

### Request — `POST /api/chat`

```jsonc
{
  "message": "תאמת את הקוד 1234",
  "history": [...],                              // existing anon-context relay
  "anonStoreCreds": {                            // NEW — optional
    "storeId": "retalix",
    "phone": "0501234567",
    "token": "abc..."
  }
}
```

`anonStoreCreds` is validated server-side as untrusted input (see
`parseAnonStoreCreds` in `app/api/chat/route.ts`). Logged-in users sending
this field have it ignored — only `anon:`-prefixed uids honor it.

### Response — `POST /api/chat`

```jsonc
{
  "success": true,
  "reply": "...",
  "anonStoreCreds": {                            // present ONLY when changed
    "storeId": "retalix",
    "phone": "0501234567",
    "token": "abc...",
    "orderedOnce": true
  }
}
```

Semantics:
- **Field absent**: no change — client keeps its current sessionStorage value.
- **Field present, non-null**: replace sessionStorage with this.
- **Field present, `null`**: wipe sessionStorage (e.g. after error / reset).

## Files changed in the redo

| File | Change |
|---|---|
| `app/services/grocery/retalixClient.ts` | **Removed** the `anon:` branch from `credRef` and `readCredDoc`. **Removed** `isAnonUid`, `anonSessionId`, `anonExpiresAt`, `ANON_TTL_MS` constants. **Removed** the anon write inside `saveRetalixCredentials` and the anon TTL refresh inside `sendOtp`/`verifyOtp`. **Added** an in-args `creds` parameter (optional) to the internal `getToken`/`getSlots`/`saveDrafts`/`prepareOrder`/`getPaymentMethod`/`checkout` chain — when present it bypasses the Firestore cred read. **Added** module-level exports `sendOtpWithCreds`, `verifyOtpWithCreds`, `checkoutWithCreds`, `getRetalixConfigForStore`, and the `AnonRetalixCreds` interface. Comment block at the top of the credentials section explicitly rejects re-introducing an `anon:` branch into `credRef`. |
| `app/services/telegram/actionExecutor.ts` | New `AnonStoreCreds` interface exported on the module. `executeActions` + `executeOne` now take an optional `inboundAnonCreds` and the result type carries an `anonStoreCreds` field that's set only when an action mutated it. **Rewrote** `set_otp_phone`, `verify_otp`, and `trigger_order` to branch on `uid.startsWith('anon:')` — anon callers route to `sendOtpWithCreds` / `verifyOtpWithCreds` / `checkoutWithCreds` (no Firestore), and the response carries the updated cred for the client. Anon `trigger_order` enforces `orderedOnce` and skips the safety-gate + finalize Firestore writes (those are cron-driven concerns, not relevant to a one-shot). Logged-in branches are unchanged. The STORE_ACTIONS auth gate now distinguishes anon (checks `inboundAnonCreds`) from logged-in (Firestore `isAuthenticated`). |
| `app/services/chatBrain.ts` | `ChatBrainInput.anonStoreCreds` + `ChatBrainResult.anonStoreCreds` plumbing. Carries the cred across agentic-loop iterations and surfaces the latest value when any tool mutated it. |
| `app/api/chat/route.ts` | Accepts `anonStoreCreds` on the request body, validates with the new `parseAnonStoreCreds` narrowing helper, threads through `processChatMessage`. Echoes the field on the response only when changed. Logged-in callers' `anonStoreCreds` is ignored. |
| `app/components/AppChat.tsx` | New `readAnonStoreCreds`/`writeAnonStoreCreds` helpers backed by `sessionStorage['saliko.anonStoreCreds']`. Sends current state on every anon POST; writes back the server's response. Wipes the key on chat-switch and on sign-in (defensive — logged-in users don't need it). |
| `app/services/telegram/chatProcessor.ts` | System-prompt Tier-1 wording updated. The "wipe" framing is now literal ("חיים בלעדית ב-sessionStorage של הדפדפן ונמחקים מיידית בסגירת הטאב") not a 2h TTL. New explicit note that a second anon `trigger_order` is refused. |

## What the redo removed (cleanup notes)

- **Firestore collection `anonSessions`** — the old c1's home for anon creds.
  No longer written or read anywhere in the codebase. The Firestore TTL
  policy step Yaakov was asked to run (`gcloud firestore fields ttls update
  expiresAt --collection-group=anonSessions --enable-ttl`) is **no longer
  needed** — if any test docs were created during the first c1 they can be
  deleted manually, but the system never touches the collection again.
- **`isAnonUid` / `anonSessionId` / `anonExpiresAt` / `ANON_TTL_MS`** —
  removed from `retalixClient.ts`. The `ANON_PREFIX` constant is still used
  in `actionExecutor.ts` and `chatBrain.ts` for uid prefix-checking, but
  retalixClient no longer needs to know about it.
- **`addActiveStore` skip for anon in `verify_otp`** — used to be a guard
  against writing `groceries/anon:{sessionId}/stores/_meta`. The anon branch
  now takes a completely separate path that doesn't call `addActiveStore` at
  all, so the guard is gone.
- **No seed scripts mentioned `anonSessions`** (verified via grep) — no doc
  cleanup required there.
- **No tests referenced `anonSessions`** (saliko-tests/class-A/B/C grep) —
  the Tier-1 test bullets that exist talk about behavior, not the Firestore
  layout, so they pass for the cleaner reason now.

## Logged-in (Tier 2+3) paths

**Untouched.** All `c2c3` work (Dexie-master, encrypted Firestore on
consent, `NoTier3ConsentError` flow) still flows through the same
`saveRetalixCredentials` → `credRef` → encrypted Firestore writes for
logged-in uids. The diff in `retalixClient.ts` is purely removing the
`isAnonUid(uid) ? ... : ...` branches and adding the parallel `*WithCreds`
helpers for anon callers; nothing inside the logged-in branch moved.

## Constraints satisfied

- No new dependencies.
- No new Firestore collections (in fact removed one: `anonSessions`).
- `npx tsc --noEmit` clean.
- `npm run lint` clean except the two known pre-existing errors
  (`gmail/page.tsx` >850 lines, `stores/registry.ts` inline table list).

## Trade-off accepted: shopping-list items still go to `groceries/anon:{...}`

When an anon user adds items via `search_product` → select, the executor
calls `addStorePendingItems(uid, storeId, [...])` which writes to
`groceries/anon:{sessionId}/...`. The redo brief explicitly scoped the
"nothing on our server" cleanup to **credentials**, not to the cart-staging
data. Items are not credentials and pose a different threat model (no auth
material, no token, can't impersonate anyone). They also can't easily be
relocated to sessionStorage without rewriting `groceryStoreMulti` end-to-end.

Flagged as a follow-up: a fully consistent Tier-1 would put pending items in
sessionStorage too. Not in this step — kept explicit so it isn't forgotten.

## Test plan (manual smoke, 4 bullets)

Run on `localhost:3100` with `NEXT_PUBLIC_PRODUCT=saliko`.

- **No-Firestore guarantee:** open Saliko in an incognito window. Don't sign
  in. Open chat, run the OTP flow: "אני רוצה להזמין ממקור השפע" → bot asks
  for phone → send phone → verify SMS code. After each step, open Firestore
  console and confirm `anonSessions/{anything}` doesn't exist and no doc was
  created under `groceries/anon:{...}` for the cred. Confirm in DevTools →
  Application → Session Storage that `saliko.anonStoreCreds` is present and
  contains `{storeId, phone, token}`.
- **One-shot enforcement:** in that same session, complete a `trigger_order`
  (4-5 items to clear the size floor). After success, the
  `saliko.anonStoreCreds` value should have `orderedOnce: true`. Now ask the
  bot to open another order — expect the refusal Hebrew message pointing at
  registration. Verify in DevTools the value is still
  `orderedOnce: true` (didn't get clobbered).
- **Tab-close wipe:** close the tab without doing anything else. Reopen
  Saliko in a new tab. Open chat, ask the bot what's connected — expect
  nothing-connected, no leftover. (No sessionStorage carries between tabs.)
- **Switch chats wipes cred:** within one tab, complete OTP for a chain
  (don't order yet). Switch to a new chat via the dropdown. Verify
  `saliko.anonStoreCreds` is gone from sessionStorage and the bot treats the
  chain as not-connected.

## Notes for downstream test pipeline

The `tasks/saliko-tests/class-A/B/C` test runners that exercise Tier-1
behavior should now inspect `saliko.anonStoreCreds` in sessionStorage (not
Firestore) when they want to verify the post-OTP state. They should also
assert that `anonSessions` does NOT exist in Firestore after the run.
