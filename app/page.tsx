"use client"

import { useEffect, useMemo, useState } from 'react'
import type { MonthSnapshot, HistoryStorage, CategoryBreakdown } from '@/app/types/history'
import type { Category } from '@/app/types/category'

const HISTORY_STORAGE_KEY = 'finance-history'
const CATEGORIES_STORAGE_KEY = 'finance-categories'

const currency = (value: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
  }).format(value)

const loadHistory = (): MonthSnapshot[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HistoryStorage
    return parsed.months || []
  } catch (err) {
    console.error('Error loading history:', err)
    return []
  }
}

const loadCategories = (): Category[] => {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(CATEGORIES_STORAGE_KEY)
    if (!stored) return []
    const data = JSON.parse(stored)
    return (data.categories || []).map((cat: Category) => ({
      ...cat,
      isFixed: cat.isFixed ?? false,
    }))
  } catch (err) {
    console.error('Error loading categories:', err)
    return []
  }
}

export default function HomePage() {
  const [history, setHistory] = useState<MonthSnapshot[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    setHistory(loadHistory())
    setCategories(loadCategories())
  }, [])

  const sortedMonths = useMemo(() => {
    const parseKey = (monthYear: string) => {
      const [m, y] = monthYear.split('/').map((v) => parseInt(v, 10))
      return y * 12 + m
    }
    return [...history].sort((a, b) => parseKey(b.monthYear) - parseKey(a.monthYear))
  }, [history])

  const latestMonth = sortedMonths[0]
  const latestCategories: CategoryBreakdown[] = latestMonth?.categories || []

  // Join isFixed from settings
  const categoriesWithSettings = latestCategories.map((catBreakdown) => {
    const settingsCat = categories.find((c) => c.id === catBreakdown.categoryId)
    return {
      ...catBreakdown,
      isFixed: settingsCat?.isFixed ?? false,
    }
  })

  const latestIncomeCategories = categoriesWithSettings.filter((c) => c.type === 'income')
  const latestExpenseCategories = categoriesWithSettings
    .filter((c) => c.type === 'expense')
    .sort((a, b) => {
      const aFixed = !!a.isFixed
      const bFixed = !!b.isFixed
      if (aFixed && !bFixed) return 1
      if (bFixed && !aFixed) return -1
      return a.total - b.total
    })

  return (
    <main className="app" dir="rtl">
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {sortedMonths.length === 0 ? (
          <div className="card">
            <p style={{ margin: 0, color: '#64748b' }}>
              עדיין אין נתונים היסטוריים. טען קובץ תנועות כדי לראות תקציר כאן.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1.5rem' }}>
            <div className="card">
              <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>תזרים - חודשים קודמים</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>הכנסות, הוצאות ומאזן חודשי.</p>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>חודש</th>
                      <th>הכנסה</th>
                      <th>הוצאה</th>
                      <th>מאזן</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMonths.map((row) => (
                      <tr key={row.monthYear}>
                        <td>{row.monthYear}</td>
                        <td className="amount-positive">{currency(row.income)}</td>
                        <td className="amount-negative">{currency(-row.expense)}</td>
                        <td className={row.net >= 0 ? 'amount-positive' : 'amount-negative'}>
                          {currency(row.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>תקציב - חלוקה לפי נושאים</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>
                  תקציב מול ביצוע לחודש האחרון.
                </p>
              </div>
              {latestCategories.length === 0 ? (
                <p style={{ margin: 0, color: '#64748b' }}>אין קטגוריות מסווגות לחודש זה.</p>
              ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th colSpan={4} style={{ textAlign: 'right' }}>הוצאות</th>
                        </tr>
                        <tr>
                          <th>נושא</th>
                          <th>תקציב</th>
                          <th>הוצאה</th>
                          <th>נשאר</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestExpenseCategories.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ color: '#64748b' }}>אין קטגוריות הוצאה לחודש זה.</td>
                          </tr>
                        ) : (
                          latestExpenseCategories.map((row) => {
                            const budget = 0 // budgets not defined yet
                            const spent = Math.abs(row.total)
                            const left = budget - spent
                            return (
                              <tr key={row.categoryId}>
                                <td>{row.categoryName}</td>
                                <td>{budget ? currency(budget) : '—'}</td>
                                <td className="amount-negative">{currency(-spent)}</td>
                                <td className={left >= 0 ? 'amount-positive' : 'amount-negative'}>
                                  {budget ? currency(left) : '—'}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th colSpan={2} style={{ textAlign: 'right' }}>הכנסות</th>
                        </tr>
                        <tr>
                          <th>נושא</th>
                          <th>הכנסה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestIncomeCategories.length === 0 ? (
                          <tr>
                            <td colSpan={2} style={{ color: '#64748b' }}>אין קטגוריות הכנסה לחודש זה.</td>
                          </tr>
                        ) : (
                          latestIncomeCategories.map((row) => {
                            const income = row.total
                            return (
                              <tr key={row.categoryId}>
                                <td>{row.categoryName}</td>
                                <td className="amount-positive">{currency(income)}</td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
