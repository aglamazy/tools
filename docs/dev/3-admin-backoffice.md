# 3 - Admin Backoffice

## Problem

There is no way to view or manage users and accounts. With paid tiers coming, the owner needs a backoffice to:

- See all accounts (households and solo users) with their current tier
- Expand an account to see its members
- Promote or demote an account's tier (FREE / HOME / PRO / OWNER)

Currently, OWNER tier is only set via `NEXT_PUBLIC_SEGMENT=local` env var. It needs to also be settable in Firestore so it works in production. The env-var override stays as a local-dev convenience.

## Fix

### 1. Allow OWNER tier from Firestore

In `userTierStore.ts`, the env-var override currently prevents Firestore from ever setting the tier. Change this so:
- If `NEXT_PUBLIC_SEGMENT=local`, start with OWNER (as today)
- If Firestore returns OWNER for this user, respect it even without the env var
- The env-var is an OR condition, not the only path to OWNER

### 2. API: list accounts

New route `app/api/admin/accounts/route.ts` (GET):
- Verify caller is OWNER tier (Bearer token → `verifyIdToken` → check tier in Firestore)
- Use Firebase Admin `getAuth().listUsers()` to get all users
- Fetch each user's doc from Firestore `users/{uid}` (tier, householdId, householdRole)
- Group users into accounts:
  - Users with a `householdId` → grouped under that household. The household's tier = the owner member's tier.
  - Users without a `householdId` → solo account, tier from their own doc.
- Return: `{ accounts: [{ id, name, tier, members: [{ uid, email, displayName, photoURL, role }] }] }`
- Account `name` = display name of the household owner (or the solo user)

### 3. API: promote/demote

New route `app/api/admin/promote/route.ts` (POST):
- Verify caller is OWNER tier
- Body: `{ accountId: string, tier: 'free' | 'home' | 'pro' | 'owner' }`
- `accountId` is either a `householdId` or a solo user's `uid`
- If household: update the tier field on all members' `users/{uid}` docs
- If solo user: update that user's `users/{uid}` doc
- Return: `{ success: true }`

### 4. Admin page UI

New page `app/tools/admin/page.tsx`:
- Gate: if user tier is not OWNER, call `notFound()` (same pattern as dev-db)
- Fetch `/api/admin/accounts` on mount
- Render a list of accounts, each showing: account name, tier badge, member count
- Click an account row to expand and show members (name, email, role)
- Tier selector (dropdown or button group) next to each account to promote/demote
- On tier change: POST to `/api/admin/promote`, then refetch the list
- Hebrew UI, RTL, inline styles (match existing app patterns)

### 5. Sidebar entry

Add an "Admin" tool entry in `Sidebar.tsx` with `requiredTier: UserTier.OWNER`. Follow the existing pattern (id, title, href, icon, requiredTier).

## Files

| File | What changes |
|------|-------------|
| `app/stores/userTierStore.ts` | Allow Firestore to set OWNER tier — env-var becomes fallback, not exclusive gate |
| `app/api/admin/accounts/route.ts` | **New.** GET endpoint — list all accounts (households + solo users) with members and tiers |
| `app/api/admin/promote/route.ts` | **New.** POST endpoint — change tier for an account (all members in household) |
| `app/tools/admin/page.tsx` | **New.** Backoffice page — account list, expand members, promote/demote |
| `app/components/Sidebar.tsx` | Add Admin link gated to OWNER tier |

## Verify

- [ ] Start dev server: `npm run dev -- -p 3100`
- [ ] Navigate to `http://localhost:3100/tools/admin`
- [ ] **Expect**: page loads without errors (not a 404)
- [ ] **Expect**: list of accounts is displayed, each with a name and tier badge
- [ ] Click an account row to expand it
- [ ] **Expect**: members are shown with name, email, and role (owner/member)
- [ ] Change an account's tier using the tier selector
- [ ] **Expect**: the UI updates to reflect the new tier
- [ ] Refresh the page
- [ ] **Expect**: the changed tier persists (Firestore was updated)
- [ ] **Expect**: no console errors throughout
- [ ] Navigate to the sidebar
- [ ] **Expect**: "Admin" link is visible (since test user is OWNER)
- [ ] Take screenshot
