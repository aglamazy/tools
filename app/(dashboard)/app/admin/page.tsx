'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import { getIdToken } from '@/app/services/firebaseAuthService'
import { subscribeToAuth } from '@/app/stores/authStore'
import SettingsTabs from '@/app/components/settings/SettingsTabs'
import RichEditor from '@/app/components/ui/RichEditor'
import TaxSettingsPanel, { type TaxRateYear, type TaxRateYearDraft, type IncomeTaxStep, rateYearToDraft, incomeTaxStepsToDraft } from './TaxSettingsPanel'
import SystemSettingsPanel from './SystemSettingsPanel'

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
  tier: UserTier
  isLifetime: boolean
  members: Member[]
}

type Provision = {
  email: string
  tier: UserTier
  isLifetime: boolean
  createdAt: string | null
  createdBy: string
  claimedAt: string | null
  claimedBy: string | null
}

const TIERS: { value: UserTier; label: string }[] = [
  { value: UserTier.FREE, label: 'חינם' },
  { value: UserTier.HOME, label: 'בית' },
  { value: UserTier.PRO, label: 'מקצועי' },
  { value: UserTier.OWNER, label: 'בעלים' },
]

const TIER_COLORS: Record<UserTier, string> = {
  [UserTier.FREE]: '#9ca3af',
  [UserTier.HOME]: '#3b82f6',
  [UserTier.PRO]: '#8b5cf6',
  [UserTier.OWNER]: '#f59e0b',
}

export default function AdminPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const [provisions, setProvisions] = useState<Provision[]>([])
  const [provisionEmail, setProvisionEmail] = useState('')
  const [provisionTier, setProvisionTier] = useState<UserTier>(UserTier.PRO)
  const [provisionLifetime, setProvisionLifetime] = useState(false)
  const [provisionLoading, setProvisionLoading] = useState(false)
  const [provisionError, setProvisionError] = useState<string | null>(null)
  const [provisionSuccess, setProvisionSuccess] = useState(false)

  const [exemptLimit, setExemptLimit] = useState<{ amount: number; sinceYear: number } | null>(null)
  const [exemptLimitDraft, setExemptLimitDraft] = useState({ amount: '', sinceYear: '' })
  const [exemptLimitSaved, setExemptLimitSaved] = useState(false)

  const [taxLimit, setTaxLimit] = useState<{ amount: number; sinceYear: number } | null>(null)
  const [taxLimitDraft, setTaxLimitDraft] = useState({ amount: '', sinceYear: '' })
  const [taxLimitSaved, setTaxLimitSaved] = useState(false)

  const [taxRates, setTaxRates] = useState<Record<string, TaxRateYear>>({})
  const [taxRateDrafts, setTaxRateDrafts] = useState<Record<string, TaxRateYearDraft>>({})
  const [taxRateSaved, setTaxRateSaved] = useState<string | null>(null)
  const [newRateYear, setNewRateYear] = useState('')

  const [incomeTaxBrackets, setIncomeTaxBrackets] = useState<Record<string, IncomeTaxStep[]>>({})
  const [incomeTaxDrafts, setIncomeTaxDrafts] = useState<Record<string, { upTo: string; rate: string }[]>>({})
  const [incomeTaxSaved, setIncomeTaxSaved] = useState<string | null>(null)
  const [newIncomeTaxYear, setNewIncomeTaxYear] = useState('')

  const [tcVersions, setTcVersions] = useState<{ version: string; text: string }[]>([])
  const [tcDraft, setTcDraft] = useState('')
  const [tcSaving, setTcSaving] = useState(false)
  const [tcSaved, setTcSaved] = useState(false)

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

  const fetchTcVersions = async () => {
    try {
      const token = await getIdToken()
      if (!token) return
      const res = await fetch('/api/admin/tc', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setTcVersions(data.versions)
        if (data.versions.length > 0) {
          setTcDraft(data.versions[0].text)
        }
      }
    } catch { /* non-blocking */ }
  }

  const fetchProvisions = async () => {
    try {
      const token = await getIdToken()
      if (!token) return

      const res = await fetch('/api/admin/provisions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setProvisions(data.provisions)
      }
    } catch { /* non-blocking */ }
  }

  useEffect(() => {
    let fetched = false
    const unsubAuth = subscribeToAuth((authState) => {
      if (authState.initialized && !authState.user) {
        setAuthorized(false)
        router.replace('/')
      }
    })
    const unsubTier = userTierStore.subscribe((tier) => {
      if (fetched) return
      if (tier === UserTier.FREE) return // Still loading or unauthorized
      fetched = true
      if (!userTierStore.hasAccess(UserTier.OWNER)) {
        router.replace('/')
        return
      }
      setAuthorized(true)
      fetchAccounts()
      fetchProvisions()
      fetchTcVersions()
      getIdToken().then(async (token) => {
        if (!token) return
        try {
          const res = await fetch('/api/admin/tax-settings', {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) return
          const data = await res.json()
          const limits = data.taxLimits || null
          setTaxLimit(limits)
          if (limits) {
            setTaxLimitDraft({ amount: String(limits.amount), sinceYear: String(limits.sinceYear) })
          }

          const el = data.exemptLimit || null
          setExemptLimit(el)
          if (el) {
            setExemptLimitDraft({ amount: String(el.amount), sinceYear: String(el.sinceYear) })
          }

          const rates = (data.taxRates || {}) as Record<string, TaxRateYear>
          setTaxRates(rates)
          const rateDrafts: Record<string, TaxRateYearDraft> = {}
          for (const [y, v] of Object.entries(rates)) {
            rateDrafts[y] = rateYearToDraft(v)
          }
          setTaxRateDrafts(rateDrafts)

          const itBrackets = (data.incomeTaxBrackets || {}) as Record<string, IncomeTaxStep[]>
          setIncomeTaxBrackets(itBrackets)
          const itDrafts: Record<string, { upTo: string; rate: string }[]> = {}
          for (const [y, v] of Object.entries(itBrackets)) {
            itDrafts[y] = incomeTaxStepsToDraft(v)
          }
          setIncomeTaxDrafts(itDrafts)
        } catch (err) {
          console.error('Failed to load tax settings:', err)
        }
      })
    })
    return () => { unsubAuth(); unsubTier() }
  }, [])

  const handleTierChange = async (accountId: string, newTier: UserTier) => {
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

  const handleLifetimeToggle = async (accountId: string, currentTier: UserTier, currentLifetime: boolean) => {
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
        body: JSON.stringify({ accountId, tier: currentTier, isLifetime: !currentLifetime }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchAccounts()
      } else {
        setError(data.error || 'שגיאה בעדכון')
      }
    } catch (err: any) {
      setError(String(err))
    } finally {
      setUpdating(null)
    }
  }

  const handleCreateProvision = async (e: React.FormEvent) => {
    e.preventDefault()
    setProvisionLoading(true)
    setProvisionError(null)
    setProvisionSuccess(false)

    try {
      const token = await getIdToken()
      if (!token) {
        setProvisionError('לא מחובר')
        return
      }

      const res = await fetch('/api/admin/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: provisionEmail, tier: provisionTier, isLifetime: provisionLifetime }),
      })
      const data = await res.json()
      if (data.success) {
        setProvisionEmail('')
        setProvisionTier(UserTier.PRO)
        setProvisionLifetime(false)
        setProvisionSuccess(true)
        await fetchProvisions()
      } else {
        setProvisionError(data.error || 'שגיאה ביצירת חשבון')
      }
    } catch (err: any) {
      setProvisionError(String(err))
    } finally {
      setProvisionLoading(false)
    }
  }

  const tierPill = (tier: UserTier) => (
    <span
      style={{
        padding: '0.15rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: '#fff',
        background: TIER_COLORS[tier] || '#9ca3af',
      }}
    >
      {TIERS.find(t => t.value === tier)?.label || tier}
    </span>
  )

  const lifetimeBadge = (
    <span
      style={{
        padding: '0.15rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: '#fff',
        background: '#16a34a',
      }}
    >
      לכל החיים
    </span>
  )

  if (!authorized) return null

  const adminTabs = [
    { id: 'accounts', label: 'חשבונות', icon: '👥' },
    { id: 'provisions', label: 'הזמנות', icon: '📨' },
    { id: 'tc', label: 'תנאי שימוש', icon: '📜' },
    { id: 'taxes', label: 'מיסים', icon: '🧾' },
    { id: 'system', label: 'מערכת', icon: '⚙️' },
  ]

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <h1 style={{ marginBottom: '1rem' }}>ניהול</h1>
        <SettingsTabs tabs={adminTabs} defaultTab="accounts">
          {(activeTab) => (
            <>
              {activeTab === 'accounts' && (
                <>
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
                              {tierPill(account.tier)}
                              {account.isLifetime && lifetimeBadge}
                              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                {account.members.length} {account.members.length === 1 ? 'משתמש' : 'משתמשים'}
                              </span>
                              <select
                                value={account.tier}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleTierChange(account.id, e.target.value as UserTier)}
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
                              <button
                                onClick={(e) => { e.stopPropagation(); handleLifetimeToggle(account.id, account.tier, account.isLifetime) }}
                                disabled={isUpdating}
                                style={{
                                  padding: '0.2rem 0.5rem',
                                  fontSize: '0.75rem',
                                  border: '1px solid',
                                  borderRadius: '0.375rem',
                                  cursor: isUpdating ? 'wait' : 'pointer',
                                  opacity: isUpdating ? 0.5 : 1,
                                  background: account.isLifetime ? '#fef2f2' : '#f0fdf4',
                                  color: account.isLifetime ? '#dc2626' : '#16a34a',
                                  borderColor: account.isLifetime ? '#fca5a5' : '#86efac',
                                }}
                              >
                                {account.isLifetime ? 'בטל לכל החיים' : 'קבע לכל החיים'}
                              </button>
                            </div>

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
                </>
              )}

              {activeTab === 'provisions' && (
                <>
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', background: '#f8fafc' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>יצירת חשבון</h2>
                    <form onSubmit={handleCreateProvision}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="email"
                          dir="ltr"
                          placeholder="כתובת אימייל"
                          value={provisionEmail}
                          onChange={(e) => setProvisionEmail(e.target.value)}
                          required
                          style={{
                            flex: 1,
                            minWidth: '200px',
                            padding: '0.4rem 0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            fontSize: '0.9rem',
                          }}
                        />
                        <select
                          value={provisionTier}
                          onChange={(e) => setProvisionTier(e.target.value as UserTier)}
                          style={{
                            padding: '0.4rem 0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            fontSize: '0.9rem',
                          }}
                        >
                          {TIERS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={provisionLifetime}
                            onChange={(e) => setProvisionLifetime(e.target.checked)}
                          />
                          לכל החיים
                        </label>
                        <button
                          type="submit"
                          disabled={provisionLoading}
                          style={{
                            padding: '0.4rem 1rem',
                            background: '#2563eb',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.375rem',
                            fontSize: '0.9rem',
                            cursor: provisionLoading ? 'wait' : 'pointer',
                            opacity: provisionLoading ? 0.6 : 1,
                          }}
                        >
                          צור חשבון
                        </button>
                      </div>
                    </form>
                    {provisionSuccess && (
                      <div style={{ marginTop: '0.5rem', color: '#16a34a', fontSize: '0.85rem' }}>החשבון נוצר בהצלחה</div>
                    )}
                    {provisionError && (
                      <div style={{ marginTop: '0.5rem', color: '#dc2626', fontSize: '0.85rem' }}>{provisionError}</div>
                    )}
                  </div>

                  {provisions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {provisions.map((prov) => (
                        <div
                          key={prov.email}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.6rem 1rem',
                            border: '1px solid #e5e7eb',
                            borderRadius: '0.5rem',
                            background: '#fff',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ flex: 1, fontSize: '0.9rem', direction: 'ltr', textAlign: 'right' }}>{prov.email}</span>
                          {tierPill(prov.tier)}
                          {prov.isLifetime && lifetimeBadge}
                          <span
                            style={{
                              padding: '0.15rem 0.5rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: prov.claimedAt ? '#16a34a' : '#6b7280',
                              background: prov.claimedAt ? '#dcfce7' : '#f3f4f6',
                            }}
                          >
                            {prov.claimedAt ? 'מומש' : 'ממתין'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {provisions.length === 0 && (
                    <div className="banner">אין הזמנות ממתינות</div>
                  )}
                </>
              )}

              {activeTab === 'tc' && (
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>עריכת תנאי שימוש</h2>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                    כל שמירה יוצרת גרסה חדשה (לפי תאריך). משתמשים שאישרו גרסה ישנה יתבקשו לאשר מחדש.
                  </p>
                  <RichEditor
                    value={tcDraft}
                    onChange={(html) => { setTcDraft(html); setTcSaved(false) }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
                    <button
                      onClick={async () => {
                        if (!tcDraft.trim()) return
                        setTcSaving(true)
                        setTcSaved(false)
                        try {
                          const token = await getIdToken()
                          const res = await fetch('/api/admin/tc', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({ text: tcDraft }),
                          })
                          const data = await res.json()
                          if (data.success) {
                            setTcSaved(true)
                            await fetchTcVersions()
                          }
                        } catch { /* */ }
                        setTcSaving(false)
                      }}
                      disabled={tcSaving || !tcDraft.trim() || (tcVersions.length > 0 && tcDraft === tcVersions[0].text)}
                      style={{
                        padding: '0.4rem 1.25rem',
                        background: tcSaving || !tcDraft.trim() || (tcVersions.length > 0 && tcDraft === tcVersions[0].text) ? '#e5e7eb' : '#2563eb',
                        color: tcSaving || !tcDraft.trim() || (tcVersions.length > 0 && tcDraft === tcVersions[0].text) ? '#9ca3af' : '#fff',
                        border: 'none',
                        borderRadius: '0.375rem',
                        fontSize: '0.9rem',
                        cursor: tcSaving ? 'wait' : 'pointer',
                      }}
                    >
                      {tcSaving ? 'שומר...' : 'שמור גרסה חדשה'}
                    </button>
                    {tcSaved && <span style={{ fontSize: '0.85rem', color: '#16a34a' }}>נשמר בהצלחה</span>}
                  </div>

                  {tcVersions.length > 0 && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>היסטוריית גרסאות</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {tcVersions.map((v, i) => (
                          <div
                            key={v.version}
                            style={{
                              padding: '0.6rem 1rem',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.5rem',
                              background: i === 0 ? '#eff6ff' : '#fff',
                              cursor: 'pointer',
                            }}
                            onClick={() => { setTcDraft(v.text); setTcSaved(false) }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{v.version}</span>
                              {i === 0 && (
                                <span style={{
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  color: '#fff',
                                  background: '#16a34a',
                                }}>
                                  פעילה
                                </span>
                              )}
                            </div>
                            <p style={{
                              fontSize: '0.8rem',
                              color: '#64748b',
                              marginTop: '0.25rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '100%',
                            }}>
                              {v.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'taxes' && (
                <TaxSettingsPanel
                  exemptLimit={exemptLimit} setExemptLimit={setExemptLimit}
                  exemptLimitDraft={exemptLimitDraft} setExemptLimitDraft={setExemptLimitDraft}
                  exemptLimitSaved={exemptLimitSaved} setExemptLimitSaved={setExemptLimitSaved}
                  taxLimit={taxLimit} setTaxLimit={setTaxLimit}
                  taxLimitDraft={taxLimitDraft} setTaxLimitDraft={setTaxLimitDraft}
                  taxLimitSaved={taxLimitSaved} setTaxLimitSaved={setTaxLimitSaved}
                  taxRates={taxRates} setTaxRates={setTaxRates}
                  taxRateDrafts={taxRateDrafts} setTaxRateDrafts={setTaxRateDrafts}
                  taxRateSaved={taxRateSaved} setTaxRateSaved={setTaxRateSaved}
                  newRateYear={newRateYear} setNewRateYear={setNewRateYear}
                  incomeTaxBrackets={incomeTaxBrackets} setIncomeTaxBrackets={setIncomeTaxBrackets}
                  incomeTaxDrafts={incomeTaxDrafts} setIncomeTaxDrafts={setIncomeTaxDrafts}
                  incomeTaxSaved={incomeTaxSaved} setIncomeTaxSaved={setIncomeTaxSaved}
                  newIncomeTaxYear={newIncomeTaxYear} setNewIncomeTaxYear={setNewIncomeTaxYear}
                />
              )}

              {activeTab === 'system' && <SystemSettingsPanel />}
            </>
          )}
        </SettingsTabs>
      </div>
    </main>
  )
}
