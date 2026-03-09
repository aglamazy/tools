'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db } from '@/app/db/financeDB'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { subjectStore } from '@/app/stores/subjectStore'
import type { Category } from '@/app/types/category'
import { routes } from '@/app/config'

export type TaxStatus = 'green' | 'yellow' | 'red'

export type TaxStatusInfo = {
  status: TaxStatus
  currentIncome: number
  maxMonthlyIncome: number
  limit: number
}

export function useTaxExemptStatus(): TaxStatusInfo | null {
  const [info, setInfo] = useState<TaxStatusInfo | null>(null)

  useEffect(() => {
    const load = async () => {
      const limit = await appSettingsStore.getAnnualTaxLimit()
      if (!limit) return

      const currentYear = new Date().getFullYear()

      // Get income from tax documents
      const taxDocs = await db.taxDocuments.filter(d => d.year === currentYear).toArray()
      const taxDocIncome = taxDocs.reduce((s, d) => s + (d.grossIncome || 0), 0)

      // Get income from business transactions (self-employed income)
      const businesses = await db.businesses.toArray()
      const categories = subjectStore.getAll() as Category[]
      const bizCatNames = new Set<string>()
      for (const cat of categories) {
        if (cat.businessId && cat.type === 'income') {
          bizCatNames.add(cat.name)
        }
      }

      let bizIncome = 0
      if (bizCatNames.size > 0) {
        const allTx = await db.transactions.toArray()
        bizIncome = allTx
          .filter(t => t.category && bizCatNames.has(t.category) && t.month?.endsWith(`/${currentYear}`))
          .reduce((s, t) => s + (t.amount || 0), 0)
      }

      const currentIncome = taxDocIncome + bizIncome

      // Calculate max monthly income from the data we have
      const currentMonth = new Date().getMonth() // 0-based
      const monthlyIncomes: number[] = []
      for (let m = 0; m <= currentMonth; m++) {
        const monthStr = `${String(m + 1).padStart(2, '0')}/${currentYear}`
        const monthTaxIncome = taxDocs
          .filter(d => d.month === monthStr)
          .reduce((s, d) => s + (d.grossIncome || 0), 0)

        let monthBizIncome = 0
        if (bizCatNames.size > 0) {
          const allTx = await db.transactions.toArray()
          monthBizIncome = allTx
            .filter(t => t.month === monthStr && t.category && bizCatNames.has(t.category))
            .reduce((s, t) => s + (t.amount || 0), 0)
        }

        monthlyIncomes.push(monthTaxIncome + monthBizIncome)
      }

      const maxMonthlyIncome = monthlyIncomes.length > 0
        ? Math.max(...monthlyIncomes)
        : 0

      let status: TaxStatus
      if (currentIncome > limit) {
        status = 'red'
      } else if (currentIncome + maxMonthlyIncome > limit) {
        status = 'yellow'
      } else {
        status = 'green'
      }

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
    <Link
      href={routes.taxes}
      title={`${STATUS_LABELS[info.status]} — הכנסה: ${fmt(info.currentIncome)} / תקרה: ${fmt(info.limit)}`}
      style={{ textDecoration: 'none' }}
    >
      <span
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
    </Link>
  )
}
