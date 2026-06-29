"use client"

import { useEffect, useState } from 'react'
import { transactionStore } from '@/app/stores/transactionStore'
import { subjectStore } from '@/app/stores/subjectStore'

const currency = (value: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
  }).format(value)

type MonthSummary = {
  monthYear: string
  income: number
  expense: number
  net: number
}

type CategorySummary = {
  categoryName: string
  total: number
  type: 'income' | 'expense'
  isFixed: boolean
}

export default function HomePage() {
  const [monthSummaries, setMonthSummaries] = useState<MonthSummary[]>([])
  const [capitalSummaries, setCapitalSummaries] = useState<MonthSummary[]>([])
  const [externalSummaries, setExternalSummaries] = useState<MonthSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const months = await transactionStore.getAvailableMonths()
      const categories = subjectStore.getAll()
      const capitalNames = new Set(
        categories.filter((c) => c.isCapital).map((c) => c.name)
      )
      const externalNames = new Set(
        categories.filter((c) => c.isExternal).map((c) => c.name)
      )
      const nonDailyNames = new Set([...capitalNames, ...externalNames])

      const daily: MonthSummary[] = []
      const capital: MonthSummary[] = []
      const external: MonthSummary[] = []

      for (const month of months) {
        const transactions = await transactionStore.getBudgetTransactions(month)

        const dailyTx = transactions.filter((t) => !nonDailyNames.has(t.category || ''))
        const capitalTx = transactions.filter((t) => capitalNames.has(t.category || ''))
        const externalTx = transactions.filter((t) => externalNames.has(t.category || ''))

        const dIncome = dailyTx.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
        const dExpense = dailyTx.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0)
        daily.push({ monthYear: month, income: dIncome, expense: dExpense, net: dIncome - dExpense })

        const cIncome = capitalTx.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
        const cExpense = capitalTx.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0)
        if (cIncome > 0 || cExpense > 0) {
          capital.push({ monthYear: month, income: cIncome, expense: cExpense, net: cIncome - cExpense })
        }

        const eIncome = externalTx.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
        const eExpense = externalTx.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0)
        if (eIncome > 0 || eExpense > 0) {
          external.push({ monthYear: month, income: eIncome, expense: eExpense, net: eIncome - eExpense })
        }
      }

      setMonthSummaries(daily)
      setCapitalSummaries(capital)
      setExternalSummaries(external)
      setLoading(false)
    }
    loadData()
  }, [])

  const latestMonth = monthSummaries[0]

  const [latestCategories, setLatestCategories] = useState<CategorySummary[]>([])

  useEffect(() => {
    if (!latestMonth) return
    const loadCategories = async () => {
      const transactions = await transactionStore.getBudgetTransactions(latestMonth.monthYear)
      const categories = subjectStore.getAll()
      const nonDailyNames = new Set(
        categories.filter((c) => c.isCapital || c.isExternal).map((c) => c.name)
      )
      const categoryMap = new Map<string, CategorySummary>()

      for (const t of transactions) {
        const name = t.category || 'ללא קטגוריה'
        if (nonDailyNames.has(name)) continue
        const existing = categoryMap.get(name)
        if (existing) {
          existing.total += t.amount
          if (t.isFixed) existing.isFixed = true
        } else {
          categoryMap.set(name, {
            categoryName: name,
            total: t.amount,
            type: t.amount >= 0 ? 'income' : 'expense',
            isFixed: t.isFixed || false,
          })
        }
      }

      setLatestCategories(Array.from(categoryMap.values()))
    }
    loadCategories()
  }, [latestMonth])

  const latestIncomeCategories = latestCategories.filter((c) => c.total > 0)
  const latestExpenseCategories = latestCategories
    .filter((c) => c.total < 0)
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
        {loading ? (
          <div className="card">
            <p style={{ margin: 0, color: '#64748b' }}>טוען נתונים...</p>
          </div>
        ) : monthSummaries.length === 0 ? (
          <div className="card">
            <p style={{ margin: 0, color: '#64748b' }}>
              עדיין אין נתונים היסטוריים. טען קובץ תנועות כדי לראות תקציר כאן.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="card">
                <div style={{ marginBottom: '1rem' }}>
                  <h2 style={{ margin: 0 }}>תזרים שוטף</h2>
                  <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>הכנסות, הוצאות ומאזן חודשי (ללא הון).</p>
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
                      {monthSummaries.map((row) => (
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

              {(capitalSummaries.length > 0 || externalSummaries.length > 0) && (() => {
                const allMonths = [...new Set([
                  ...capitalSummaries.map((s) => s.monthYear),
                  ...externalSummaries.map((s) => s.monthYear),
                ])].sort((a, b) => {
                  const [am, ay] = a.split('/').map(Number)
                  const [bm, by] = b.split('/').map(Number)
                  return by - ay || bm - am
                })
                const capMap = new Map(capitalSummaries.map((s) => [s.monthYear, s]))
                const extMap = new Map(externalSummaries.map((s) => [s.monthYear, s]))

                return (
                  <div className="card">
                    <div style={{ marginBottom: '1rem' }}>
                      <h2 style={{ margin: 0 }}>הון וחיצוני</h2>
                      <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>פנסיה, חסכונות, השקעות, מתנות, ירושה.</p>
                    </div>
                    <div className="table-wrapper">
                      <table>
                        <thead>
                          <tr>
                            <th>חודש</th>
                            <th>חיצוני</th>
                            <th>הפקדה</th>
                            <th>משיכה</th>
                            <th>שינוי הון</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allMonths.map((month) => {
                            const cap = capMap.get(month)
                            const ext = extMap.get(month)
                            const capDeposit = cap ? cap.expense : 0
                            const capWithdraw = cap ? cap.income : 0
                            const capChange = capDeposit - capWithdraw
                            const extNet = ext ? ext.net : 0
                            return (
                              <tr key={month}>
                                <td>{month}</td>
                                <td style={{ color: '#d97706' }}>{extNet !== 0 ? currency(extNet) : '-'}</td>
                                <td style={{ color: '#7c3aed' }}>{capDeposit !== 0 ? currency(capDeposit) : '-'}</td>
                                <td style={{ color: '#7c3aed' }}>{capWithdraw !== 0 ? currency(-capWithdraw) : '-'}</td>
                                <td className={capChange >= 0 ? 'amount-positive' : 'amount-negative'}>
                                  {capChange !== 0 ? currency(capChange) : '-'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="card">
              <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>תקציב - חלוקה לפי נושאים</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>
                  חלוקה לפי נושאים לחודש האחרון.
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
                          <th colSpan={2} style={{ textAlign: 'right' }}>הוצאות</th>
                        </tr>
                        <tr>
                          <th>נושא</th>
                          <th>הוצאה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestExpenseCategories.length === 0 ? (
                          <tr>
                            <td colSpan={2} style={{ color: '#64748b' }}>אין קטגוריות הוצאה לחודש זה.</td>
                          </tr>
                        ) : (
                          latestExpenseCategories.map((row) => (
                            <tr key={row.categoryName}>
                              <td>{row.categoryName}</td>
                              <td className="amount-negative">{currency(row.total)}</td>
                            </tr>
                          ))
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
                          latestIncomeCategories.map((row) => (
                            <tr key={row.categoryName}>
                              <td>{row.categoryName}</td>
                              <td className="amount-positive">{currency(row.total)}</td>
                            </tr>
                          ))
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
