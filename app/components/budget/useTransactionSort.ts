import { useState } from 'react'
import type { BudgetTransaction } from '@/app/types/transactions'

export type SortKey = 'date' | 'business' | 'category' | 'amount' | 'paymentMethod'

export function useTransactionSort(initialKey: SortKey = 'date', initialDir: 'asc' | 'desc' = 'desc') {
  const [sortKey, setSortKey] = useState<SortKey>(initialKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialDir)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'amount' ? 'desc' : 'asc')
    }
  }

  const sortTransactions = (rows: BudgetTransaction[]): BudgetTransaction[] => {
    return rows.slice().sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'amount': av = a.amount; bv = b.amount; break
        case 'business': av = a.business || ''; bv = b.business || ''; break
        case 'category': av = a.category || ''; bv = b.category || ''; break
        case 'paymentMethod': av = a.paymentMethod || ''; bv = b.paymentMethod || ''; break
        case 'date': default: av = a.date || ''; bv = b.date || ''; break
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'he') * dir
    })
  }

  return { sortKey, sortDir, toggleSort, sortTransactions }
}
