// Pure settlement math for SettlementSummary.tsx — no React, no Dexie, so the
// summary table and the "נטו עסקי" line can be tested directly against the
// data shapes that broke them (aglamazo#422).

import type { Transaction, Business, ExpenseDocument, YpayDocument } from '@/app/db/financeDB'
import type { Participant } from '@/app/stores/partnerStore'
import type { BusinessAccessGrant, BusinessPartner, BusinessShareInvitation } from '@/app/services/businessShareService'
import type { AccountOwners } from '@/app/stores/appSettingsStore'
import type { Category } from '@/app/types/category'
import { vatTypeForDate, type TaxProfile } from '@/app/components/TaxProfileSection'
import { VAT_RATE_AUTHORIZED_DEALER, type VatType } from '@/app/lib/vat'
import { getTransactionAttributedUid } from '@/app/utils/transactionAttribution'
import { resolvePartnerUids, resolveDefaultPartnerShares } from '@/app/utils/partnerSplit'

export type SettlementRow = {
  uid: string
  label: string
  sharePercent: number
  paid: number // regular business expenses only — settlement transfers shown separately
  received: number // regular business income only — settlement transfers shown separately
  settlementPaid: number // קיזוז/transfer categories this partner personally paid
  settlementReceived: number // amount credited via another partner's transfer-to-them
  netActual: number
  fairShare: number
  balance: number
  vatType: VatType | undefined
}

export function netOfVat(gross: number, vatType: VatType | undefined): number {
  return vatType === 'authorized' ? gross / (1 + VAT_RATE_AUTHORIZED_DEALER) : gross
}

/**
 * Who is the owner side of this business's partnership.
 *
 * `business.userId` is the optional "assign to a household member" field in
 * the business settings — a business created without that assignment has no
 * userId at all (the settings' owner slot reads "לא משויך"). The partnership
 * itself still has an owner: every sharing record for the business (partner,
 * invitation, grant) carries the `ownerUid` of the user who shares it, and a
 * business that isn't `sharedWithMe` is owned by the user viewing it.
 */
export function resolveSettlementOwnerUid(input: {
  business: Pick<Business, 'userId' | 'sharedWithMe'>
  grants: Pick<BusinessAccessGrant, 'ownerUid'>[]
  partners: Pick<BusinessPartner, 'ownerUid'>[]
  invitations: Pick<BusinessShareInvitation, 'ownerUid'>[]
  currentUid: string | undefined
}): string | undefined {
  const { business, grants, partners, invitations, currentUid } = input
  if (business.userId) return business.userId
  const fromSharing = [...grants, ...partners, ...invitations].find(r => !!r.ownerUid)?.ownerUid
  if (fromSharing) return fromSharing
  if (!business.sharedWithMe) return currentUid
  return undefined
}

export type PartnerResolution = {
  ownerUid: string
  partnerUids: Set<string>
  toPartnerUid: (uid: string | undefined) => string
}

export function buildPartnerResolution(
  ownerUid: string | undefined,
  shares: BusinessAccessGrant[],
  participants: Participant[],
): PartnerResolution | null {
  if (!ownerUid) return null
  // Partners of THIS business = owner + active sharees only. Household-only
  // members (e.g., a spouse who isn't a sharee here) aren't partners — their
  // attributed txs collapse to the owner side. Shared with ItemInvoiceModal
  // (aglamazo#338's per-invoice split editor) so both agree on who counts.
  const partnerUids = resolvePartnerUids(ownerUid, shares, participants)
  const toPartnerUid = (uid: string | undefined): string => {
    if (uid && partnerUids.has(uid)) return uid
    return ownerUid
  }
  return { ownerUid, partnerUids, toPartnerUid }
}

export type SettlementInput = {
  business: Pick<Business, 'ownerSharePercent'>
  /** From resolveSettlementOwnerUid — never read business.userId directly. */
  ownerUid: string | undefined
  participants: Participant[]
  shares: BusinessAccessGrant[]
  transactions: Transaction[]
  partnerPaidDocs: ExpenseDocument[]
  ypayDocuments: YpayDocument[]
  ownerTaxProfile: TaxProfile
  accountOwners: AccountOwners
  incomeCatNames: Set<string>
  settlementCategoryByName: Map<string, Category>
}

export type SettlementResult = {
  rows: SettlementRow[]
  /** Business-level net (income − regular expenses, VAT-cleaned, no קיזוז). */
  businessNet: number
}

export function computeSettlement(input: SettlementInput): SettlementResult {
  const {
    business, participants, shares, transactions, partnerPaidDocs, ypayDocuments,
    ownerTaxProfile, accountOwners, incomeCatNames, settlementCategoryByName,
  } = input
  // The owner comes from resolveSettlementOwnerUid, NOT business.userId
  // directly — an unassigned owner slot used to null the resolution and
  // collapse the whole table + "נטו עסקי" to ₪0 (aglamazo#422).
  const resolution = buildPartnerResolution(input.ownerUid, shares, participants)
  const ownerUid = resolution?.ownerUid
  const toPartnerUid = (uid: string | undefined): string | undefined => resolution?.toPartnerUid(uid)
  const partnerParticipants = resolution ? participants.filter(p => resolution.partnerUids.has(p.uid)) : []

  const defaultShareRows = resolution
    ? resolveDefaultPartnerShares(resolution.ownerUid, business.ownerSharePercent, participants, resolution.partnerUids)
    : []
  const defaultShareByUid = new Map<string, number>(defaultShareRows.map(r => [r.uid, r.sharePercent]))

  // A per-invoice split override (aglamazo#338) lives on the INVOICE, not
  // the receipt that eventually closes it — one invoice can be settled by
  // several receipts over time, so the receipt is the wrong place to ask
  // "what split applies here" (spec 3.1). So for an income transaction:
  // find the receipt created for it (matched by transactionId), then the
  // invoice(s) that receipt's closesAllocations point at, then THAT
  // invoice's own override — weighted by each allocation's share of the
  // receipt if it closes more than one at once.
  const receiptByTxSyncId = new Map<string, YpayDocument>()
  for (const d of ypayDocuments) {
    if (d.transactionId) receiptByTxSyncId.set(d.transactionId, d)
  }
  // Per-invoice override rows already sum to 100 across every partner by
  // construction (ItemInvoiceModal.tsx's editor enforces it) — no owner/
  // remainder computation needed here, just read the array as a map.
  const invoiceOverrideBySyncId = new Map<string, Map<string, number>>()
  for (const d of ypayDocuments) {
    if (d.syncId && d.partnerSplitOverride) {
      invoiceOverrideBySyncId.set(d.syncId, new Map(d.partnerSplitOverride.map(r => [r.uid, r.sharePercent])))
    }
  }
  const splitFractionsForTx = (
    txSyncId: string | undefined,
  ): { shareMap: Map<string, number>; fraction: number }[] => {
    const receipt = txSyncId ? receiptByTxSyncId.get(txSyncId) : undefined
    const allocations = receipt?.closesAllocations
    const totalAlloc = allocations?.reduce((s, a) => s + a.amount, 0) ?? 0
    if (!allocations || allocations.length === 0 || totalAlloc <= 0) {
      return [{ shareMap: defaultShareByUid, fraction: 1 }]
    }
    return allocations.map(a => {
      const override = invoiceOverrideBySyncId.get(a.docId)
      return {
        shareMap: override ?? defaultShareByUid,
        fraction: a.amount / totalAlloc,
      }
    })
  }

  // VAT-clean: owner's status can change mid-year (vatConversion on file) —
  // a transaction predating the conversion must use the OLD status, not
  // whatever the owner is today, so this is date-aware rather than a single
  // snapshot value. Sharees default to 'exempt' until per-partner VAT
  // plumbing is added (TODO: extend partnerStore to surface vatType).
  // With no resolvable owner, every movement is the business's own — use its
  // (owner's) VAT profile rather than silently treating it as a sharee's.
  const vatTypeAt = (uid: string | undefined, date: string): VatType | undefined =>
    !ownerUid || uid === ownerUid ? vatTypeForDate(ownerTaxProfile, date) : 'exempt'
  // Current status only — for the summary table's "סטטוס מע״מ" badge, not money math.
  const currentVatTypeOf = (uid: string): VatType | undefined =>
    uid === ownerUid ? ownerTaxProfile.vatType : 'exempt'

  // Per-partner accumulators, built in ONE pass over transactions instead
  // of once per partner — needed because fair share is no longer a single
  // multiplication over the total pool (totalNet * sharePercent): a
  // per-invoice override means different income items can split at
  // different ratios, so each item now contributes to every partner's
  // fairShare individually, at whatever ratio applies to that item.
  // Mathematically this reduces to the old totalNet*sharePercent formula
  // exactly when no overrides exist — settlement-category transfers are
  // symmetric (one partner's settlementPaid = another's settlementReceived
  // for the same amount) so they cancel to zero across partners either way.
  const paidByUid = new Map<string, number>()
  const receivedByUid = new Map<string, number>()
  const settlementPaidByUid = new Map<string, number>()
  const settlementReceivedByUid = new Map<string, number>()
  const netActualByUid = new Map<string, number>()
  const fairShareByUid = new Map<string, number>()
  const add = (m: Map<string, number>, uid: string | undefined, v: number) => {
    if (uid !== undefined) m.set(uid, (m.get(uid) ?? 0) + v)
  }
  // Business-level net: accumulated per movement, independent of whether the
  // movement's partner has a row in the table (aglamazo#422).
  let businessNet = 0
  const addFairShare = (shareMap: Map<string, number>, signedNet: number) => {
    for (const [uid, pct] of shareMap) add(fairShareByUid, uid, signedNet * (pct / 100))
  }

  for (const t of transactions) {
    const attributedUid = getTransactionAttributedUid(t, accountOwners, ownerUid)
    const partnerUid = toPartnerUid(attributedUid)
    const gross = Math.abs(t.amount)
    const isIncome = incomeCatNames.has(t.category ?? '')
    const settlementCat = !isIncome ? settlementCategoryByName.get(t.category ?? '') : undefined
    // Settlement transfers aren't a taxable event — use the raw amount,
    // not VAT-cleaned, so both sides of the transfer show the same number
    // regardless of either partner's own VAT status.
    const txVatType = vatTypeAt(partnerUid, t.date)

    if (isIncome) {
      const net = netOfVat(gross, txVatType)
      businessNet += net
      add(receivedByUid, partnerUid, net)
      add(netActualByUid, partnerUid, net)
      for (const { shareMap, fraction } of splitFractionsForTx(t.syncId)) {
        addFairShare(shareMap, net * fraction)
      }
    } else if (settlementCat) {
      add(settlementPaidByUid, partnerUid, gross)
      add(netActualByUid, partnerUid, -gross)
      if (settlementCat.settlementPartnerUid) {
        const recvUid = toPartnerUid(settlementCat.settlementPartnerUid)
        add(settlementReceivedByUid, recvUid, gross)
        add(netActualByUid, recvUid, gross)
      }
      // Settlement transfers don't touch fairShare — they cancel across
      // partners either way (see comment above the accumulators).
    } else {
      const net = netOfVat(gross, txVatType)
      businessNet -= net
      add(paidByUid, partnerUid, net)
      add(netActualByUid, partnerUid, -net)
      // No per-invoice override on the expense side today — always default split.
      addFairShare(defaultShareByUid, -net)
    }
  }

  // Partner-paid invoices (no bank tx) always count as expense, attributed
  // by paidByUid directly. VAT-cleaned with the date-aware vatType.
  for (const d of partnerPaidDocs) {
    const partnerUid = toPartnerUid(d.paidByUid)
    const net = netOfVat(Math.abs(d.amount ?? 0), vatTypeAt(partnerUid, d.date || ''))
    businessNet -= net
    add(paidByUid, partnerUid, net)
    add(netActualByUid, partnerUid, -net)
    addFairShare(defaultShareByUid, -net)
  }

  const rows = partnerParticipants.map(p => {
    const netActual = netActualByUid.get(p.uid) ?? 0
    const fairShare = fairShareByUid.get(p.uid) ?? 0
    return {
      uid: p.uid, label: p.label, sharePercent: defaultShareByUid.get(p.uid) ?? 0,
      paid: paidByUid.get(p.uid) ?? 0, received: receivedByUid.get(p.uid) ?? 0,
      settlementPaid: settlementPaidByUid.get(p.uid) ?? 0, settlementReceived: settlementReceivedByUid.get(p.uid) ?? 0,
      netActual, fairShare, balance: netActual - fairShare, vatType: currentVatTypeOf(p.uid),
    }
  })
  return { rows, businessNet }
}
