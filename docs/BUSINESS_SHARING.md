# Business Sharing

Per-business sharing allows a business owner to share a single business with an external user (e.g., bookkeeper, partner, accountant).

## Tier Requirements

| Action | Required Tier |
|--------|---------------|
| Share a business (create invite) | PRO |
| Accept invitation | FREE (any tier) |
| Access shared business data | FREE (any tier) |
| Sync shared business | FREE (any tier) |

**Decision**: The sharee rides on the sharer's tier. They get:
- Full access to the shared business (projects, time entries, documents, etc.)
- Independent sync loop for the shared business (separate encryption password)
- The shared business pinned in their sidebar menu

They do **not** get access to other PRO features (capital tracking, taxes, forecasting, etc.) — only the shared business itself.

This mirrors the household sharing model where the partner doesn't need HOME tier.

## How It Works

### Encryption
Each shared business has its own encryption password, separate from the personal cloud backup password. The sharer sets it on first invite; the sharee enters it when accepting.

### Sync Architecture
Shared business sync runs as an **independent loop** in `CloudSyncManager`, decoupled from personal sync:
- No paid tier required for the sharee
- No personal encryption password required
- Uses per-business shared password from `appSettings`
- Storage path: `backups/shared/{businessSyncId}/backup.enc`

### Data Scope
Only business-scoped data is synced:
- Business record
- Projects
- Harvest tasks & time entries
- Tax documents
- Advance payments
- Business categories

### Invite Flow
1. Sharer creates invite via `/api/business-share/invite`
2. Firebase custom claim `sharedBusinesses[]` updated for both users
3. Sharee clicks invite link → `/share-invite?id=...`
4. Sharee enters shared encryption password
5. Business record created locally with `sharedWithMe: true`, `pinnedToSidebar: true`
6. Shared sync loop picks it up on next interval

## Edge Cases

### Sharer downgrades from PRO
- Existing shares remain active
- Sync continues (no tier check on sync, only on invite creation)
- Cannot create new shares

### Sharee has no personal cloud sync
- Works fine — shared business sync is independent
- Sharee's other data stays local-only
