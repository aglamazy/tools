# Stagger orchestrator + workers (grocery cron)

## Problem

Current `/api/grocery/cron/route.ts` runs every 2 hours, iterates all users × all stores sequentially inside one Vercel function, and does the full checkout (login → cart build → slot → commit → placeOrder → confirm) for each one. Issues observed / predicted:

- **Blast radius**: one slow Shufersal call or one stuck user eats the whole 60s cron budget; subsequent users don't run this cycle.
- **No retry visibility**: if an iteration fails silently, we learn on the next 2-hour tick at best.
- **Idempotency is implicit**: the 2026-04-21 11:01 single-line Shufersal order happened because a stale legacy doc re-triggered checkout; nothing on our side said "this order was already placed."
- **Scales poorly**: ~50 users × 2 stores × ~10s each = 1000s of work. Won't fit in 60s.

## Proposed architecture

```
Vercel cron (every 10min)
   │
   ├── Orchestrator: /api/grocery/cron/dispatch
   │     ├── Firestore query: eligible (uid, storeId) pairs right now
   │     │     • schedule.orderDay == today
   │     │     • orderCycle.status != 'active'
   │     │     • lockedAt absent OR older than 10min
   │     │     • staleError attempts < 3
   │     ├── For each match: fetch('/api/grocery/cron/worker', {uid, storeId}) — fire and forget
   │     └── Returns in <5s
   │
   └── Worker: /api/grocery/cron/worker  (maxDuration=60, 1 job per invocation)
         ├── Pre-flight safety:
         │     • cycleDate = resolve from schedule.orderDay
         │     • idempotencyKey = hash(uid, storeId, cycleDate)
         │     • if orderCycle.idempotencyKey == idempotencyKey and status=='active' → bail (already done)
         │     • if orderCycle.lockedAt within 10min → bail (another worker owns it)
         │     • plugin.listOrders(uid) — if an active order exists for the target cycle → link it, mark done, bail
         ├── Write orderCycle.lockedAt = now (transactional)
         ├── Do the checkout (plugin.checkout)
         ├── On success: orderCycle.status=active, orderId, idempotencyKey, clear lockedAt
         └── On failure: orderCycle.lastError, attempts++, clear lockedAt
```

**No separate `cron_jobs` collection.** The `orderCycle` subcollection IS the queue; each doc's fields answer "should I be fired again?"

## Safety invariants (the 3 that matter)

1. **`lockedAt` timestamp on `orderCycle`** — prevents two overlapping cron ticks from double-firing the same worker. Treated as "stuck" after 10min.
2. **`idempotencyKey = hash(uid, storeId, cycleDate)`** stored on success. A re-fired worker finding a matching key returns immediately.
3. **Pre-commit `listOrders` check inside the worker** — if Shufersal already has an active order for the target cycle (placed but the previous worker didn't get to record it), the worker links the existing orderId to `orderCycle` and exits clean. This is the real safety net: even if orchestration has bugs, no double `placeOrder`.

2 + 3 together: even if the cron misfires or the worker is called twice, no duplicate order is possible.

## Retry model

The 10-minute tick IS the retry.

- Worker dies at minute 3 → `lockedAt` still there but stale after 10min.
- Next tick: eligible-filter matches again (status still not `active`, lockedAt stale) → worker re-fires.
- Worker's pre-flight check talks to Shufersal to see what actually happened. Either:
  - Order was placed → link, done.
  - Order wasn't placed → try again, clean.

Dead-letter: `orderCycle.lastError != null AND attempts > 3` → Telegram admin alert, no more auto-retry until reset.

## Scaling

| Scale | Bottleneck | Fix |
|---|---|---|
| **10×** (~50 users) | None. Vercel concurrency ≫ 50. | As above. |
| **100×** (~500 users) | Dispatcher fan-out latency + Firestore read load on query. | Shard `groceries` into N sub-collections by `hash(uid) % N`, dispatch per shard in parallel ticks. |
| **1000×** (~5000 users) | Vercel function concurrency + Shufersal/Payme rate limits. | Move workers to **Cloud Tasks → Cloud Run** (dispatcher stays on Vercel). **Stagger** by `minuteOffset = hash(uid) % 20` so the 10-min tick only dispatches ~5000/20 = 250 users at a time — spreads Shufersal load evenly across 20min, not a thundering herd at :00. |

## Security between dispatcher and worker

The dispatcher calls the worker over public HTTPS (Vercel function → Vercel function). Anyone who finds the worker URL could hit it. We need abuse resistance.

### Layered defense

**Layer 1 — minimal payload.** Worker receives only `{uid, storeId}`. No amounts, no items, no free-form input. The uid is a Firebase UID (~28 char base62) — unguessable without a leak.

**Layer 2 — worker re-validates everything.** Before doing any work, the worker re-runs the eligibility filter:
- `schedule.orderDay == today`?
- Current hour in the 08:00-10:00 cron window?
- `orderCycle.status != 'active'`?
- No lock within 10min?

If any fails → no-op. Return 200 silently. This means: even if an attacker pings the worker with a valid uid at the wrong time, nothing happens.

**Layer 3 — shared secret header.** Dispatcher sends `Authorization: Bearer ${CRON_SECRET}` (same env var already used for the Vercel cron). Worker rejects without it. This stops trivial scanning and raises the bar to "needs the secret" — which is the same bar as triggering the cron itself, so no new attack surface.

**Layer 4 (optional, add only if abuse observed) — HMAC per request.**
```
sig = HMAC-SHA256(WORKER_SECRET, `${uid}|${storeId}|${exp}`)
```
Dispatcher signs, worker verifies + checks `exp` hasn't passed (60s window). Prevents replay and can't be forged even if the request URL leaks. Adds ~20 lines.

### Damage ceiling if all layers break

Worst case: attacker knows a uid AND the secret AND the timing window AND the worker URL. They can cause ONE legitimate scheduled checkout to fire ~10 min earlier than it would have. Idempotency + `lockedAt` + pre-commit `listOrders` prevent any duplicate order. So the blast radius stays "minor timing anomaly", never "spurious orders" or "data leak".

### What NOT to do

- Don't pass items/quantities/slot as the request body — lets an attacker manipulate the order.
- Don't trust the request to tell the worker which action to run; derive from state.
- Don't put user-facing secrets (Shufersal credentials, OTP codes) in the request; the worker loads them from Firestore using the uid.

## Observability

On every tick, log counts by status:
```
{ pending: N, running: M, done: K, failed: F }
```
Dashboard query: `orderCycle where lastError != null` → who needs help.

## Global circuit breaker

If failure rate in the last 10min > 50%, dispatcher skips new `checkout` enqueues and sends "שופרסל לא זמין — מנסה שוב במחזור הבא" to each affected user. Prevents hammering a downed vendor.

## Migration path

1. **Backwards-compatible safety pass** (smallest, biggest impact):
   - Add `idempotencyKey` + `lockedAt` + `lastError` + `attempts` to `OrderCycle`.
   - Add pre-commit `listOrders` check in the current inline cron.
   - Clamp `lockedAt` on entry, clear on exit.
   - **Stop**: the 11:01 class is already dead at this point.

2. **Split into dispatcher + worker** (when user base reaches 5+):
   - Extract the per-(user, store) inner loop into `/api/grocery/cron/worker`.
   - Replace the inner loop with `fetch(..., { body, cache: 'no-store' })` fire-and-forget (no await).
   - Move cron cadence from `0 */2 * * *` to `*/10 * * * *` in `vercel.json`.
   - Eligibility filter becomes the Firestore query at the top of the dispatcher.

3. **Shard + stagger** (at 500+ users): only if observed pain.
