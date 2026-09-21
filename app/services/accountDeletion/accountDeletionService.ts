/**
 * Self-serve account deletion (aglamazo#411, docs/delete-account.md).
 *
 * "Account = household": the owner deletes the household and every member's
 * login; a solo user (no household) is the owner of their own account.
 *
 * ONE idempotent job, in a fixed order — plan → marker → storage → claims →
 * firestore → auth → finalize. The marker is written before anything is
 * deleted; Auth users go LAST (members first, the owner very last) so a run
 * that fails midway can be retried by the same signed-in owner. Success is
 * reported only when every step completed.
 *
 * The plan (who, which businesses) is persisted BEFORE the marker, because
 * the data it is discovered from (the household doc, the sharing grants) is
 * exactly what the later steps delete — a retry would otherwise lose track
 * of the members and leave their logins behind.
 */
import { createHash } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import { markerKey, writeMarker, type MarkerKind } from '@/app/lib/accountMarker'

export const JOBS_COLLECTION = 'accountDeletionJobs'
export const AUDIT_COLLECTION = 'accountDeletionAudit'

export type DeletionStep = 'plan' | 'marker' | 'storage' | 'claims' | 'firestore' | 'auth' | 'finalize'

export type DeletionPlan = {
  kind: 'household' | 'user'
  /** Household id, or the uid for a solo user. */
  subjectId: string
  ownerUid: string
  /** Every login being deleted; the owner is always LAST. */
  uids: string[]
  /** Login emails (lower-case), used to remove invitations addressed to them. */
  emails: string[]
  /** Businesses the deleting accounts own and share with partners. */
  businessSyncIds: string[]
}

export type DeletionDeps = {
  firestore: Firestore
  variant: string
  now: () => Date
  deleteStoragePrefix: (prefix: string) => Promise<void>
  /** null when the login no longer exists. */
  getAuthEmail: (uid: string) => Promise<string | null>
  /** Must treat an already-deleted user as success. */
  deleteAuthUser: (uid: string) => Promise<void>
  getClaims: (uid: string) => Promise<Record<string, unknown> | null>
  setClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>
}

export type SubjectResolution =
  | { ok: true; plan: DeletionPlan; resumed: boolean }
  | { ok: false; code: 'not-owner' }

export class DeletionStepError extends Error {
  constructor(public readonly step: DeletionStep, public readonly cause: unknown) {
    super(`account deletion failed at step "${step}": ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'DeletionStepError'
  }
}

const QUERY_PAGE = 300
const MAX_PAGES = 1000

/** Delete every doc where `field == value`; returns the ids removed. */
async function deleteByQuery(firestore: Firestore, collection: string, field: string, value: string): Promise<string[]> {
  const removed: string[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await firestore.collection(collection).where(field, '==', value).limit(QUERY_PAGE).get()
    if (snap.empty) return removed
    const batch = firestore.batch()
    for (const doc of snap.docs) {
      batch.delete(doc.ref)
      removed.push(doc.id)
    }
    await batch.commit()
  }
  throw new Error(`deleteByQuery(${collection}.${field}) did not converge`)
}

async function readIdsByQuery(firestore: Firestore, collection: string, field: string, value: string): Promise<string[]> {
  const ids: string[] = []
  const snap = await firestore.collection(collection).where(field, '==', value).get()
  for (const doc of snap.docs) ids.push(doc.id)
  return ids
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

async function collectBusinessSyncIds(firestore: Firestore, uids: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const uid of uids) {
    for (const collection of ['businessPartners', 'businessAccessGrants', 'businessShareInvitations']) {
      const snap = await firestore.collection(collection).where('ownerUid', '==', uid).get()
      for (const doc of snap.docs) {
        const id = doc.data().businessSyncId
        if (typeof id === 'string' && id.length > 0) ids.push(id)
      }
    }
  }
  return unique(ids)
}

/**
 * Who is being deleted, or why the requester may not delete it. Resumes a
 * half-finished run from its persisted plan.
 */
export async function resolveSubject(
  deps: DeletionDeps,
  requesterUid: string,
  claimedHouseholdId: string | undefined,
): Promise<SubjectResolution> {
  const { firestore } = deps
  const userSnap = await firestore.collection('users').doc(requesterUid).get()
  const householdId = claimedHouseholdId || (userSnap.data()?.householdId as string | undefined)

  const jobKeys = householdId
    ? [markerKey('household', householdId), markerKey('user', requesterUid)]
    : [markerKey('user', requesterUid)]
  for (const key of jobKeys) {
    const job = await firestore.collection(JOBS_COLLECTION).doc(key).get()
    if (!job.exists) continue
    const plan = job.data() as DeletionPlan
    if (plan.ownerUid !== requesterUid) return { ok: false, code: 'not-owner' }
    return { ok: true, plan, resumed: true }
  }

  if (householdId) {
    const household = await firestore.collection('households').doc(householdId).get()
    if (household.exists) {
      const data = household.data() ?? {}
      if (data.ownerId !== requesterUid) return { ok: false, code: 'not-owner' }
      const members: string[] = Array.isArray(data.members) ? data.members : []
      const uids = [...members.filter((m) => m !== requesterUid), requesterUid]
      return { ok: true, resumed: false, plan: await draftPlan(deps, 'household', householdId, requesterUid, uids) }
    }
    // A stale claim for a household that was already dissolved: this is a solo account.
  }
  return { ok: true, resumed: false, plan: await draftPlan(deps, 'user', requesterUid, requesterUid, [requesterUid]) }
}

async function draftPlan(
  deps: DeletionDeps,
  kind: DeletionPlan['kind'],
  subjectId: string,
  ownerUid: string,
  uids: string[],
): Promise<DeletionPlan> {
  const emails: string[] = []
  for (const uid of uids) {
    const email = await deps.getAuthEmail(uid)
    if (email) emails.push(email.toLowerCase())
  }
  return {
    kind,
    subjectId,
    ownerUid,
    uids,
    emails: unique(emails),
    businessSyncIds: await collectBusinessSyncIds(deps.firestore, uids),
  }
}

function planKey(plan: DeletionPlan): string {
  return markerKey(plan.kind, plan.subjectId)
}

async function stepPlan(deps: DeletionDeps, plan: DeletionPlan): Promise<void> {
  const ref = deps.firestore.collection(JOBS_COLLECTION).doc(planKey(plan))
  const existing = await ref.get()
  if (existing.exists) return
  await ref.set({ ...plan, startedAt: deps.now().toISOString() })
}

async function stepMarker(deps: DeletionDeps, plan: DeletionPlan): Promise<void> {
  const now = deps.now()
  const markers: Array<[MarkerKind, string]> = [
    ...plan.uids.map((uid): [MarkerKind, string] => ['user', uid]),
    ...plan.businessSyncIds.map((id): [MarkerKind, string] => ['business', id]),
  ]
  if (plan.kind === 'household') markers.push(['household', plan.subjectId])
  for (const [kind, id] of markers) await writeMarker(deps.firestore, kind, id, deps.variant, now)
}

async function stepStorage(deps: DeletionDeps, plan: DeletionPlan): Promise<void> {
  const prefixes = [
    ...plan.uids.map((uid) => `backups/${deps.variant}/${uid}/`),
    ...(plan.kind === 'household' ? [`backups/${deps.variant}/households/${plan.subjectId}/`] : []),
    ...plan.businessSyncIds.map((id) => `backups/${deps.variant}/shared/${id}/`),
  ]
  for (const prefix of prefixes) await deps.deleteStoragePrefix(prefix)
}

/**
 * Partners keep a `sharedBusinesses` custom claim naming the businesses they can
 * sync. Remove the deleted owners' businesses from it — while the grants that
 * name those partners still exist, which is why this runs before Firestore.
 */
async function stepClaims(deps: DeletionDeps, plan: DeletionPlan): Promise<void> {
  if (plan.businessSyncIds.length === 0) return
  const gone = new Set(plan.businessSyncIds)
  const deleting = new Set(plan.uids)
  const partnerUids: string[] = []
  for (const uid of plan.uids) {
    partnerUids.push(...(await readIdsByQueryField(deps.firestore, 'businessAccessGrants', 'ownerUid', uid, 'uid')))
  }
  for (const partnerUid of unique(partnerUids)) {
    if (deleting.has(partnerUid)) continue
    const claims = await deps.getClaims(partnerUid)
    const shared = claims && Array.isArray(claims.sharedBusinesses) ? (claims.sharedBusinesses as string[]) : null
    if (!shared || !shared.some((id) => gone.has(id))) continue
    await deps.setClaims(partnerUid, { sharedBusinesses: shared.filter((id) => !gone.has(id)) })
  }
}

async function readIdsByQueryField(
  firestore: Firestore,
  collection: string,
  field: string,
  value: string,
  read: string,
): Promise<string[]> {
  const snap = await firestore.collection(collection).where(field, '==', value).get()
  const out: string[] = []
  for (const doc of snap.docs) {
    const v = doc.data()[read]
    if (typeof v === 'string') out.push(v)
  }
  return out
}

/** Payment links go with their gateway events; the events are removed FIRST so a retry can still find them. */
async function deleteLinksWithEvents(
  firestore: Firestore,
  linkCollection: string,
  eventCollection: string,
  field: string,
  uid: string,
): Promise<void> {
  for (const chargeId of await readIdsByQuery(firestore, linkCollection, field, uid)) {
    await deleteByQuery(firestore, eventCollection, 'chargeIdentifier', chargeId)
  }
  await deleteByQuery(firestore, linkCollection, field, uid)
}

async function deleteAccountRecords(deps: DeletionDeps, uid: string): Promise<void> {
  const { firestore } = deps
  for (const path of [
    ['users', uid], ['groceries', uid], ['userTasks', uid],
    ['billingStatus', uid], ['appChatHistory', uid], ['telegramChatHistory', uid],
  ]) {
    await firestore.recursiveDelete(firestore.collection(path[0]).doc(path[1]))
  }
  for (const [collection, field] of [
    ['telegramLinks', 'uid'], ['telegramLinkCodes', 'uid'], ['chatQueue', 'uid'],
    ['businessPartners', 'ownerUid'], ['businessAccessGrants', 'ownerUid'], ['businessAccessGrants', 'uid'],
    ['businessShareInvitations', 'ownerUid'], ['businessShares', 'ownerUid'], ['businessShares', 'sharedWithUid'],
    ['invitations', 'inviterUid'], ['provisions', 'claimedBy'],
  ]) {
    await deleteByQuery(firestore, collection, field, uid)
  }
  await deleteLinksWithEvents(firestore, 'ypayPaymentLinks', 'ypayPaymentEvents', 'ownerUserId', uid)
  await deleteLinksWithEvents(firestore, 'ypayPaymentLinks', 'ypayPaymentEvents', 'billingOwnerId', uid)
  await deleteLinksWithEvents(firestore, 'upayPaymentLinks', 'upayPaymentEvents', 'billingOwnerId', uid)
}

async function stepFirestore(deps: DeletionDeps, plan: DeletionPlan): Promise<void> {
  const { firestore } = deps
  for (const uid of plan.uids) await deleteAccountRecords(deps, uid)
  for (const email of plan.emails) {
    await deleteByQuery(firestore, 'invitations', 'inviteeEmail', email)
    await deleteByQuery(firestore, 'businessShareInvitations', 'inviteeEmail', email)
  }
  if (plan.kind === 'household') {
    await deleteByQuery(firestore, 'invitations', 'householdId', plan.subjectId)
    await firestore.collection('households').doc(plan.subjectId).delete()
  }
}

async function stepAuth(deps: DeletionDeps, plan: DeletionPlan): Promise<void> {
  const ordered = [...plan.uids.filter((uid) => uid !== plan.ownerUid), plan.ownerUid]
  for (const uid of ordered) await deps.deleteAuthUser(uid)
}

/** The audit entry carries a hash of the id and a time — never content. */
async function stepFinalize(deps: DeletionDeps, plan: DeletionPlan): Promise<void> {
  const subjectHash = createHash('sha256').update(`${plan.kind}:${plan.subjectId}`).digest('hex')
  await deps.firestore.collection(AUDIT_COLLECTION).doc(subjectHash).set({
    kind: plan.kind,
    subjectHash,
    deletedAt: deps.now().toISOString(),
  })
  await deps.firestore.collection(JOBS_COLLECTION).doc(planKey(plan)).delete()
}

const STEPS: Array<[DeletionStep, (deps: DeletionDeps, plan: DeletionPlan) => Promise<void>]> = [
  ['plan', stepPlan],
  ['marker', stepMarker],
  ['storage', stepStorage],
  ['claims', stepClaims],
  ['firestore', stepFirestore],
  ['auth', stepAuth],
  ['finalize', stepFinalize],
]

/** Run the whole job. Throws DeletionStepError naming the step that failed; safe to call again. */
export async function runAccountDeletion(deps: DeletionDeps, plan: DeletionPlan): Promise<DeletionStep[]> {
  const completed: DeletionStep[] = []
  for (const [step, run] of STEPS) {
    try {
      await run(deps, plan)
    } catch (err) {
      throw new DeletionStepError(step, err)
    }
    completed.push(step)
  }
  return completed
}
