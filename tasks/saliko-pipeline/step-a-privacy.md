# Step (a) — Saliko privacy statement

**Status:** complete
**Date:** 2026-05-16
**Version slug:** `2026-05-16-saliko-privacy-v1`

## What was done

Saliko-specific privacy statement written, wired into the site, and exposed as a single source of truth that downstream steps will import directly (no string duplication).

### Three-tier model documented

| Tier id | Label | What's stored | Capabilities |
|---|---|---|---|
| `anonymous` | משתמש אנונימי | nothing (in-session OTP only) | one-shot OTP order; wiped on disconnect |
| `logged-in-no-server-creds` | משתמש מחובר ללא שמירת פרטים בשרת | creds in browser IndexedDB only; synced as e2e-encrypted backup blob | full UX while online; **no cron** |
| `logged-in-with-server-creds` | משתמש מחובר עם שמירת פרטים בשרת | creds encrypted at rest on server (KMS) | full UX + unattended cron orders |

Honest disclaimer about encryption-at-rest is in the policy (server must decrypt to log in on behalf, so personnel with prod access can decrypt — not "we can't see it").

## Files

- **Content (single source of truth):** `app/saliko/privacy/privacyContent.ts` — exports `SALIKO_PRIVACY_VERSION`, `SALIKO_PRIVACY_HTML`, `SALIKO_PRIVACY_TIERS`, `SALIKO_PRIVACY_TIER_LABELS`, `SALIKO_PRIVACY_TIER_BLURBS`, `SALIKO_PRIVACY_CONTACT_EMAIL`.
- **Public page:** `app/saliko/privacy/page.tsx` — reachable as `/privacy` on Saliko (via existing proxy rewrite in `proxy.ts`) and `/saliko/privacy` canonically. `notFound()` off-variant, `robots: noindex` off-variant.
- **API:** `app/api/privacy/route.ts` — `GET /api/privacy` returns `{ version, text, accepted, privacyAcceptedAt }`. Firestore-preferred (`privacyVersions/{slug}`), in-code fallback. 404 on Aglamazo.
- **Footer link:** added Saliko-only "משפטי" section in `app/components/SiteFooter.tsx`.

## User-acceptance tracking

Stored on `users/{uid}.privacyAcceptedAt` — parallel to existing `tcAcceptedAt`. Separate so a T&C update doesn't re-trigger privacy acceptance and vice versa.

## Decision: separate `/privacy` page over extending `/terms`

The chat brain (step c) will want to fetch privacy and T&C independently — different versions, different gating moments. The acceptance status lives on its own user field.

## Action still required by Yaakov

Seed the new Firestore collection (one-time, after merge):

```
npx tsx scripts/seed-saliko-privacy.ts
```

(Uses `/home/yaakov/develop/docs/saliko-firebase-admin.json`, same path as `seed-saliko-tc.ts`.)

Until run, `/api/privacy` falls back to the in-code constants — site stays functional.

## Notes for downstream steps

- **Step (b):** A03 in particular needs revisiting — its "expected" response previously claimed `מוצפנת בשרת שלנו` which is true only in Tier 3 and was misleading. The policy now says clearly what's stored where; tests should match.
- **Step (c):** will need a POST handler on `/api/privacy` to write `privacyAcceptedAt`, plus a consent-gate UI when the user moves Tier 2 → Tier 3.
- **No architectural changes were made** — the policy is purely content + page + API. The actual storage paths (Firestore plaintext via `saveCredentials`, Dexie vault) are unchanged. Step (c) will reconcile them with the policy.

## Verification

- `npx tsc --noEmit` clean.
- `npm run lint` clean except two pre-existing errors (gmail page >850 lines, stores/registry inline list).
