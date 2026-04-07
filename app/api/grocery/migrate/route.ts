// CALLER-KEYED ROUTE
/**
 * POST /api/grocery/migrate — deduplicate grocery lists by catalogId.
 * One-time migration: collapses items that share the same catalogId.
 * Safe to run multiple times (idempotent).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { deduplicateItems, type GroceryData } from '@/app/services/grocery/groceryStore'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminFirestore()
  const results: { uid: string; store?: string; standingBefore: number; standingAfter: number; pendingBefore: number; pendingAfter: number }[] = []

  // Migrate root docs (legacy shufersal)
  const rootDocs = await db.collection('groceries').get()
  for (const doc of rootDocs.docs) {
    const data = doc.data() as GroceryData
    if (!data.standingList && !data.pendingChanges) continue

    const standingBefore = data.standingList?.length ?? 0
    const pendingBefore = data.pendingChanges?.add?.length ?? 0

    let changed = false
    if (data.standingList?.length) {
      const deduped = deduplicateItems(data.standingList)
      if (deduped.length !== data.standingList.length) {
        data.standingList = deduped
        changed = true
      }
    }
    if (data.pendingChanges?.add?.length) {
      const deduped = deduplicateItems(data.pendingChanges.add)
      if (deduped.length !== data.pendingChanges.add.length) {
        data.pendingChanges.add = deduped
        changed = true
      }
    }

    if (changed) {
      data.updatedAt = new Date().toISOString()
      await doc.ref.set(data)
      results.push({
        uid: doc.id,
        standingBefore,
        standingAfter: data.standingList?.length ?? 0,
        pendingBefore,
        pendingAfter: data.pendingChanges?.add?.length ?? 0,
      })
    }
  }

  // Migrate store-specific docs
  for (const userDoc of rootDocs.docs) {
    const storesSnap = await userDoc.ref.collection('stores').get()
    for (const storeDoc of storesSnap.docs) {
      if (storeDoc.id === '_meta') continue
      const data = storeDoc.data() as GroceryData
      if (!data.standingList && !data.pendingChanges) continue

      const standingBefore = data.standingList?.length ?? 0
      const pendingBefore = data.pendingChanges?.add?.length ?? 0

      let changed = false
      if (data.standingList?.length) {
        const deduped = deduplicateItems(data.standingList)
        if (deduped.length !== data.standingList.length) {
          data.standingList = deduped
          changed = true
        }
      }
      if (data.pendingChanges?.add?.length) {
        const deduped = deduplicateItems(data.pendingChanges.add)
        if (deduped.length !== data.pendingChanges.add.length) {
          data.pendingChanges.add = deduped
          changed = true
        }
      }

      if (changed) {
        data.updatedAt = new Date().toISOString()
        await storeDoc.ref.set(data)
        results.push({
          uid: userDoc.id,
          store: storeDoc.id,
          standingBefore,
          standingAfter: data.standingList?.length ?? 0,
          pendingBefore,
          pendingAfter: data.pendingChanges?.add?.length ?? 0,
        })
      }
    }
  }

  return NextResponse.json({
    migrated: results.length,
    details: results,
  })
}
