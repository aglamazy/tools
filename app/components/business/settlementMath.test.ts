import { describe, it, expect } from 'vitest'
import type { Transaction, ExpenseDocument } from '@/app/db/financeDB'
import type { Category } from '@/app/types/category'
import type { BusinessPartner, BusinessShareInvitation } from '@/app/services/businessShareService'
import { computeSettlement, resolveSettlementOwnerUid, type SettlementInput } from './settlementMath'

// aglamazo#422 — Markette's settlement tab: the owner slot is unassigned
// (business.userId unset, settings read "לא משויך"), every movement is an
// expense auto-attributed (card → account-owner mapping) to Yaakov, and the
// only other partner is a pending invite (partner record, no uid, no grant).
// The movement list showed 8 rows; the summary table and "נטו עסקי" read ₪0.

const YAAKOV = 'uid-yaakov'
const SPOUSE = 'uid-spouse'
const EXPENSE_CAT = 'Markette expenses'

const tx = (id: number, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id, syncId: `tx-${id}`, date: '2026-09-0' + ((id % 9) + 1), description: `expense ${id}`,
  amount: -amount, category: EXPENSE_CAT, cardNumber: '1234', ...extra,
} as unknown as Transaction)

const pendingPartner: BusinessPartner = {
  id: 'p-noam', ownerUid: YAAKOV, businessSyncId: 'biz-ma', businessName: 'Markette',
  email: 'noam@example.com', displayName: 'נועם', sharePercent: 50,
  createdAt: '2026-09-01', updatedAt: '2026-09-01',
}
const pendingInvite: BusinessShareInvitation = {
  id: 'inv-1', partnerId: 'p-noam', ownerUid: YAAKOV, businessSyncId: 'biz-ma', businessName: 'Markette',
  inviteeEmail: 'noam@example.com', status: 'pending', createdAt: '2026-09-01', expiresAt: '2026-10-01',
}

function marketteInput(currentUid: string): SettlementInput {
  const business = { userId: undefined, ownerSharePercent: undefined, sharedWithMe: false }
  const amounts = [50, 40, 60, 30, 70, 44, 60, 40] // 8 movements, ₪394
  return {
    business,
    ownerUid: resolveSettlementOwnerUid({
      business, grants: [], partners: [pendingPartner], invitations: [pendingInvite], currentUid,
    }),
    // Household members — what partnerStore yields with a pending invite only.
    participants: [{ uid: YAAKOV, label: 'Yaakov Aglamaz' }, { uid: SPOUSE, label: 'Spouse' }],
    shares: [],
    transactions: amounts.map((a, i) => tx(i + 1, a)),
    partnerPaidDocs: [] as ExpenseDocument[],
    ypayDocuments: [],
    ownerTaxProfile: { vatType: 'exempt' },
    accountOwners: { 'card:1234': YAAKOV },
    incomeCatNames: new Set<string>(),
    settlementCategoryByName: new Map<string, Category>(),
  }
}

describe('aglamazo#422: settlement with an unassigned owner slot + pending partner', () => {
  it('resolves the owner from the sharing records when business.userId is unset', () => {
    expect(resolveSettlementOwnerUid({
      business: { userId: undefined, sharedWithMe: false },
      grants: [], partners: [pendingPartner], invitations: [], currentUid: SPOUSE,
    })).toBe(YAAKOV)
  })

  it('falls back to the viewing user for an own (not shared-with-me) business with no sharing records', () => {
    expect(resolveSettlementOwnerUid({
      business: { userId: undefined, sharedWithMe: false },
      grants: [], partners: [], invitations: [], currentUid: YAAKOV,
    })).toBe(YAAKOV)
  })

  it('keeps an explicit business.userId', () => {
    expect(resolveSettlementOwnerUid({
      business: { userId: SPOUSE, sharedWithMe: false },
      grants: [], partners: [pendingPartner], invitations: [], currentUid: YAAKOV,
    })).toBe(SPOUSE)
  })

  it('counts the auto-attributed movements on the owner row', () => {
    const { rows } = computeSettlement(marketteInput(YAAKOV))
    expect(rows).toHaveLength(1)
    expect(rows[0].uid).toBe(YAAKOV)
    expect(rows[0].paid).toBeCloseTo(394)
    expect(rows[0].sharePercent).toBe(100)
  })

  it('computes נטו עסקי from the movements themselves', () => {
    const { businessNet } = computeSettlement(marketteInput(YAAKOV))
    expect(businessNet).toBeCloseTo(-394)
  })

  it('still reports נטו עסקי when no owner can be resolved at all', () => {
    const input = marketteInput(YAAKOV)
    input.ownerUid = undefined
    const { rows, businessNet } = computeSettlement(input)
    expect(rows).toHaveLength(0)
    expect(businessNet).toBeCloseTo(-394)
  })
})
