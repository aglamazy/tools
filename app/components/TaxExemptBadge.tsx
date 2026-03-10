'use client'

import { useEffect, useState } from 'react'
import { db } from '@/app/db/financeDB'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { subjectStore } from '@/app/stores/subjectStore'
import type { Category } from '@/app/types/category'

export type TaxStatus = 'green' | 'yellow' | 'red'

export type TaxStatusInfo = {
  status: TaxStatus
  currentIncome: number
  maxMonthlyIncome: number
  limit: number
}

const STATUS_RANK: Record<TaxStatus, number> = { green: 0, yellow: 1, red: 2 }

function computeStatus(currentIncome: number, maxMonthlyIncome: number, limit: number): TaxStatus {
  if (currentIncome > limit) return 'red'
  if (currentIncome + maxMonthlyIncome > limit) return 'yellow'
  return 'green'
}

/**
 * Tax exemption status based on business transaction income (gross, before deductions).
 * This matches the per-business columns in the annual summary table.
 * When userId is provided, calculates for that user only.
 * When omitted (sidebar badge), picks the worst status across all users.
 */
export function useTaxExemptStatus(): TaxStatusInfo | null {
  const [info, setInfo] = useState<TaxStatusInfo | null>(null)

  useEffect(() => {
    const load = async () => {
      const currentYear = new Date().getFullYear()
      const limit = await appSettingsStore.getAnnualTaxLimit(currentYear)
      if (!limit) return

      // Sum income from apartment rental (isTaxFree) businesses
      const businesses = await db.businesses.toArray()
      const exemptBizIds = new Set(businesses.filter(b => b.isTaxFree).map(b => b.id!))
      if (exemptBizIds.size === 0) return

      // Build exempt business → income category names
      const categories = subjectStore.getAll() as Category[]
      const exemptCatNames = new Set<string>()
      for (const cat of categories) {
        if (cat.businessId && exemptBizIds.has(cat.businessId) && cat.type === 'income') {
          exemptCatNames.add(cat.name)
        }
      }
      if (exemptCatNames.size === 0) return

      const allTx = await db.transactions.toArray()
      const yearTx = allTx.filter(t => t.category && exemptCatNames.has(t.category) && t.month?.endsWith(`/${currentYear}`))

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
  }, [])

  return info
}

const STATUS_COLORS: Record<TaxStatus, { bg: string; border: string; text: string }> = {
  green: { bg: '#dcfce7', border: '#86efac', text: '#16a34a' },
  yellow: { bg: '#fef9c3', border: '#fde047', text: '#a16207' },
  red: { bg: '#fee2e2', border: '#fca5a5', text: '#dc2626' },
}

const STATUS_LABELS: Record<TaxStatus, string> = {
  green: 'תקין',
  yellow: 'מתקרב לתקרה',
  red: 'חריגה מהתקרה',
}

export default function TaxExemptBadge() {
  const info = useTaxExemptStatus()

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
