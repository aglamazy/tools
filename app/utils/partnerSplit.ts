import type { Participant } from '@/app/stores/partnerStore'
import type { BusinessAccessGrant } from '@/app/services/businessShareService'

export type PartnerShareRow = { uid: string; label: string; sharePercent: number }

// Partners of a business = owner + active sharees, plus any participant that
// already carries its own sharePercent (a sibling partner reached via the
// partnerStore's email-resolved uids rather than a direct grant — e.g. Nadar
// from y25131's perspective). Shared by SettlementSummary.tsx (the money
// math) and ItemInvoiceModal.tsx (the per-invoice split editor, aglamazo#338)
// so both agree on exactly who counts as a partner.
export function resolvePartnerUids(
  ownerUid: string,
  shares: BusinessAccessGrant[],
  participants: Participant[],
): Set<string> {
  const shareeUids = shares.map(s => s.uid).filter((u): u is string => typeof u === 'string')
  const partnerSharedUids = participants
    .filter(p => p.uid && p.sharePercent !== undefined)
    .map(p => p.uid)
  return new Set<string>([ownerUid, ...shareeUids, ...partnerSharedUids])
}

// The business's own default split, one row per partner (owner + sharees),
// summing to 100. Owner uses business.ownerSharePercent when set, else the
// remainder after sharees.
export function resolveDefaultPartnerShares(
  ownerUid: string,
  ownerSharePercent: number | undefined,
  participants: Participant[],
  partnerUids: Set<string>,
): PartnerShareRow[] {
  const partnerParticipants = participants.filter(p => partnerUids.has(p.uid))
  const shareeShareSum = partnerParticipants
    .filter(p => p.uid !== ownerUid)
    .reduce((s, p) => s + (p.sharePercent ?? 0), 0)
  const ownerShare = ownerSharePercent ?? Math.max(0, 100 - shareeShareSum)
  return partnerParticipants.map(p => ({
    uid: p.uid,
    label: p.label,
    sharePercent: p.uid === ownerUid ? ownerShare : (p.sharePercent ?? 0),
  }))
}
