/**
 * What deleting the account would remove, shown on the red-zone screen BEFORE the
 * user exports, re-authenticates or confirms (aglamazo#412). Read-only: it reuses
 * the delete job's own subject resolution, so the people listed here are exactly
 * the logins the job will delete — never a second, drifting definition.
 */
import { resolveSubject, type DeletionDeps } from './accountDeletionService'

export type PreviewPerson = { uid: string; email: string | null }

export type DeletionPreview =
  | { isOwner: false }
  | {
      isOwner: true
      kind: 'household' | 'user'
      /** Household members (other than the requester) whose logins are deleted with the account. */
      members: PreviewPerson[]
      /** Outside partners who lose access to businesses the account shares with them. */
      partners: PreviewPerson[]
    }

async function findPartners(deps: DeletionDeps, ownerUids: string[]): Promise<PreviewPerson[]> {
  const leaving = new Set(ownerUids)
  const partnerUids: string[] = []
  for (const ownerUid of ownerUids) {
    const grants = await deps.firestore.collection('businessAccessGrants').where('ownerUid', '==', ownerUid).get()
    for (const grant of grants.docs) {
      const uid = grant.data().uid
      if (typeof uid === 'string' && uid.length > 0 && !leaving.has(uid) && !partnerUids.includes(uid)) partnerUids.push(uid)
    }
  }
  return Promise.all(partnerUids.map(async (uid) => ({ uid, email: await deps.getAuthEmail(uid) })))
}

export async function buildDeletionPreview(
  deps: DeletionDeps,
  requesterUid: string,
  claimedHouseholdId: string | undefined,
): Promise<DeletionPreview> {
  const subject = await resolveSubject(deps, requesterUid, claimedHouseholdId)
  if (!subject.ok) return { isOwner: false }

  const { plan } = subject
  const memberUids = plan.uids.filter((uid) => uid !== requesterUid)
  const members = await Promise.all(memberUids.map(async (uid) => ({ uid, email: await deps.getAuthEmail(uid) })))
  return { isOwner: true, kind: plan.kind, members, partners: await findPartners(deps, plan.uids) }
}
