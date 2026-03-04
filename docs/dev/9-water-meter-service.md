# 9 - Water Meter Monitoring Service (Vercel Cron + Firestore)

## Workflow
preset: thorough
operations: code,review,run,pr
branch_from: main
merge_into: main

## Problem

Task 8 created a local bash script that polls the Arad RymPro water meter API and logs readings to a CSV file. We need to bring this into the finance app as a proper service:

- Vercel cron job polling every 10 minutes (requires Pro plan — already upgraded)
- Per-user private Firestore storage (server writes, user reads own data only)
- Admin toggle to enable the feature per account
- User-facing settings tab (PRO tier) to enter Arad credentials

This is the data-collection foundation. Future tasks will add a provisioning/baseline period and leak detection logic.

## API Reference (from task 8)

- **Base URL:** `https://eu-customerportal-api.harmonyencoremdm.com`
- **App ID header:** `x-app-id: 78FE99BC-5D35-4AC8-A15A-85E9D3C90ED0`
- **Auth token header:** `x-access-token: <token>`

### Login
```
POST /v1/consumer/login
Body: {"deviceId": "<string>", "email": "<string>", "pw": "<string>"}
Response: {"token": "<base64>:<base64>"}
```

### Last Read
```
GET /v1/consumption/last-read
Headers: x-access-token, x-app-id
Response: [{"meterCount": 15826, "meterId": "000011043576", "read": 1634.49}]
```

`read` is cumulative m3, resolution 0.1 m3.

## Fix

### 1. Firestore structure

```
users/{uid}/waterMeter/config → {
  email: string,          // Arad login email
  password: string,       // Arad login password
  deviceId: string,       // Arad device ID
  enabled: boolean,       // admin-controlled: is this meter active?
  createdAt: Timestamp
}

users/{uid}/waterMeter/readings/{auto} → {
  timestamp: Timestamp,
  readingM3: number,      // cumulative meter reading
  meterCount: number      // meter identifier from API
}
```

### 2. Firestore security rules

Add a rule for the `waterMeter` subcollection under `users/{uid}`:
- User can **read** their own `waterMeter` docs (config + readings)
- **No client writes** — all writes via Admin SDK (server-side only)

```
match /users/{uid}/waterMeter/{document=**} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if false;
}
```

This goes inside the existing `match /users/{uid}` block in `firestore.rules`.

### 3. Vercel cron route — `/api/cron/water-meter`

Create `app/api/cron/water-meter/route.ts`:

- Triggered every 10 minutes by Vercel cron
- Verify the request is from Vercel cron (check `Authorization: Bearer <CRON_SECRET>` header)
- Query all users where `waterMeter/config` exists and `enabled === true`
- For each user:
  - Read their Arad credentials from `waterMeter/config`
  - Login to Arad API, fetch `last-read`
  - Write a new doc to `waterMeter/readings` with timestamp + readingM3 + meterCount
  - On error: log but continue to next user (don't fail the whole batch)
- Use Firebase Admin SDK for all Firestore operations

### 4. `vercel.json` — cron config

Create `vercel.json` at project root:
```json
{
  "crons": [
    {
      "path": "/api/cron/water-meter",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

Set the `CRON_SECRET` environment variable in Vercel project settings.

### 5. Admin page — enable water meter per account

In the existing admin page (`app/tools/admin/page.tsx`), add a water meter toggle per account row:
- A button/toggle that enables or disables the water meter feature for that account
- Calls a new API route `POST /api/admin/water-meter` with `{ accountId, enabled: boolean }`
- The API route (using Admin SDK) sets `users/{uid}/waterMeter/config.enabled`

If the user hasn't configured their Arad credentials yet, the toggle just creates the config doc with `enabled: true` and empty credentials — the cron will skip users without credentials.

### 6. User settings tab — Arad credentials

Add a new tab to the existing Settings component (`app/components/Settings.tsx`):
- Tab ID: `water-meter`, label: `מד מים`, icon: `💧`, requiredTier: `UserTier.PRO`
- Create `app/components/settings/WaterMeterTab.tsx`
- Form fields: email (dir="ltr"), password (dir="ltr"), deviceId (dir="ltr")
- Save button calls `POST /api/user/water-meter` which writes to `users/{uid}/waterMeter/config` via Admin SDK
- Show current status: enabled/disabled (admin-controlled), last reading time + value if readings exist
- No helper/guide for finding credentials — that's a future task

### 7. API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `app/api/cron/water-meter/route.ts` | GET | Vercel cron — poll all active meters |
| `app/api/admin/water-meter/route.ts` | POST | Admin — enable/disable meter for account |
| `app/api/user/water-meter/route.ts` | POST | User — save own Arad credentials |
| `app/api/user/water-meter/route.ts` | GET | User — get own config + latest reading |

All API routes authenticate via Firebase ID token (same pattern as existing admin routes). The cron route authenticates via `CRON_SECRET`.

## Files

| File | What changes |
|------|-------------|
| `vercel.json` | New — Vercel cron config (every 10 min) |
| `firestore.rules` | Add waterMeter subcollection read rule under users/{uid} |
| `app/api/cron/water-meter/route.ts` | New — cron handler: iterate active meters, poll Arad, write readings |
| `app/api/admin/water-meter/route.ts` | New — admin toggle: enable/disable water meter per account |
| `app/api/user/water-meter/route.ts` | New — user endpoints: save credentials, get config + last reading |
| `app/components/Settings.tsx` | Add water-meter tab to ALL_TABS array |
| `app/components/settings/WaterMeterTab.tsx` | New — Arad credentials form + status display |
| `app/tools/admin/page.tsx` | Add water meter toggle in account rows |

## Verify

This task involves both UI and a server-side cron pipeline. Run the dev server and use MCP browser for UI checks. Use real Arad API for data verification.

### Setup
- Copy Arad credentials from `~/.config/water-meter/config.env` into the user's Firestore waterMeter/config doc (or enter via the settings UI)
- Set `CRON_SECRET` env var locally (any value for dev)

### Code-level checks
- [ ] `vercel.json` exists with correct cron schedule
- [ ] `firestore.rules` includes waterMeter subcollection rules
- [ ] All new API routes return proper error responses for unauthenticated requests
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`

### UI checks (MCP browser on dev server)
- [ ] Admin page (`/tools/admin`): water meter toggle visible per account, can enable/disable
- [ ] Settings page (`/tools/settings`): "מד מים" tab visible for PRO tier users
- [ ] Water meter tab: form shows email, password, deviceId fields; can save credentials
- [ ] Water meter tab: shows enabled/disabled status and last reading (if any)

### Data pipeline check
- [ ] Hit `/api/cron/water-meter` manually (with CRON_SECRET header) — returns 200
- [ ] Check Firestore: `users/{uid}/waterMeter/readings` has a new doc with `readingM3` matching a real meter value (expect ~1634+ m3)
- [ ] Hit the cron endpoint again — a second reading doc appears (not overwriting the first)
