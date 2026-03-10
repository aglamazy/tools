'use client'

import { useEffect, useState } from 'react'
import { db } from '@/app/db/financeDB'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { subjectStore } from '@/app/stores/subjectStore'
import type { Category } from '@/app/types/category'

export type TaxStatus = 'green' | 'yellow' | 'red' | 'gray'

export type TaxStatusInfo = {
  status: TaxStatus
  currentIncome: number
  maxMonthlyIncome: number
  limit: number
}

function computeStatus(currentIncome: number, maxMonthlyIncome: number, limit: number): TaxStatus {
  if (currentIncome > limit) return 'red'
  if (currentIncome + maxMonthlyIncome > limit) return 'yellow'
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

      // Authorized businesses: gray placeholder (logic TBD)
      if (business.vatType === 'authorized') {
        setInfo({ status: 'gray' as TaxStatus, currentIncome: 0, maxMonthlyIncome: 0, limit: 0 })
        return
      }

      // Only exempt or tax-free businesses get income-vs-limit status
      if (business.vatType !== 'exempt' && !business.isTaxFree) return

      const currentYear = new Date().getFullYear()
      const limit = await appSettingsStore.getAnnualTaxLimit(currentYear)
      if (!limit) return

      // Build income category names for this business
      const categories = subjectStore.getAll() as Category[]
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
      const status = computeStatus(currentIncome, maxMonthlyIncome, limit)

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
      title={`השכרת דירה: ${STATUS_LABELS[info.status]} — הכנסה: ${fmt(info.currentIncome)} / תקרה: ${fmt(info.limit)}`}
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

/** @deprecated Use BusinessStatusBadge with businessId instead */
export default function TaxExemptBadge() {
  return null
}
