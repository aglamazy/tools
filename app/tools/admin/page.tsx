'use client'

import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import { getIdToken } from '@/app/services/firebaseAuthService'

type Member = {
  uid: string
  email?: string
  displayName?: string
  photoURL?: string
  role: string
}

type Account = {
  id: string
  name: string
  tier: string
  members: Member[]
}

const TIERS = [
  { value: 'free', label: 'חינם' },
  { value: 'home', label: 'בית' },
  { value: 'pro', label: 'מקצועי' },
  { value: 'owner', label: 'בעלים' },
]

const TIER_COLORS: Record<string, string> = {
  free: '#9ca3af',
  home: '#3b82f6',
  pro: '#8b5cf6',
  owner: '#f59e0b',
}

export default function AdminPage() {
  if (!userTierStore.hasAccess(UserTier.OWNER)) notFound()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchAccounts = async () => {
    try {
      setError(null)
      const token = await getIdToken()
      if (!token) {
        setError('לא מחובר')
        return
      }

      const res = await fetch('/api/admin/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'שגיאה בטעינת חשבונות')
        return
      }
      setAccounts(data.accounts)
    } catch (err: any) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const handleTierChange = async (accountId: string, newTier: string) => {
    setUpdating(accountId)
    try {
      const token = await getIdToken()
      if (!token) return

      const res = await fetch('/api/admin/promote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accountId, tier: newTier }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchAccounts()
      } else {
        setError(data.error || 'שגיאה בעדכון דרגה')
      }
    } catch (err: any) {
      setError(String(err))
    } finally {
      setUpdating(null)
    }
  }

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <h1 style={{ marginBottom: '1rem' }}>ניהול חשבונות</h1>

        {loading && <div className="banner">טוען...</div>}
        {error && <div className="banner error" style={{ color: '#dc2626', background: '#fef2f2', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>{error}</div>}

        {!loading && !error && accounts.length === 0 && (
          <div className="banner">אין חשבונות</div>
        )}

        {!loading && accounts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {accounts.map((account) => {
              const isExpanded = expandedId === account.id
              const isUpdating = updating === account.id

              return (
                <div key={account.id} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                  {/* Account row */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : account.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      background: isExpanded ? '#f8fafc' : '#fff',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {isExpanded ? '▼' : '◀'}
                    </span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{account.name}</span>
                    <span
                      style={{
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#fff',
                        background: TIER_COLORS[account.tier] || '#9ca3af',
                      }}
                    >
                      {TIERS.find(t => t.value === account.tier)?.label || account.tier}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                      {account.members.length} {account.members.length === 1 ? 'משתמש' : 'משתמשים'}
                    </span>
                    {/* Tier selector */}
                    <select
                      value={account.tier}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleTierChange(account.id, e.target.value)}
                      disabled={isUpdating}
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #d1d5db',
                        fontSize: '0.8rem',
                        cursor: isUpdating ? 'wait' : 'pointer',
                        opacity: isUpdating ? 0.5 : 1,
                      }}
                    >
                      {TIERS.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Expanded members */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8fafc', padding: '0.5rem 1rem' }}>
                      {account.members.map((member) => (
                        <div
                          key={member.uid}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.5rem 0',
                            borderBottom: '1px solid #f1f5f9',
                          }}
                        >
                          {member.photoURL ? (
                            <img
                              src={member.photoURL}
                              alt=""
                              style={{ width: 28, height: 28, borderRadius: '50%' }}
                            />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#6b7280' }}>
                              {(member.displayName || member.email || '?')[0]}
                            </div>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{member.displayName || '—'}</div>
                            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{member.email || '—'}</div>
                          </div>
                          <span style={{
                            fontSize: '0.75rem',
                            color: member.role === 'owner' ? '#f59e0b' : '#6b7280',
                            fontWeight: member.role === 'owner' ? 600 : 400,
                          }}>
                            {member.role === 'owner' ? 'בעלים' : 'חבר'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
