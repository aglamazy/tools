import { NextRequest, NextResponse } from 'next/server'
import { requireTc } from '@/app/lib/apiGuard'
import { loadPendingSearch, deletePendingSearch } from '@/app/services/telegram/actionExecutor'
import { addToStanding, addPendingItems } from '@/app/services/grocery/groceryStore'
import { addToStoreStanding, addStorePendingItems } from '@/app/services/grocery/groceryStoreMulti'
import { saveProductMapping } from '@/app/services/grocery/productResolver'
import { initStores } from '@/app/services/grocery/initStores'

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error

  const uid = guard.uid
  initStores()

  let body: { searchKey: string; resultIndex: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { searchKey, resultIndex } = body
  if (!searchKey || typeof resultIndex !== 'number') {
    return NextResponse.json({ success: false, error: 'Missing searchKey or resultIndex' }, { status: 400 })
  }

  try {
    const pendingSearch = await loadPendingSearch(uid, searchKey)
    if (!pendingSearch || resultIndex >= pendingSearch.results.length) {
      return NextResponse.json({ success: false, error: 'החיפוש פג תוקף' }, { status: 404 })
    }

    const selected = pendingSearch.results[resultIndex]
    const unit = selected.unitPrice?.split('/')?.pop()?.trim() || undefined
    const item = { name: selected.name, qty: pendingSearch.qty, catalogId: selected.catalogId, unit }

    if (pendingSearch.store) {
      if (pendingSearch.target === 'standing') {
        await addToStoreStanding(uid, pendingSearch.store, [item])
      } else {
        await addStorePendingItems(uid, pendingSearch.store, [item])
      }
    } else {
      if (pendingSearch.target === 'standing') {
        await addToStanding(uid, [item])
      } else {
        await addPendingItems(uid, [item])
      }
    }

    await saveProductMapping(uid, pendingSearch.query, selected.catalogId, selected.name)
    await deletePendingSearch(uid, searchKey)

    const targetLabel = pendingSearch.target === 'standing' ? 'קבועה' : 'הזמנה'
    const message = `✅ ${selected.name} (x${pendingSearch.qty}) נוסף לרשימה ${targetLabel}`

    return NextResponse.json({ success: true, message })
  } catch (err) {
    console.error('[AppChat/Select] Error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
