// Wipes locally-cached data on sign-out so a different user signing into the
// same browser (e.g. a household member switching Google accounts) doesn't
// see the prior user's categories, transactions, or settings. `financeDB` is
// one global IndexedDB database for the whole browser and subjectStore is a
// single global localStorage key — neither is scoped per-uid, so both must be
// wiped explicitly rather than relying on Firebase's own sign-out.
import { db } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { partnerStore } from '@/app/stores/partnerStore'

export async function clearLocalUserState(): Promise<void> {
  subjectStore.clear()
  partnerStore.clear()
  await Promise.all(db.tables.map((table) => table.clear()))
}
