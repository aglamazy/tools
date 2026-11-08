'use client'

import React, { useCallback } from 'react'
import YearlyMonthlyModal from '@/app/components/charts/YearlyMonthlyModal'
import { transactionStore } from '@/app/stores/transactionStore'
import type { Category } from '@/app/types/category'
import type { BudgetTransaction } from '@/app/types/transactions'
import { subjectMonthlyTotals } from './monthlySeries'

type Props = {
  /** Subject to chart; null = closed. */
  subjectName: string | null
  onClose: () => void
  /** The month being viewed, MM/YYYY — its year is the default. */
  selectedMonth: string
  availableMonths: string[]
  categories: Category[]
}

const yearOf = (month: string) => Number(month.split('/')[1])

/** The subject caller of the generic yearly modal (aglamazo#465). */
export default function SubjectYearlyGraph({ subjectName, onClose, selectedMonth, availableMonths, categories }: Props) {
  const loadSeries = useCallback(async (year: number) => {
    if (!subjectName) return []
    const byMonth: Record<number, BudgetTransaction[]> = {}
    await Promise.all(Array.from({ length: 12 }, async (_, i) => {
      const month = `${String(i + 1).padStart(2, '0')}/${year}`
      byMonth[i + 1] = await transactionStore.getBudgetTransactions(month)
    }))
    const values = subjectMonthlyTotals(byMonth, subjectName, categories)
    console.log('[SubjectYearlyGraph]', subjectName, year, values)
    return [{ label: subjectName, values }]
  }, [subjectName, categories])

  if (!subjectName || !selectedMonth) return null
  const years = Array.from(new Set(availableMonths.map(yearOf).filter((y) => Number.isFinite(y))))

  return (
    <YearlyMonthlyModal
      isOpen
      onClose={onClose}
      title={`${subjectName} — לפי חודש`}
      initialYear={yearOf(selectedMonth)}
      years={years}
      loadSeries={loadSeries}
      unit="ILS"
      scaleMode="own"
    />
  )
}
