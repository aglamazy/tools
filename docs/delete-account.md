# Self-serve delete account

Spec: `~/develop/Buddy/docs/aglamazo-delete-account-SPEC.md` (settled with Agla 2026-09-20).
Rows: aglamazo#411 (server), #412 (UI), #413 (sync), #414 (verification).

**Account = household.** Only the household owner deletes; it deletes the whole household and every member's login. A user with no household is the owner of their own account and deletes it the same way. A non-owner member is refused (`not-owner`). Deletion is immediate — no grace period.

## Contract (what the client rows build against)

### `POST /api/account/delete` — owner-only, authenticated
- Header `Authorization: Bearer <Firebase ID token>`, body `{}`.
- The token must come from a **fresh sign-in**: `auth_time` within 5 minutes, else `403 { errorCode: "reauth-required" }`. The client re-authenticates first (password users: `reauthenticateWithCredential`; Google users: re-run the Google popup), then calls this. The Yes/No confirmation is client-side and comes after re-auth.
- `200 { success: true, kind: "household" | "user", accountsDeleted: n, resumed: boolean }` — only when **every** step completed.
- `403 { errorCode: "not-owner" }` — a household member who is not the owner.
- `500 { errorCode: "deletion-failed", step, retryable: true }` — the job stopped at `step`; call the endpoint again with a fresh token, it resumes.
- `401` unauthenticated; `403 { code: "account-deleted" }` never comes from this route (it is allowed for an account whose marker already exists, so a failed run can be re-run).

### `POST /api/account/status` — public (a deleted login cannot authenticate)
- Body `{ uid?: string, householdId?: string }` (at least one; ids are `[A-Za-z0-9_-]{1,128}`).
- `200 { deleted: false }` or `200 { deleted: true, deletedAt: <ISO> }`; `400` for a missing/invalid id; `500` if the lookup fails (never "not deleted" on an error). `Cache-Control: no-store`.
- A device asks with the uid / householdId it persisted while signed in. Nothing else is returned.

### The marker
Firestore `deletedAccounts/{kind}_{id}` where kind is `user` (every deleted uid), `household`, or `business` (a shared business the owner owned). Fields: `kind, id, variant, deletedAt (ISO string), purgeAfter (Timestamp = deletedAt + 90 days)`. No user data. Admin-SDK writes only; clients cannot read it (Firestore rules `allow read, write: if false`).

### Enforcement (server-side, not a client check)
1. **API guard** (`app/lib/apiGuard.ts`): every guarded route (`requireAuth/Tc/Tier…`) answers `403 { code: "account-deleted" }` for a uid or token-household with a marker. A deleted account's ID token stays valid for up to ~1 h; the token alone proves nothing.
2. **Storage rules** (`storage.rules`): personal, household and shared-business backup paths refuse read/write when the matching marker exists (`firestore.exists(...)`). This is what stops a stale device re-uploading its local copy — sync talks to Storage directly, no API in the path.

**Deploy prerequisites for (2), Agla's call:** the rules must be deployed, and Storage rules that call `firestore.exists` are cross-service rules: Firebase documents an IAM role that lets the Storage rules service read Firestore — confirm it is granted at deploy time (not verified here; the rules were reviewed by hand, not run against an emulator). Until then the API guard still protects every API route but a stale device could write to Storage within its token's lifetime.

## What "delete" means — the inventory
| Where | What | Keyed by |
|---|---|---|
| Storage | `backups/{variant}/{uid}/`, `backups/{variant}/households/{hid}/`, `backups/{variant}/shared/{businessSyncId}/` (businesses the deleted owner shares) | uid, household, business |
| Firestore (recursive) | `users/{uid}` (+ `private`, `agentTasks`, `bots`), `groceries/{uid}` (stores, credentials, session, catalog, mappings, pending searches, checkouts), `userTasks/{uid}`, `billingStatus/{uid}`, `appChatHistory/{uid}`, `telegramChatHistory/{uid}` | uid |
| Firestore (by field) | `telegramLinks.uid`, `telegramLinkCodes.uid`, `chatQueue.uid`, `businessPartners.ownerUid`, `businessAccessGrants.ownerUid` and `.uid`, `businessShareInvitations.ownerUid`, legacy `businessShares.ownerUid` / `.sharedWithUid`, `invitations.inviterUid`, `provisions.claimedBy`, `ypayPaymentLinks.ownerUserId` and `.billingOwnerId`, `upayPaymentLinks.billingOwnerId` | uid |
| Firestore (events) | `ypayPaymentEvents` / `upayPaymentEvents` for the deleted payment links (`chargeIdentifier`) | link id |
| Firestore (by email) | `invitations.inviteeEmail`, `businessShareInvitations.inviteeEmail` | login email |
| Firestore (household) | `households/{hid}`, `invitations.householdId` | household |
| Auth custom claims | partners lose the deleted owner's business from their `sharedBusinesses` claim | partner uid |
| Firebase Auth | every member's login, the owner's login **last** | uid |
| Not touched | the user's Google Drive files (theirs), global config (`platformSettings`, `tcVersions`, `_catalogs`) | — |
| Local devices | nothing automatic — see aglamazo#413 | — |

## The job (idempotent, fixed order)
`plan → marker → storage → claims → firestore → auth → finalize`
- **plan** persists who is being deleted (`accountDeletionJobs/{kind}_{id}`) *before* anything is removed: the household doc and the sharing grants it is discovered from are deleted later, and a retry would otherwise lose the members.
- **marker** is written before any deletion.
- **claims** runs before Firestore so the grants naming the partners still exist.
- **auth** deletes members first, the owner very last, so a failure leaves the owner signed in and able to retry.
- **finalize** writes the audit entry and removes the job doc. Success is reported only after this.
- Payment events are removed before their links so a retry still finds them.

**Audit:** `accountDeletionAudit/{sha256("<kind>:<id>")}` = `{ kind, subjectHash, deletedAt }` — a hash and a time, no content. Kept indefinitely.

## Marker retention and purge
Markers are kept at least 90 days. The purge is a **Firestore TTL policy** on the `purgeAfter` field — no code, no cron:

```
gcloud firestore fields ttls update purgeAfter --collection-group=deletedAccounts --enable-ttl --project=<firebase-project>
```

Run once per Firebase project (aglamaz-finance and the Saliko project). Firestore deletes expired markers within a day or so of `purgeAfter`. If the policy is never enabled, markers simply stay — the safe direction. `accountDeletionJobs` documents exist only for a run that has not finished.

## Decisions to confirm (spec is silent)
- **Solo user with no household** is treated as the owner of their own account.
- **Shared-business backups** of businesses the deleting owner shares with partners are deleted and blocked (`business_<id>` marker); partners lose cloud sync for those businesses.
- **Billing status, payment links (+ gateway events) and provisions are deleted with everything else** (Agla, 2026-09-21: a delete request is completed in full — no partial deletion, no retention flag). Note `ypayPaymentLinks.ownerUserId` links hold the user's own customers' contact details; they go too.
- **Storage rules precondition:** direct Storage writes are unprotected until the rules and the cross-service Firestore read grant are live; until then the API guard is the only protection.
