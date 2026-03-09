# API Security Policy

Every API route under `app/api/` **must** have explicit access control. No exceptions.

## Three layers of defence

### 0. React UI — UX layer (not a security boundary)

The React frontend hides pages and buttons based on auth state, tier, and T&C acceptance.
This is a **UX convenience only** — any user can bypass it with curl/Postman.
Never rely on the frontend to enforce access control.

### 1. Next.js Proxy (`proxy.ts`) — JWT verification + claim-based access

A [Next.js proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) intercepts requests **before** the route handler runs.

The proxy runs in the **Edge Runtime** (no `firebase-admin`). It verifies the Firebase JWT signature using the **Web Crypto API** against Google's public JWKS endpoint, then reads **custom claims** from the token payload to enforce access rules.

**How it works:**
1. Verifies the JWT signature (RS256) against Firebase's public keys
2. Validates standard claims (`iss`, `aud`, `exp`, `sub`)
3. Reads custom claims (`tier`, `tcAcceptedAt`, `householdRole`) embedded in the token
4. Enforces path-based rules without needing Firestore

**Important:** Custom claims are only updated when the server calls `setUserClaims()`. The user must refresh their token (re-login or token refresh) to pick up new claims. Every code path that changes `tier` or `tcAcceptedAt` in Firestore must also call `setUserClaims()` to keep the JWT in sync.

| Path pattern | Proxy check | Rejects with |
|---|---|---|
| `/api/admin/*` | JWT valid + `tier === 'owner'` | 401 / 403 |
| `/api/household/*` | JWT valid + `tcAcceptedAt >= required` | 401 / 403 |
| `/api/profile-qa` | JWT valid + `tcAcceptedAt >= required` | 401 / 403 |
| `/api/terms` | JWT valid | 401 |
| `/api/auth/*` | none | — |
| `/api/extension/*` | none | — |
| Everything else | none | — |

New routes placed under a matched path are **automatically covered** by the proxy — no per-file work needed.

### 2. In-route guards (`apiGuard.ts`) — defence in depth

Each route handler calls a guard helper that performs the same security checks using `firebase-admin` (Firestore).
This is a **second line of defence** — if claims are stale or the proxy is bypassed, the in-route guard catches it.
See [Guard helpers](#guard-helpers-applibapiGuardts) below.

### 3. ESLint rule (`local/require-api-guard`) — build-time safety net

The ESLint rule ensures every `app/api/**/route.ts` file explicitly declares its security posture.
A route file must either:

- **Import a guard** from `app/lib/apiGuard.ts` (`requireAuth`, `requireTc`, `requireTier`, `requireTierAndTc`), OR
- **Include a classification comment** as the first line:
  ```ts
  // PUBLIC ROUTE — <reason>
  ```
  ```ts
  // CALLER-KEYED ROUTE — <reason>
  ```

This prevents an agent or developer from creating a new route and forgetting to think about access control.
The commit will fail at lint if the declaration is missing.

## Guard helpers (`app/lib/apiGuard.ts`)

| Helper | Auth | Tier | T&C | Use for |
|--------|------|------|-----|---------|
| `requireAuth` | yes | — | — | Auth-only (e.g. T&C acceptance itself) |
| `requireTc` | yes | — | yes | All user-facing endpoints |
| `requireTier` | yes | yes | — | Admin/tier-gated (owner manages T&C, so skip T&C check) |
| `requireTierAndTc` | yes | yes | yes | Tier-gated user features |

## Route classification

| Route | Proxy | In-route guard | Notes |
|-------|-------|----------------|-------|
| `/api/admin/*` | JWT + owner tier | `requireTier('owner')` | Owner-only |
| `/api/household/*` | JWT + T&C accepted | `requireTc` | User-facing |
| `/api/profile-qa` | JWT + T&C accepted | `requireTc` | User-facing |
| `/api/terms` | JWT valid | `requireAuth` | T&C flow itself |
| `/api/auth/*` | — | — | `// PUBLIC ROUTE` comment |
| `/api/extension/*` | — | — | `// PUBLIC ROUTE` comment |
| `/api/extract-tax-doc` | — | — | `// CALLER-KEYED ROUTE` comment |
| `/api/form-filler/suggest` | — | — | `// CALLER-KEYED ROUTE` comment |
| `/api/scout/*` | — | — | `// CALLER-KEYED ROUTE` comment |
| `/api/ypay/*` | — | — | `// CALLER-KEYED ROUTE` comment |

## Keeping custom claims in sync

The proxy reads `tier` and `tcAcceptedAt` from the JWT custom claims.
Every code path that writes these values to Firestore **must also** call `setUserClaims()`:

| Value | Where it changes | File |
|-------|-----------------|------|
| `tier` | Admin promote/demote | `app/api/admin/promote/route.ts` |
| `tier` | Claim provision on first login | `app/api/auth/claim-provision/route.ts` |
| `tier` | Join household (set to 'home') | `app/api/household/accept/route.ts` |
| `tcAcceptedAt` | Accept T&C | `app/api/terms/route.ts` |

If you add a new code path that changes `tier` or `tcAcceptedAt`, add a `setUserClaims()` call.

## Adding a new route

1. **Place it under the right path.** If it's user-facing, put it under a guarded path so the proxy protects it automatically.
2. **Add an in-route guard or classification comment** so ESLint passes.
3. If the route is public or caller-keyed, add the comment header explaining why.
4. If unsure, use `requireTc` — it's the safe default.
