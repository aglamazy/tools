'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { db } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import type { Category } from '@/app/types/category'
import { getIdToken } from '@/app/services/firebaseAuthService'
import { getUser } from '@/app/stores/authStore'
import { getTaxProfile } from '@/app/components/TaxProfileSection'

export type TaxStatus = 'green' | 'yellow' | 'red' | 'gray'

export type TaxStatusInfo = {
  status: TaxStatus
  currentIncome: number
  maxMonthlyIncome: number
  limit: number
}

function computeStatus(maxMonthlyIncome: number, limit: number): TaxStatus {
  if (maxMonthlyIncome > limit) return 'red'
  if (maxMonthlyIncome > limit * 0.8) return 'yellow'
  return 'green'
}

/**
 * Tax status for a single business.
 * Exempt / tax-free: income vs annual limit.
 * Authorized: null (not yet defined).
 */
export function useBusinessTaxStatus(businessId?: number): TaxStatusInfo | null {
  const [info, setInfo] = useState<TaxStatusInfo | null>(null)

  useEffect(() => {
    if (!businessId) return

    const load = async () => {
      const business = await db.businesses.get(businessId)
      if (!business) return

      // Read tax settings from the business owner's person-level profile
      const taxProfile = await getTaxProfile(business.userId)

      // Authorized businesses: gray placeholder (logic TBD)
      if (taxProfile.vatType === 'authorized') {
        setInfo({ status: 'gray' as TaxStatus, currentIncome: 0, maxMonthlyIncome: 0, limit: 0 })
        return
      }

      // Only exempt (or unset, treated as exempt) or tax-free businesses get income-vs-limit status
      if (taxProfile.vatType && taxProfile.vatType !== 'exempt' && !business.isTaxFree) return

      const currentYear = new Date().getFullYear()
      const token = await getIdToken()
      if (!token) return
      let limit: number | null = null
      try {
        const res = await fetch('/api/tax-settings', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = await res.json()
          const tl = data.taxLimits as { amount: number; sinceYear: number } | null
          limit = tl && currentYear >= tl.sinceYear ? tl.amount : null
        }
      } catch { /* ignore */ }
      console.log(`[TaxBadge] biz=${businessId} "${business.name}" limit=${limit} (from API)`)
      if (!limit) return

      // Build income category names for this business
      const categories = await subjectStore.getAll()
      const catNames = new Set<string>()
      for (const cat of categories) {
        if (cat.businessId === businessId && cat.type === 'income') {
          catNames.add(cat.name)
        }
      }

      const allTx = catNames.size > 0 ? await db.transactions.toArray() : []
      const yearTx = allTx.filter(t => t.category && catNames.has(t.category) && t.month?.endsWith(`/${currentYear}`))

      const currentMonth = new Date().getMonth()
      const monthlyIncomes: number[] = []
      for (let m = 0; m <= currentMonth; m++) {
        const monthStr = `${String(m + 1).padStart(2, '0')}/${currentYear}`
        monthlyIncomes.push(
          yearTx.filter(t => t.month === monthStr).reduce((s, t) => s + (t.amount || 0), 0)
        )
      }

      const currentIncome = yearTx.reduce((s, t) => s + (t.amount || 0), 0)
      const maxMonthlyIncome = monthlyIncomes.length > 0 ? Math.max(...monthlyIncomes) : 0
      const status = computeStatus(maxMonthlyIncome, limit)

      console.log(`[TaxBadge] biz=${businessId} "${business.name}" vatType=${taxProfile.vatType} isTaxFree=${business.isTaxFree} income=${currentIncome} maxMonthly=${maxMonthlyIncome} limit=${limit} → ${status}`)
      setInfo({ status, currentIncome, maxMonthlyIncome, limit })
    }

    load()
  }, [businessId])

  return info
}

const STATUS_COLORS: Record<TaxStatus, { bg: string; border: string; text: string }> = {
  green: { bg: '#dcfce7', border: '#86efac', text: '#16a34a' },
  yellow: { bg: '#fef9c3', border: '#fde047', text: '#a16207' },
  red: { bg: '#fee2e2', border: '#fca5a5', text: '#dc2626' },
  gray: { bg: '#f3f4f6', border: '#d1d5db', text: '#9ca3af' },
}

const STATUS_LABELS: Record<TaxStatus, string> = {
  green: 'תקין',
  yellow: 'מתקרב לתקרה',
  red: 'חריגה מהתקרה',
  gray: 'טרם הוגדר',
}

export function BusinessStatusBadge({ businessId }: { businessId: number }) {
  const info = useBusinessTaxStatus(businessId)

  if (!info) return null

  const colors = STATUS_COLORS[info.status]
  const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

  return (
    <span
      title={`עוסק פטור: ${STATUS_LABELS[info.status]} — הכנסה: ${fmt(info.currentIncome)} / תקרה: ${fmt(info.limit)}`}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors.text,
        border: `1px solid ${colors.border}`,
        marginInlineStart: '0.35rem',
      }}
    />
  )
}

/**
 * Person-level exempt status: sums income across all exempt businesses
 * and compares against the annual limit.
 */
export function useExemptTaxStatus(): TaxStatusInfo | null {
  const [info, setInfo] = useState<TaxStatusInfo | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const taxProfile = await getTaxProfile(getUser()?.uid)

      // Only relevant for exempt (or unset, treated as exempt)
      if (taxProfile.vatType && taxProfile.vatType !== 'exempt') return

      const currentYear = new Date().getFullYear()
      const token = await getIdToken()
      if (!token) return false // signal: auth not ready

      let annualLimit: number | null = null
      try {
        const res = await fetch('/api/tax-settings', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = await res.json()
          const el = data.exemptLimit as { amount: number; sinceYear: number } | null
          annualLimit = el && currentYear >= el.sinceYear ? el.amount : null
        }
      } catch { /* ignore */ }
      if (!annualLimit) return true

      // Sum income only from non-tax-free (exempt) businesses
      const allBusinesses = await db.businesses.toArray()
      const exemptBizIds = new Set(allBusinesses.filter(b => !b.isTaxFree).map(b => b.id))
      const categories = await subjectStore.getAll()
      const incomeCategories = categories.filter(c => c.type === 'income' && c.businessId && exemptBizIds.has(c.businessId))
      const catNames = new Set(incomeCategories.map(c => c.name))

      const allTx = catNames.size > 0 ? await db.transactions.toArray() : []
      const yearTx = allTx.filter(t => t.category && catNames.has(t.category) && t.amount > 0 && t.month?.endsWith(`/${currentYear}`))

      const currentIncome = yearTx.reduce((s, t) => s + t.amount, 0)

      let status: TaxStatus = 'green'
      if (currentIncome > annualLimit) status = 'red'
      else if (currentIncome > annualLimit * 0.8) status = 'yellow'

      console.log(`[TaxBadge] person-level: income=${currentIncome} annualLimit=${annualLimit} → ${status}`)
      if (!cancelled) setInfo({ status, currentIncome, maxMonthlyIncome: 0, limit: annualLimit })
      return true
    }

    // Auth may not be ready on first render — retry once after delay
    load().then(ready => {
      if (ready === false && !cancelled) {
        setTimeout(() => { if (!cancelled) load() }, 1500)
      }
    })

    return () => { cancelled = true }
  }, [])

  return info
}

/**
 * Badge for the מסים tile in AppLauncher — person-level exempt status.
 * Shows a colored dot with a styled tooltip on hover.
 */
export function ExemptStatusBadge() {
  const info = useExemptTaxStatus()
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)

  if (!info) return null

  const colors = STATUS_COLORS[info.status]
  const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })
  const pct = info.limit > 0 ? Math.round((info.currentIncome / info.limit) * 100) : 0

  return (
    <span
      style={{ display: 'inline-block', marginInlineStart: '0.25rem', padding: '4px', cursor: 'default' }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        // Clamp X so the tooltip doesn't overflow the viewport
        const x = Math.min(rect.left + rect.width / 2, window.innerWidth - 160)
        setTooltip({ x, y: rect.bottom + 6 })
      }}
      onMouseLeave={() => setTooltip(null)}
    >
      <span
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: colors.text,
          border: `1.5px solid ${colors.border}`,
          verticalAlign: 'middle',
        }}
      />
      {tooltip && createPortal(
        <div style={{
          position: 'fixed',
          top: tooltip.y,
          left: tooltip.x,
          transform: 'translateX(-50%)',
          padding: '0.5rem 0.75rem',
          background: '#fff',
          border: `1px solid ${colors.border}`,
          borderRadius: '0.5rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          whiteSpace: 'nowrap',
          fontSize: '0.8rem',
          color: '#1e293b',
          direction: 'rtl',
          zIndex: 10000,
        }}>
          <div style={{ fontWeight: 600, color: colors.text, marginBottom: 4 }}>
            עוסק פטור: {STATUS_LABELS[info.status]}
          </div>
          <div style={{ color: '#475569' }}>
            {fmt(info.currentIncome)} / {fmt(info.limit)} ({pct}%)
          </div>
        </div>,
        document.body,
      )}
    </span>
  )
}

/** @deprecated Use ExemptStatusBadge or BusinessStatusBadge instead */
export default function TaxExemptBadge() {
  return null
}
