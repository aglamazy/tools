import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { resolveBusinessVatProfile, vatTypeForDate, saveTaxProfile } from '@/app/components/TaxProfileSection'
import { netOfVat } from '@/app/components/business/SettlementSummary'

// Regression test for aglamazo#302, fixed 2026-07-29 (commit 2a6b9fc): a
// sharee's device computed a different settlement balance than the owner's
// device for identical data, because getTaxProfile(ownerUid) returns {} on a
// sharee device (personal tax data is deliberately excluded from
// shared-business sync) -- every amount silently stayed GROSS there instead
// of VAT-cleaned. The fix added a fallback to the scoped
// `sharedVatProfile:{syncId}` subset written by sharedBusinessSyncService.
//
// This seeds financeDB's appSettings table to simulate the two device states
// directly (no browser/auth/UI needed) and asserts both resolve to the same
// VAT profile and the same VAT-cleaned amount for a sample transaction.

const OWNER_UID = 'owner-uid-1'
const SYNC_ID = 'biz-sync-1'
const TX_DATE = '2026-06-15'
const GROSS = 1000

async function seedOwnerDevice() {
  // Owner's own device: the real per-uid tax profile row is present (normal sync).
  await saveTaxProfile({ vatType: 'authorized' }, OWNER_UID)
}

async function seedShareeDevice() {
  // Sharee's device: no `taxProfile:{ownerUid}` row (never synced there by
  // design) -- only the scoped VAT subset written for shared businesses.
  await db.appSettings.add({
    key: `sharedVatProfile:${SYNC_ID}`,
    value: { vatType: 'authorized' },
    updatedAt: new Date().toISOString(),
  })
}

describe('#302 regression: sharee settlement parity', () => {
  beforeEach(async () => {
    await db.appSettings.clear()
  })

  afterEach(async () => {
    await db.appSettings.clear()
  })

  it('owner device and sharee device resolve to the same VAT profile', async () => {
    await seedOwnerDevice()
    const ownerProfile = await resolveBusinessVatProfile(OWNER_UID, SYNC_ID)

    await db.appSettings.clear()
    await seedShareeDevice()
    const shareeProfile = await resolveBusinessVatProfile(OWNER_UID, SYNC_ID)

    expect(shareeProfile.vatType).toBe('authorized')
    expect(shareeProfile).toEqual(ownerProfile)
  })

  it('produces identical net-of-VAT amounts on both devices for the same gross transaction', async () => {
    await seedOwnerDevice()
    const ownerProfile = await resolveBusinessVatProfile(OWNER_UID, SYNC_ID)
    const ownerNet = netOfVat(GROSS, vatTypeForDate(ownerProfile, TX_DATE))

    await db.appSettings.clear()
    await seedShareeDevice()
    const shareeProfile = await resolveBusinessVatProfile(OWNER_UID, SYNC_ID)
    const shareeNet = netOfVat(GROSS, vatTypeForDate(shareeProfile, TX_DATE))

    expect(shareeNet).toBe(ownerNet)
    // Sanity: this must actually be VAT-cleaned, not silently left GROSS
    // (the exact pre-fix symptom) -- 1000 authorized-dealer VAT-cleaned != 1000.
    expect(shareeNet).toBeLessThan(GROSS)
  })

  it('falls back to an empty (not fabricated) profile when neither row is present', async () => {
    // No taxProfile row, no sharedVatProfile row -- e.g. a business predating
    // the fix, or one where the owner has no VAT status configured at all.
    // The fix must not invent a VAT status that was never shared; both sides
    // should consistently see GROSS in this case, which is also correct
    // parity (just not VAT-cleaned parity).
    const profile = await resolveBusinessVatProfile(OWNER_UID, SYNC_ID)
    expect(profile).toEqual({})
    expect(netOfVat(GROSS, vatTypeForDate(profile, TX_DATE))).toBe(GROSS)
  })
})
