'use client'

/**
 * Stores dashboard — one tab per registered grocery store.
 * Each tab shows four panels: time table, standing list, current-week list,
 * and product history (drag-and-drop source).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/app/components/ToastContainer'
import { subscribeToAuth } from '@/app/stores/authStore'
import { REXAIL_STORES } from '@/app/services/grocery/rexailStores'
import {
  fetchStores,
  addStanding,
  removeStanding,
  addPending,
  removePending,
  cancelOrder,
  clearPending,
  type StorePanelData,
  type HistoryEntry,
} from '@/app/services/groceryPageService'
import type { GroceryItem, GroceryItemMap } from '@/app/services/grocery/groceryTypes'
import TimeTablePanel from '@/app/components/stores/TimeTablePanel'
import ItemListPanel from '@/app/components/stores/ItemListPanel'
import HistoryPanel from '@/app/components/stores/HistoryPanel'
import OrderDetailsModal from '@/app/components/stores/OrderDetailsModal'

type DropTarget = 'standing' | 'pending' | null

export default function StoresPage() {
  const { showToast } = useToast()
  const [stores, setStores] = useState<StorePanelData[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [unauthed, setUnauthed] = useState(false)
  const [draggedItem, setDraggedItem] = useState<HistoryEntry | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [selectedOrder, setSelectedOrder] = useState<{ storeId: string; orderId: string } | null>(null)

  const refetchStores = useCallback(async () => {
    try {
      const data = await fetchStores()
      setStores(data)
    } catch (err) {
      console.log('[StoresPage] refetch failed:', err)
      showToast('error', 'שגיאה ברענון החנויות')
    }
  }, [showToast])

  useEffect(() => {
    let cancelled = false
    let fetched = false

    const unsubscribe = subscribeToAuth(({ user, initialized }) => {
      if (cancelled || !initialized) return
      if (!user) {
        // Anon users can browse the app — they just can't connect a store
        // (encrypted credentials need a real account). Show an empty state
        // with a Google sign-in CTA instead of forcing a redirect.
        setUnauthed(true)
        setLoading(false)
        return
      }
      setUnauthed(false)
      if (fetched) return
      fetched = true

      fetchStores()
        .then((data) => {
          if (cancelled) return
          setStores(data)
          setActiveId((prev) => prev ?? (data[0]?.id ?? null))
          setLoading(false)
        })
        .catch((err) => {
          if (cancelled) return
          console.log('[StoresPage] fetch failed:', err)
          setLoadError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const active = useMemo(
    () => stores?.find((s) => s.id === activeId) || null,
    [stores, activeId],
  )

  const updateActiveStore = useCallback(
    (patch: Partial<StorePanelData['data']>) => {
      if (!active) return
      setStores((prev) =>
        prev
          ? prev.map((s) =>
              s.id === active.id
                ? { ...s, data: { ...s.data, ...patch } }
                : s,
            )
          : prev,
      )
    },
    [active],
  )

  const handleDropToStanding = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDropTarget(null)
      if (!draggedItem || !active) return
      const item: GroceryItem = {
        name: draggedItem.name,
        catalogId: draggedItem.catalogId,
        unit: draggedItem.unit,
        qty: 1,
      }
      try {
        const res = await addStanding(active.id, item)
        updateActiveStore({ standingList: (res.standingList || active.data.standingList) as GroceryItemMap })
        showToast('success', `"${item.name}" נוסף לרשימה הקבועה`, '📌')
      } catch (err) {
        showToast('error', 'שגיאה בהוספה לרשימה קבועה')
        console.log('[StoresPage] addStanding failed:', err)
      } finally {
        setDraggedItem(null)
      }
    },
    [draggedItem, active, updateActiveStore, showToast],
  )

  const handleDropToPending = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDropTarget(null)
      if (!draggedItem || !active) return
      const item: GroceryItem = {
        name: draggedItem.name,
        catalogId: draggedItem.catalogId,
        unit: draggedItem.unit,
        qty: 1,
      }
      try {
        const res = await addPending(active.id, item)
        updateActiveStore({
          pendingChanges: res.pendingChanges || active.data.pendingChanges,
        })
        showToast('success', `"${item.name}" נוסף לרשימה לשבוע`, '🛒')
      } catch (err) {
        showToast('error', 'שגיאה בהוספה לרשימת השבוע')
        console.log('[StoresPage] addPending failed:', err)
      } finally {
        setDraggedItem(null)
      }
    },
    [draggedItem, active, updateActiveStore, showToast],
  )

  const handleRemoveStanding = useCallback(
    async (name: string) => {
      if (!active) return
      try {
        const res = await removeStanding(active.id, name)
        updateActiveStore({ standingList: res.standingList || {} })
      } catch (err) {
        showToast('error', 'שגיאה בהסרה')
        console.log('[StoresPage] removeStanding failed:', err)
      }
    },
    [active, updateActiveStore, showToast],
  )

  const handleRemovePending = useCallback(
    async (name: string) => {
      if (!active) return
      try {
        const res = await removePending(active.id, name)
        updateActiveStore({
          pendingChanges: res.pendingChanges || active.data.pendingChanges,
        })
      } catch (err) {
        showToast('error', 'שגיאה בהסרה')
        console.log('[StoresPage] removePending failed:', err)
      }
    },
    [active, updateActiveStore, showToast],
  )

  const handleClearPending = useCallback(async () => {
    if (!active) return
    try {
      const res = await clearPending(active.id)
      updateActiveStore({
        pendingChanges: res.pendingChanges || { add: {}, remove: {} },
      })
      showToast('success', 'רשימת השינויים נוקתה', '🧹')
    } catch (err) {
      showToast('error', 'שגיאה בניקוי הרשימה')
      console.log('[StoresPage] clearPending failed:', err)
    }
  }, [active, updateActiveStore, showToast])

  // --- Render ---

  if (loading) {
    return (
      <main className="app" dir="rtl">
        <div className="card"><p>טוען...</p></div>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="app" dir="rtl">
        <div className="card">
          <p style={{ color: '#b91c1c' }}>שגיאה בטעינה: {loadError}</p>
        </div>
      </main>
    )
  }

  if (unauthed || !stores || stores.length === 0) {
    return (
      <main className="app" dir="rtl">
        <div className="card">
          <h1>חנויות</h1>
          <p style={{ color: '#6b7280' }}>אין חנויות מוגדרות.</p>
        </div>

        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 style={{ margin: 0, marginBottom: '0.5rem' }}>חנויות זמינות</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: 0 }}>
            חנויות שאנחנו תומכים בהן. לחיצה תפתח את אתר החנות בלשונית חדשה.
            {unauthed && ' כדי לחבר אחת מהן לסוכן — התחבר בראש העמוד.'}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '0.75rem',
              marginTop: '1rem',
            }}
          >
            {REXAIL_STORES.map(s => (
              <a
                key={s.id}
                href={s.siteOrigin}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  textDecoration: 'none',
                  color: '#1f2937',
                  background: '#fff',
                  display: 'block',
                }}
              >
                <div style={{ fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>{s.description}</div>
              </a>
            ))}
          </div>
        </div>
      </main>
    )
  }

  const standingItems = active?.data.standingList || {}
  const pendingAdds = active?.data.pendingChanges?.add || {}
  const pendingRemoves = active?.data.pendingChanges?.remove || {}
  const pendingRemoveEntries = Object.values(pendingRemoves)

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header>
          <h1>חנויות</h1>
          <p>ניהול לוח זמנים, רשימה קבועה ורשימת שבוע לכל חנות</p>
        </header>

        {/* Store tabs */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            gap: '0.25rem',
            marginTop: '1rem',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          {stores.map((s) => {
            const selected = s.id === activeId
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveId(s.id)}
                style={{
                  padding: '0.55rem 1rem',
                  border: 'none',
                  borderBottom: `3px solid ${selected ? '#2563eb' : 'transparent'}`,
                  background: 'transparent',
                  color: selected ? '#1e3a8a' : '#4b5563',
                  fontWeight: selected ? 600 : 500,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  marginBottom: '-1px',
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>

        {active && (() => {
          const selectedStore = selectedOrder
            ? stores.find((s) => s.id === selectedOrder.storeId) || null
            : null
          const selectedStoreOrder =
            selectedOrder && selectedStore
              ? selectedStore.activeOrders?.find((o) => o.orderId === selectedOrder.orderId) || null
              : null
          return (
            <>
          <div
            style={{
              marginTop: '1rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* Time table */}
            <section style={panelStyle}>
              <h2 style={panelHeaderStyle}>לוח זמנים</h2>
              <TimeTablePanel
                schedule={active.data.schedule}
                activeOrder={active.activeOrders?.[0] || null}
                onOrderClick={(orderId) =>
                  setSelectedOrder({ storeId: active.id, orderId })
                }
              />
            </section>

            {/* Standing list (drop target) */}
            <section style={panelStyle}>
              <h2 style={panelHeaderStyle}>
                רשימה קבועה
                <span style={badgeStyle('#2563eb')}>{Object.keys(standingItems).length}</span>
              </h2>
              <ItemListPanel
                items={standingItems}
                emptyText="אין פריטים קבועים. גרור מההיסטוריה."
                dropAccentColor="#2563eb"
                isDragOver={dropTarget === 'standing'}
                onDragOver={() => setDropTarget('standing')}
                onDragLeave={() => setDropTarget((t) => (t === 'standing' ? null : t))}
                onDrop={handleDropToStanding}
                onRemove={handleRemoveStanding}
              />
            </section>

            {/* Current week (drop target) */}
            <section style={panelStyle}>
              <h2 style={panelHeaderStyle}>
                רשימה לשבוע
                <span style={badgeStyle('#d97706')}>{Object.keys(pendingAdds).length}</span>
                {(Object.keys(pendingAdds).length > 0 || pendingRemoveEntries.length > 0) && (
                  <button
                    onClick={handleClearPending}
                    title="נקה את כל השינויים שאינם קבועים"
                    style={{
                      marginInlineStart: 'auto',
                      fontSize: '0.72rem',
                      padding: '0.2rem 0.5rem',
                      background: 'transparent',
                      color: '#6b7280',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    🧹 נקה
                  </button>
                )}
              </h2>
              <ItemListPanel
                items={Object.fromEntries(Object.entries(pendingAdds).map(([k, e]) => [k, e.item]))}
                validTo={Object.fromEntries(Object.entries(pendingAdds).map(([k, e]) => [k, e.validTo]))}
                emptyText="אין פריטים לשבוע. גרור מההיסטוריה."
                dropAccentColor="#d97706"
                isDragOver={dropTarget === 'pending'}
                onDragOver={() => setDropTarget('pending')}
                onDragLeave={() => setDropTarget((t) => (t === 'pending' ? null : t))}
                onDrop={handleDropToPending}
                onRemove={handleRemovePending}
                footer={
                  pendingRemoveEntries.length > 0 ? (
                    <div
                      style={{
                        marginTop: '0.4rem',
                        padding: '0.4rem 0.5rem',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        color: '#991b1b',
                      }}
                    >
                      דילוג השבוע: {pendingRemoveEntries.map(e => e.validTo ? `${e.name} (עד ${formatValidToShort(e.validTo)})` : e.name).join(', ')}
                    </div>
                  ) : null
                }
              />
            </section>

            {/* Product history (drag source) */}
            <section style={panelStyle}>
              <h2 style={panelHeaderStyle}>
                היסטוריית מוצרים
                <span style={badgeStyle('#6b7280')}>{active.history.length}</span>
              </h2>
              <HistoryPanel
                history={active.history}
                historyError={active.historyError}
                onDragStart={setDraggedItem}
                onDragEnd={() => {
                  setDraggedItem(null)
                  setDropTarget(null)
                }}
              />
            </section>
          </div>

          {selectedOrder && selectedStore && selectedStoreOrder && (
            <OrderDetailsModal
              order={selectedStoreOrder}
              storeLabel={selectedStore.label}
              onClose={() => setSelectedOrder(null)}
              onCancel={async () => {
                try {
                  await cancelOrder(selectedOrder.storeId, selectedOrder.orderId)
                  showToast('success', 'הזמנה בוטלה', '✅')
                  setSelectedOrder(null)
                  await refetchStores()
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err)
                  console.log('[StoresPage] cancelOrder failed:', err)
                  showToast('error', `ביטול נכשל: ${msg}`)
                  throw err
                }
              }}
            />
          )}
            </>
          )
        })()}
      </div>
    </main>
  )
}

const panelStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '0.625rem',
  padding: '0.875rem',
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  minHeight: '260px',
}

const panelHeaderStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 600,
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

function badgeStyle(color: string): React.CSSProperties {
  return {
    fontSize: '0.7rem',
    background: color,
    color: '#fff',
    padding: '0.1rem 0.45rem',
    borderRadius: '1rem',
    fontWeight: 600,
  }
}

/** "2026-05-05" or ISO datetime → "05/05" for compact display. */
function formatValidToShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}
