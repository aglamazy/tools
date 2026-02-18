# HOME Tier - Household Sharing

## Overview

The HOME tier enables two users (partners/spouses) to share all financial data. Both users access the same encrypted data stored in Firebase Storage.

**Key principle**: Data is encrypted client-side. The server never sees plaintext. Partners share the encryption password out-of-band.

---

## Architecture

### Current System (Already Built)
- **Encryption**: AES-256-GCM, client-side, password-derived key (PBKDF2, 100K iterations)
- **Storage**: Firebase Storage at `backups/{userId}/backup.json`
- **Sync**: CloudSyncManager with master/slave coordination
- **Password**: Stored in sessionStorage, verified via token

### Household Extension
- **Shared path**: `backups/households/{householdId}/backup.json`
- **Both partners** read/write to the same encrypted blob
- **Same password** required to decrypt
- **Master/slave** coordination prevents conflicts

---

## Data Flow

```
┌─────────────────┐      ┌─────────────────────────────────┐      ┌─────────────────┐
│     Owner       │      │      Firebase Storage           │      │    Partner      │
│  (HOME tier)    │      │  (encrypted blob, can't read)   │      │   (any tier)    │
├─────────────────┤      ├─────────────────────────────────┤      ├─────────────────┤
│ Local IndexedDB │      │ /backups/households/{id}/       │      │ Local IndexedDB │
│       ↓         │      │   - backup.json (encrypted)     │      │       ↑         │
│ Encrypt (pwd)   │ ───► │   - verification.txt            │ ◄─── │ Decrypt (pwd)   │
│       ↓         │      └─────────────────────────────────┘      │       ↑         │
│    Upload       │                                               │   Download      │
└─────────────────┘                                               └─────────────────┘
```

---

## Firestore Structure

### households/{householdId}
```typescript
{
  ownerId: string,        // UID of HOME tier owner
  members: string[],      // [ownerId, partnerId]
  createdAt: Timestamp
}
```

### invitations/{invitationId}
```typescript
{
  householdId: string,
  inviterUid: string,
  inviteeEmail: string,
  status: 'pending' | 'accepted' | 'expired',
  createdAt: Timestamp,
  expiresAt: Timestamp    // 7 days from creation
}
```

### users/{uid} (extended)
```typescript
{
  tier: 'free' | 'home' | 'pro' | 'owner',
  householdId?: string,
  householdRole?: 'owner' | 'member',
  createdAt?: string
}
```

---

## Invitation Flow

1. **Owner initiates**: Settings → Household → "Invite Partner"
2. **Enter email**: Partner's email address
3. **API creates invitation**: Stored in Firestore with unique token
4. **Email sent**: Link to `/invite?token=xxx`
5. **Partner accepts**: Clicks link, logs in, confirms
6. **API updates**: Sets partner's `householdId`
7. **Password shared**: Owner tells partner the encryption password (phone, text, etc.)
8. **Partner syncs**: Enters password → downloads → decrypts → imports

---

## Security Model

| Layer | What it protects | Who has access |
|-------|------------------|----------------|
| Firebase Auth | Storage path access | Authenticated users only |
| Household membership | Which storage path | Household members only |
| Encryption password | Data content | Anyone who knows the password |

**Both required**: User must be household member AND know password to access data.

---

## Master/Slave Coordination

Existing system prevents concurrent writes:
- Only **one device** can be "master" (write access)
- Other devices are "slave" (read-only)
- Station lock uses Firestore for coordination

With household sharing:
- Only **one person** can be master at a time
- Both partners see same station lock state
- Prevents conflicting uploads

---

## Migration When Partner Joins

1. Partner's local data is **not uploaded**
2. Partner **downloads** household encrypted backup
3. Partner enters **shared password**
4. Local data is **replaced** with household data
5. Partner can now sync normally

**Note**: Partner's previous data is lost. They should export backup first if needed.

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/household/create` | POST | Create household, set owner's householdId |
| `/api/household/invite` | POST | Create invitation for email |
| `/api/household/accept` | POST | Accept invitation, join household |
| `/api/household/leave` | POST | Leave household (or kick member if owner) |

All routes use Firebase Admin SDK (server-side writes).

---

## Files to Implement

### New Files
- `app/api/household/create/route.ts`
- `app/api/household/invite/route.ts`
- `app/api/household/accept/route.ts`
- `app/api/household/leave/route.ts`
- `app/lib/firebaseAdmin.ts`
- `app/components/settings/HouseholdTab.tsx`
- `app/components/InvitePartnerModal.tsx`
- `app/invite/page.tsx`

### Modified Files
- `app/services/cloudBackupService.ts` - Use householdId path
- `app/services/userService.ts` - Fetch householdId, householdRole
- `storage.rules` - Add household path rules
- `firestore.rules` - Add household/invitation read rules
- `app/components/settings/SettingsTabs.tsx` - Add HouseholdTab

---

## Storage Rules

```javascript
// storage.rules
match /backups/households/{householdId}/{fileName} {
  allow read, write: if request.auth != null
    && isHouseholdMember(householdId, request.auth.uid);
}

// Helper function (pseudo-code, actual implementation may vary)
function isHouseholdMember(householdId, uid) {
  return uid in firestore.get(/households/$(householdId)).data.members;
}
```

---

## Tier Requirements

| Action | Required Tier |
|--------|---------------|
| Create household | HOME |
| Invite partner | HOME (owner only) |
| Accept invitation | FREE (any tier) |
| Access shared data | FREE (any tier, if in household) |

Partner doesn't need HOME tier - they inherit access from owner.

---

## Edge Cases

### Owner downgrades from HOME
- Household remains but sync stops for both
- Data stays in Storage (not deleted)
- Both can still access local data

### Partner leaves household
- Partner's `householdId` cleared
- Partner keeps local copy of data
- Partner reverts to personal storage path

### Owner removes partner
- Same as partner leaving
- Owner remains sole household member

### Concurrent edits
- Master/slave prevents this
- Only master can upload
- Slave sees "read-only" status
