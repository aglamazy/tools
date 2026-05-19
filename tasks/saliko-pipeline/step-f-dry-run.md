# Step (f) — Dry-run mode for the test pipeline

**Status:** code-complete; pending env-var flip + server restart
**Date:** 2026-05-16

## What changed

Both grocery clients already gate every state-mutating order POST on `options.dryRun`. Added a global env-var override so the entire test run can short-circuit without per-test plumbing.

- `app/services/grocery/retalixClient.ts` (line ~580): `if (options.dryRun || process.env.SALIKO_DRY_RUN === 'true')`
- `app/services/grocery/shufersalClient.ts` (line ~678): same pattern
- `.env.example`: added `SALIKO_DRY_RUN=` block with the why

## What dry-run does and doesn't block

Blocks:
- Final order commit on both chains (the only state-mutating call from our side)

Does NOT block:
- Catalog reads / search
- Slot lookup
- Rexail `apply-for-authentication` → **real SMS still gets sent** (Rexail's API, not ours; we can't dry-run SMS without breaking Tier 1 testing)
- OTP verify → server-side cred state updates (verified, token cached)
- Cart drafts (Rexail `saveDrafts` runs — it's a no-op until the order is committed)

For the test pipeline this is the right level: every "did the bot try to place an order?" question is answered by the dry-run short-circuit log line, and OTP-driven Tier-1 flows still produce real SMSes so Yaakov can complete the conversation himself.

## How to enable

In the shell where the Saliko dev server runs:

```bash
export SALIKO_DRY_RUN=true
~/develop/ubuntu/utils/run.sh ~/develop/Aglamaz/Aglamazo saliko
```

Or add to `.env.saliko` (gitignored) and restart:

```
SALIKO_DRY_RUN=true
```

Verify by checking server log on the next attempted order — should see the dry-run branch return without hitting `commitCheckout` / `prepareOrder`.

## To disable

Unset the env var and restart. No state to clean.

## Test plan

1. Start Saliko with `SALIKO_DRY_RUN=true`.
2. As anon: do the Tier-1 OTP→verify→`trigger_order` flow. The bot should return a dryRun result (existing UX wording — confirm it's clear to the user).
3. As Tier-3 logged-in: connect Shufersal with consent, attempt a `trigger_order`. Same: dry-run result, no real order placed.
4. Search and slot lookup should still work normally.

## Verification

- `npx tsc --noEmit` clean (no new errors).
- Two pre-existing lint errors only.

## Addendum (2026-05-17) — interaction with the c1 redo

The c1 redo (sessionStorage-only anon Tier-1) reworked how anon credentials
travel through `retalixClient.ts`: anon callers no longer have a Firestore
cred doc — they hit `sendOtpWithCreds` / `verifyOtpWithCreds` /
`checkoutWithCreds` instead of the Firestore-backed `sendOtp` / `verifyOtp`
/ `checkout`. **`SALIKO_DRY_RUN` is unaffected.**

The dry-run gate lives inside the shared `checkout` function (line ~605):

```ts
if (options.dryRun || process.env.SALIKO_DRY_RUN === 'true') {
  return { success: false, dryRun: true, deliveryWindow }
}
```

Both code paths converge on `checkout`:
- **Logged-in:** `plugin.checkout` → `checkout(uid, storeId, items, options)`.
- **Anon Tier-1:** `checkoutWithCreds(uid, storeId, items, options, creds)`
  → `checkout(uid, storeId, items, options, { token, config })`.

The cred argument only changes how `getToken` resolves — it does not bypass
the dry-run short-circuit, which fires before any state-mutating Rexail
call (`prepareOrder`, `getPaymentMethod`, `place-order`).

For the test pipeline this means:
- The anon Tier-1 `trigger_order` flow, when run with `SALIKO_DRY_RUN=true`,
  returns `{ success: false, dryRun: true, deliveryWindow }` from
  `checkoutWithCreds`. The executor surfaces it as a dry-run Hebrew message
  to the user and **does not** set `orderedOnce: true` on the anon cred (no
  real order placed → the one-shot lock should not engage).
- The logged-in path behaves identically to before.
