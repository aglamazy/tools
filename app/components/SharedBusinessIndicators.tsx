'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type Business } from '@/app/db/financeDB'
import {
  getSharedBusinessIdsFromToken,
  getSharedPassword,
  saveSharedPassword,
  syncSharedBusiness,
  deleteSharedPassword,
  dismissSharedBusiness,
  getDismissedSharedBusinessIds,
  SHARED_SYNC_STATUS_EVENT,
  type SharedSyncStatusDetail,
} from '@/app/services/sharedBusinessSyncService'
import { deriveSlugBase } from '@/app/utils/businessSlug'

type IndicatorStatus = 'no-password' | 'idle' | 'syncing' | 'ok' | 'error'

type Indicator = {
  bizSyncId: string
  shortLabel: string         // 2-letter abbreviation for the chip
  fullName: string           // tooltip text
  status: IndicatorStatus
  errorMessage?: string
}

const STATUS_COLOR: Record<IndicatorStatus, string> = {
  'no-password': '#94a3b8', // gray
  idle: '#94a3b8',
  syncing: '#3b82f6',       // blue
  ok: '#22c55e',            // green
  error: '#dc2626',         // red
}

const STATUS_TITLE: Record<IndicatorStatus, string> = {
  'no-password': 'אין סיסמה — לחץ להזין',
  idle: 'מחכה לסנכרון — לחץ להפעיל',
  syncing: 'מסנכרן…',
  ok: 'סנכרון פעיל',
  error: 'שגיאה בסנכרון — לחץ לפתוח',
}

function shortFromSyncId(syncId: string, localName: string | null): string {
  if (localName) return deriveSlugBase(localName)
  // Fallback: first two hex chars of the syncId
  return syncId.slice(0, 2).toUpperCase()
}

export default function SharedBusinessIndicators() {
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [openModalFor, setOpenModalFor] = useState<Indicator | null>(null)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)
  // Errors reported by BACKGROUND sync (CloudSyncManager → syncAllSharedBusinesses)
  // keyed by bizSyncId. Kept in a ref so the 5s poll below can merge them in
  // without recomputing status to 'ok' and clearing the red dot. (#104)
  const bgErrorsRef = useRef<Map<string, string>>(new Map())

  const loadIndicators = useCallback(async () => {
    const ids = await getSharedBusinessIdsFromToken()
    if (ids.length === 0) {
      setIndicators([])
      return
    }
    const dismissed = await getDismissedSharedBusinessIds()
    const activeIds = ids.filter((id) => !dismissed.has(id))
    if (activeIds.length === 0) {
      setIndicators([])
      return
    }
    const allBiz: Business[] = await db.businesses.toArray()
    const next = await Promise.all(
      activeIds.map(async (bizSyncId) => {
        const local = allBiz.find((b) => b.syncId === bizSyncId) ?? null
        const pwd = await getSharedPassword(bizSyncId)
        const bgError = bgErrorsRef.current.get(bizSyncId)
        const status: IndicatorStatus = !pwd
          ? 'no-password'
          : bgError
            ? 'error'
            : local
              ? 'ok'
              : 'idle'
        return {
          bizSyncId,
          shortLabel: shortFromSyncId(bizSyncId, local?.name ?? null),
          fullName: local?.name ?? `עסק משותף — ${bizSyncId.slice(0, 8)}…`,
          status,
          errorMessage: bgError,
        } satisfies Indicator
      }),
    )
    setIndicators(next)
  }, [])

  // Reload on mount + after every modal close (in case sync ran).
  useEffect(() => {
    void loadIndicators()
    // Also re-poll every 5s — sync state can change underneath us.
    const t = setInterval(() => void loadIndicators(), 5000)
    return () => clearInterval(t)
  }, [loadIndicators])

  // Listen for background-sync status so the dot turns red the moment a
  // periodic sync fails (wrong password, permission-denied) — without the user
  // having to open the modal. 'ok' clears a previously-recorded error. (#104)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SharedSyncStatusDetail>).detail
      if (!detail) return
      if (detail.status === 'error') {
        const msg = detail.error || detail.errorCode || 'שגיאה בסנכרון'
        bgErrorsRef.current.set(detail.bizSyncId, msg)
        setIndicators((prev) =>
          prev.map((i) =>
            i.bizSyncId === detail.bizSyncId ? { ...i, status: 'error' as const, errorMessage: msg } : i,
          ),
        )
      } else {
        // 'ok' or 'no-password' — a successful/again-pending sync clears the error.
        bgErrorsRef.current.delete(detail.bizSyncId)
        if (detail.status === 'ok') {
          setIndicators((prev) =>
            prev.map((i) =>
              i.bizSyncId === detail.bizSyncId && i.status === 'error'
                ? { ...i, status: 'ok' as const, errorMessage: undefined }
                : i,
            ),
          )
        }
      }
    }
    window.addEventListener(SHARED_SYNC_STATUS_EVENT, handler)
    return () => window.removeEventListener(SHARED_SYNC_STATUS_EVENT, handler)
  }, [])

  const openModal = (ind: Indicator) => {
    setOpenModalFor(ind)
    setPassword('')
    setModalError('')
  }
  const closeModal = () => {
    setOpenModalFor(null)
    setPassword('')
    setModalError('')
    setSubmitting(false)
    setShowRemoveConfirm(false)
    setRemoving(false)
  }

  const handleSubmit = async () => {
    if (!openModalFor) return
    if (!password.trim()) {
      setModalError('יש להזין סיסמה')
      return
    }
    setSubmitting(true)
    setModalError('')
    // Optimistic indicator update
    setIndicators((prev) =>
      prev.map((i) => (i.bizSyncId === openModalFor.bizSyncId ? { ...i, status: 'syncing' as const } : i)),
    )
    try {
      await saveSharedPassword(openModalFor.bizSyncId, password)
      const result = await syncSharedBusiness(openModalFor.bizSyncId, password)
      if (!result.success) {
        setIndicators((prev) =>
          prev.map((i) =>
            i.bizSyncId === openModalFor.bizSyncId
              ? { ...i, status: 'error' as const, errorMessage: result.error || result.errorCode || 'שגיאה' }
              : i,
          ),
        )
        setModalError(`סנכרון נכשל: ${result.error || result.errorCode || 'שגיאה'}`)
        setSubmitting(false)
        return
      }
      // Success — clear any background error and reload (business now in Dexie).
      bgErrorsRef.current.delete(openModalFor.bizSyncId)
      await loadIndicators()
      closeModal()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה'
      setIndicators((prev) =>
        prev.map((i) =>
          i.bizSyncId === openModalFor.bizSyncId ? { ...i, status: 'error' as const, errorMessage: msg } : i,
        ),
      )
      setModalError(`שגיאה: ${msg}`)
      setSubmitting(false)
    }
  }

  const handleRemove = async () => {
    if (!openModalFor) return
    setRemoving(true)
    try {
      const allBiz: Business[] = await db.businesses.toArray()
      const local = allBiz.find((b) => b.syncId === openModalFor.bizSyncId)
      if (local?.id != null) {
        await db.businesses.delete(local.id)
      }
      await deleteSharedPassword(openModalFor.bizSyncId)
      await dismissSharedBusiness(openModalFor.bizSyncId)
      bgErrorsRef.current.delete(openModalFor.bizSyncId)
      setIndicators((prev) => prev.filter((i) => i.bizSyncId !== openModalFor.bizSyncId))
      closeModal()
    } catch (err) {
      console.error('[SharedSync] Error removing shared business:', err)
      setRemoving(false)
    }
  }

  if (indicators.length === 0) return null

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          marginInlineEnd: '0.5rem',
        }}
      >
        {indicators.map((ind) => (
          <button
            key={ind.bizSyncId}
            onClick={() => openModal(ind)}
            title={`${ind.fullName} — ${STATUS_TITLE[ind.status]}`}
            style={{
              position: 'relative',
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '2px solid #e0e7ff',
              background: '#f8fafc',
              cursor: 'pointer',
              padding: 0,
              fontSize: '0.7rem',
              fontWeight: 600,
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label={`${ind.fullName} — ${STATUS_TITLE[ind.status]}`}
          >
            🏢
            <span style={{ position: 'absolute', bottom: -1, left: -1, fontSize: '0.55rem', fontWeight: 700, background: '#fff', borderRadius: 3, padding: '0 2px', border: '1px solid #e2e8f0', lineHeight: 1 }}>
              {ind.shortLabel}
            </span>
            <span
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: STATUS_COLOR[ind.status],
                border: '2px solid white',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }}
            />
          </button>
        ))}
      </div>

      {openModalFor && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) closeModal()
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#fff',
              width: 'min(420px, 100%)',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              direction: 'rtl',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                סיסמת סנכרון — {openModalFor.fullName}
              </h2>
              <button
                onClick={closeModal}
                disabled={submitting}
                style={{ border: 'none', background: 'transparent', fontSize: '1.3rem', cursor: submitting ? 'wait' : 'pointer', color: '#64748b' }}
                aria-label="סגור"
              >
                ×
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.75rem' }}>
              הסיסמה שהוגדרה ע״י בעל העסק לפענוח הגיבוי המשותף.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              placeholder="הזן סיסמה"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                fontSize: '0.95rem',
                marginBottom: '0.75rem',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) void handleSubmit()
              }}
            />
            {modalError && (
              <div style={{ fontSize: '0.85rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
                ✗ {modalError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '0.5rem' }}>
              <button
                onClick={closeModal}
                disabled={submitting}
                style={{ padding: '0.5rem 1rem', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: '0.375rem', cursor: submitting ? 'wait' : 'pointer', fontSize: '0.85rem' }}
              >
                ביטול
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !password.trim()}
                style={{
                  padding: '0.5rem 1.25rem',
                  border: 'none',
                  background: submitting || !password.trim() ? '#93c5fd' : '#3b82f6',
                  color: '#fff',
                  borderRadius: '0.375rem',
                  cursor: submitting || !password.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                {submitting ? 'מסנכרן…' : 'שמור וסנכרן'}
              </button>
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              {!showRemoveConfirm ? (
                <button
                  onClick={() => setShowRemoveConfirm(true)}
                  disabled={submitting || removing}
                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', padding: 0, textDecoration: 'underline' }}
                >
                  הסר גישה לעסק זה מהמכשיר
                </button>
              ) : (
                <div>
                  <p style={{ fontSize: '0.82rem', color: '#7f1d1d', marginBottom: '0.5rem', lineHeight: 1.4 }}>
                    הנתונים המסונכרנים יימחקו מהמכשיר הזה. פעולה זו לא משפיעה על נתוני הבעלים ולא מבטלת את ההרשאה.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setShowRemoveConfirm(false)}
                      disabled={removing}
                      style={{ padding: '0.4rem 0.75rem', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: '0.375rem', cursor: removing ? 'wait' : 'pointer', fontSize: '0.8rem' }}
                    >
                      ביטול
                    </button>
                    <button
                      onClick={handleRemove}
                      disabled={removing}
                      style={{ padding: '0.4rem 0.75rem', border: 'none', background: removing ? '#fca5a5' : '#dc2626', color: '#fff', borderRadius: '0.375rem', cursor: removing ? 'wait' : 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
                    >
                      {removing ? 'מסיר…' : 'כן, הסר'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
