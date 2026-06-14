'use client'

import { useCallback, useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { getFirebaseAuth } from '@/app/lib/firebase'
import { subscribeToAuthState, type AuthUser } from '@/app/services/firebaseAuthService'
import { db } from '@/app/db/financeDB'
import { getSharedPassword, syncSharedBusiness } from '@/app/services/sharedBusinessSyncService'
import type { Business } from '@/app/db/financeDB'

type ClaimsSnapshot = {
  uid: string
  email: string | null
  emailVerified: boolean
  authTime: string | null
  expirationTime: string | null
  issuedAtTime: string | null
  signInProvider: string | null
  sharedBusinesses: unknown
  fullClaims: Record<string, unknown>
}

type BusinessRow = {
  bizSyncId: string
  localBusinessId: number | null
  localName: string | null
  hasPassword: boolean
}

export default function DebugPage() {
  // Local-only diagnostic page. Hard-404 in production builds so the route
  // never renders for real users (the bundle still ships — small cost).
  if (process.env.NODE_ENV !== 'development') notFound()

  const [snapshot, setSnapshot] = useState<ClaimsSnapshot | null>(null)
  const [bizRows, setBizRows] = useState<BusinessRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [forceRefresh, setForceRefresh] = useState(false)
  const [allBusinesses, setAllBusinesses] = useState<Business[]>([])
  const [syncing, setSyncing] = useState<string>('') // bizSyncId being synced
  const [syncResults, setSyncResults] = useState<Record<string, string>>({})
  // Wait for Firebase's onAuthStateChanged to fire before reading currentUser —
  // on first render after login the global `auth.currentUser` is still null
  // (Firebase hasn't restored the session yet). Same pattern as ProfilePage.
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => {
      setAuthUser(u)
      setAuthReady(true)
    })
    return unsub
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const auth = getFirebaseAuth()
      const u = auth.currentUser
      if (!u) {
        setSnapshot(null)
        setBizRows([])
        setError('לא מחובר — אנא התחבר ונסה שוב.')
        setLoading(false)
        return
      }
      // forceRefresh=true forces a server hit so any custom claims set
      // server-side (e.g. via /api/business-share/accept) propagate now.
      const r = await u.getIdTokenResult(forceRefresh)
      const shared = r.claims.sharedBusinesses

      const snap: ClaimsSnapshot = {
        uid: u.uid,
        email: u.email,
        emailVerified: u.emailVerified,
        authTime: r.authTime,
        expirationTime: r.expirationTime,
        issuedAtTime: r.issuedAtTime,
        signInProvider: r.signInProvider,
        sharedBusinesses: shared,
        fullClaims: r.claims as Record<string, unknown>,
      }
      setSnapshot(snap)

      // Look up local Dexie names per shared businessSyncId.
      const ids = Array.isArray(shared) ? shared.filter((x): x is string => typeof x === 'string') : []
      const allBiz = await db.businesses.toArray()
      setAllBusinesses(allBiz)
      const rows: BusinessRow[] = await Promise.all(
        ids.map(async (bizSyncId) => {
          const local = allBiz.find((b) => b.syncId === bizSyncId)
          const pwd = await getSharedPassword(bizSyncId)
          return {
            bizSyncId,
            localBusinessId: local?.id ?? null,
            localName: local?.name ?? null,
            hasPassword: !!pwd,
          }
        }),
      )
      setBizRows(rows)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [forceRefresh])

  useEffect(() => {
    if (!authReady) return
    void refresh()
  }, [authReady, authUser?.uid, refresh])

  const handleSync = useCallback(async (bizSyncId: string) => {
    setSyncing(bizSyncId)
    setSyncResults((prev) => ({ ...prev, [bizSyncId]: '⏳ מסנכרן...' }))
    try {
      const pwd = await getSharedPassword(bizSyncId)
      if (!pwd) {
        setSyncResults((prev) => ({ ...prev, [bizSyncId]: '✗ אין סיסמה' }))
        return
      }
      const result = await syncSharedBusiness(bizSyncId, pwd)
      if (result.success) {
        setSyncResults((prev) => ({ ...prev, [bizSyncId]: '✓ הצליח — רענן את הדף לראות שינויים' }))
      } else {
        setSyncResults((prev) => ({ ...prev, [bizSyncId]: `✗ ${result.errorCode || ''}: ${result.error || 'unknown'}` }))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה'
      setSyncResults((prev) => ({ ...prev, [bizSyncId]: `✗ throw: ${msg}` }))
    } finally {
      setSyncing('')
    }
  }, [])

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '1rem', direction: 'rtl' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Sync Diagnostics
      </h1>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
        מציג את ה-claims בטוקן הנוכחי + מצב הסיסמאות לסנכרון. שימושי לאבחון
        שגיאת storage/unauthorized בעת ייבוא גיבוי משותף.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={() => {
            setForceRefresh(true)
            void refresh()
          }}
          style={{
            padding: '0.4rem 0.8rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          רענון כפוי של הטוקן (force refresh)
        </button>
        <button
          onClick={() => {
            setForceRefresh(false)
            void refresh()
          }}
          style={{
            padding: '0.4rem 0.8rem',
            background: '#fff',
            color: '#475569',
            border: '1px solid #cbd5e1',
            borderRadius: '0.375rem',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          טען ללא רענון (cached)
        </button>
      </div>

      {loading && <p style={{ color: '#64748b' }}>טוען...</p>}
      {error && (
        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.375rem', color: '#991b1b', marginBottom: '1rem' }}>
          ✗ {error}
        </div>
      )}

      {snapshot && (
        <>
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>משתמש</h2>
            <table style={{ width: '100%', fontSize: '0.85rem' }}>
              <tbody>
                <Row k="uid" v={snapshot.uid} />
                <Row k="email" v={snapshot.email || '(אין)'} />
                <Row k="emailVerified" v={String(snapshot.emailVerified)} />
                <Row k="signInProvider" v={snapshot.signInProvider || '(אין)'} />
                <Row k="authTime" v={snapshot.authTime || '(אין)'} />
                <Row k="issuedAtTime" v={snapshot.issuedAtTime || '(אין)'} />
                <Row k="expirationTime" v={snapshot.expirationTime || '(אין)'} />
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              sharedBusinesses claim
            </h2>
            <div style={{ padding: '0.75rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.85rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {Array.isArray(snapshot.sharedBusinesses)
                ? snapshot.sharedBusinesses.length === 0
                  ? '(מערך ריק — אין עסקים משותפים)'
                  : (snapshot.sharedBusinesses as unknown[]).map((s, i) => (
                      <div key={i}>• {String(s)}</div>
                    ))
                : snapshot.sharedBusinesses === undefined
                  ? '(undefined — claim לא קיים על הטוקן)'
                  : JSON.stringify(snapshot.sharedBusinesses)}
            </div>
          </section>

          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              עסקים משותפים (per-business password + local match)
            </h2>
            {bizRows.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                אין רשומות. אם ה-claim ריק, יש לבדוק שה-accept-invite / partner-add באמת קרא ל-setUserClaims.
              </p>
            ) : (
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'right' }}>
                    <th style={{ padding: '0.4rem' }}>businessSyncId</th>
                    <th style={{ padding: '0.4rem' }}>local id</th>
                    <th style={{ padding: '0.4rem' }}>local name</th>
                    <th style={{ padding: '0.4rem' }}>סיסמת סנכרון</th>
                    <th style={{ padding: '0.4rem' }}>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {bizRows.map((r) => (
                    <tr key={r.bizSyncId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.4rem', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>{r.bizSyncId}</td>
                      <td style={{ padding: '0.4rem' }}>{r.localBusinessId ?? '—'}</td>
                      <td style={{ padding: '0.4rem' }}>{r.localName ?? '(לא בקצה הקאשי)'}</td>
                      <td style={{ padding: '0.4rem' }}>
                        {r.hasPassword ? '✓ קיימת' : '✗ אין (סנכרון יידחה)'}
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <button
                          onClick={() => void handleSync(r.bizSyncId)}
                          disabled={!r.hasPassword || syncing === r.bizSyncId}
                          style={{
                            padding: '0.25rem 0.6rem',
                            background: r.hasPassword ? '#3b82f6' : '#cbd5e1',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            cursor: r.hasPassword ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {syncing === r.bizSyncId ? 'מסנכרן...' : 'סנכרן עכשיו'}
                        </button>
                        {syncResults[r.bizSyncId] && (
                          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: syncResults[r.bizSyncId].startsWith('✓') ? '#16a34a' : '#dc2626' }}>
                            {syncResults[r.bizSyncId]}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              עסקים מקומיים ב-Dexie ({allBusinesses.length}) — לאיתור syncId זרים
            </h2>
            {allBusinesses.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>אין עסקים מקומיים.</p>
            ) : (
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'right' }}>
                    <th style={{ padding: '0.4rem' }}>id</th>
                    <th style={{ padding: '0.4rem' }}>שם</th>
                    <th style={{ padding: '0.4rem' }}>syncId</th>
                    <th style={{ padding: '0.4rem' }}>userId (בעלים)</th>
                  </tr>
                </thead>
                <tbody>
                  {allBusinesses.map((b) => (
                    <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.4rem' }}>{b.id}</td>
                      <td style={{ padding: '0.4rem' }}>{b.name}</td>
                      <td style={{ padding: '0.4rem', fontFamily: 'monospace', fontSize: '0.7rem', wordBreak: 'break-all' }}>{b.syncId || '—'}</td>
                      <td style={{ padding: '0.4rem', fontFamily: 'monospace', fontSize: '0.7rem', wordBreak: 'break-all' }}>{b.userId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>full claims (JSON)</h2>
            <pre style={{ padding: '0.75rem', background: '#0f172a', color: '#e2e8f0', borderRadius: '0.375rem', fontSize: '0.75rem', overflowX: 'auto', maxHeight: 300 }}>
              {JSON.stringify(snapshot.fullClaims, null, 2)}
            </pre>
          </section>
        </>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '0.3rem 0.5rem', color: '#475569', width: 160, fontFamily: 'monospace', fontSize: '0.8rem' }}>{k}</td>
      <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{v}</td>
    </tr>
  )
}
