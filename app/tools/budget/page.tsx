'use client'

import { useState, useEffect } from 'react'
import { formatMonthDisplay } from '@/app/utils/formatters'
import { transactionStore } from '@/app/stores/transactionStore'
import { subjectStore } from '@/app/stores/subjectStore'
import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { useToast } from '@/app/components/ToastContainer'

export default function BudgetPage() {
  const { showToast } = useToast()
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [autoClassifiedIds, setAutoClassifiedIds] = useState<Set<string>>(new Set())
  const [hideClassified, setHideClassified] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Load available months from imported files and categories
  useEffect(() => {
    const stored = localStorage.getItem('finance-imported-files')
    if (stored) {
      const data = JSON.parse(stored)
      const months = Array.from(
        new Set(
          data.files
            .map((f: any) => f.processingMonth)
            .filter((m: string | undefined): m is string => !!m)
        )
      ).sort((a, b) => {
        const [aMonth, aYear] = a.split('/').map(Number)
        const [bMonth, bYear] = b.split('/').map(Number)
        return bYear * 12 + bMonth - (aYear * 12 + aMonth)
      })

      setAvailableMonths(months)
      if (months.length > 0 && !selectedMonth) {
        setSelectedMonth(months[0]) // Select newest month by default
      }
    }

    // Load categories from settings
    setCategories(subjectStore.getAll())

    setLoading(false)
  }, [selectedMonth])

  // Load transactions by transaction date
  useEffect(() => {
    if (!selectedMonth) return

    const budgetTransactions = transactionStore.getBudgetTransactions(selectedMonth)
    setTransactions(budgetTransactions)
  }, [selectedMonth])

  // Calculate category totals for pie chart
  const getCategoryData = () => {
    const expenses = transactions.filter((t) => t.amount < 0)
    const categoryTotals = new Map<string, { total: number; color: string }>()

    expenses.forEach((t) => {
      if (!t.category) return // Skip uncategorized

      const current = categoryTotals.get(t.category) || { total: 0, color: '#9ca3af' }
      categoryTotals.set(t.category, {
        total: current.total + Math.abs(t.amount),
        color: current.color,
      })
    })

    // Add colors from categories
    categoryTotals.forEach((value, categoryName) => {
      const category = categories.find((c) => c.name === categoryName)
      if (category) {
        value.color = category.color
      }
    })

    return Array.from(categoryTotals.entries())
      .map(([name, { total, color }]) => ({
        name,
        value: total,
        color,
      }))
      .sort((a, b) => b.value - a.value) // Sort by amount descending
  }

  const categoryData = getCategoryData()

  // Handler for category click - filter by category and reset hideClassified
  const handleCategoryClick = (categoryName: string) => {
    if (selectedCategory === categoryName) {
      // Clicking the same category again clears the filter
      setSelectedCategory(null)
    } else {
      setSelectedCategory(categoryName)
      setHideClassified(false) // Reset "not classified only" filter
    }
  }

  // Filter transactions based on hideClassified toggle and selected category
  const displayedTransactions = transactions.filter((t) => {
    // First apply category filter if one is selected
    if (selectedCategory) {
      return t.category === selectedCategory
    }

    // Otherwise apply hideClassified filter
    if (hideClassified) {
      return !t.category || t.category.trim() === ''
    }

    // Show all transactions if no filters applied
    return true
  })

  return (
    <main className="app" dir="rtl">
      <div className="card">
        {/* Sticky Header Section */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            backgroundColor: 'white',
            zIndex: 10,
            paddingBottom: '1rem',
            borderBottom: '1px solid #e5e7eb',
            marginBottom: '1rem',
          }}
        >
          <header style={{ marginBottom: '1rem' }}>
            <h1 style={{ marginBottom: '0.25rem' }}>ניתוח תקציב</h1>
            <p style={{ margin: 0 }}>מעקב אחר הוצאות לפי קטגוריות - מתי ביצעת רכישות</p>
          </header>

          {/* Month Selector with Buttons */}
          {availableMonths.length > 0 && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label htmlFor="month-select" style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                  בחר חודש:
                </label>
                <select
                  id="month-select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                    minWidth: '150px',
                  }}
                >
                  {availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {formatMonthDisplay(month)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedMonth && (
                <>
                  <button
                    onClick={() => setHideClassified(!hideClassified)}
                    className="upload-another-btn"
                    style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    disabled={selectedCategory !== null}
                  >
                    {hideClassified ? '👁️ הצג הכל' : '🎯 רק לא מסווגים'}
                  </button>
                  {selectedCategory && (
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className="upload-another-btn"
                      style={{
                        margin: 0,
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        background: '#0284c7',
                        color: 'white',
                      }}
                    >
                      ✕ נושא: {selectedCategory}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const result = transactionStore.autoClassify(selectedMonth)
                      if (result.count > 0) {
                        // Reload transactions to show the updates
                        const budgetTransactions = transactionStore.getBudgetTransactions(selectedMonth)
                        setTransactions(budgetTransactions)
                        setAutoClassifiedIds(new Set(result.classifiedIds))
                        showToast('success', `סווגו ${result.count} עסקאות בהצלחה!`, '✨')

                        // Clear highlighting after 5 seconds
                        setTimeout(() => {
                          setAutoClassifiedIds(new Set())
                        }, 5000)
                      } else {
                        showToast('info', 'לא נמצאו עסקאות לסיווג אוטומטי', '🔍')
                      }
                    }}
                    className="file-picker"
                    style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                  >
                    🪄 סיווג אוטומטי
                  </button>
                </>
              )}
            </div>
          )}

          {/* Summary Cards - Compact */}
          {selectedMonth && !loading && (
            <section className="summary-grid" style={{ marginTop: '1rem', gap: '0.75rem' }}>
              <div className="summary-card income" style={{ padding: '0.75rem' }}>
                <div className="summary-label" style={{ fontSize: '0.8rem' }}>הכנסות</div>
                <div className="summary-amount" style={{ fontSize: '1.25rem' }}>
                  {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                    transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
                  )}
                </div>
                <div className="summary-count" style={{ fontSize: '0.75rem' }}>
                  {transactions.filter((t) => t.amount > 0).length} עסקאות
                </div>
              </div>
              <div className="summary-card expenses" style={{ padding: '0.75rem' }}>
                <div className="summary-label" style={{ fontSize: '0.8rem' }}>הוצאות</div>
                <div className="summary-amount" style={{ fontSize: '1.25rem' }}>
                  {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                    Math.abs(transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0))
                  )}
                </div>
                <div className="summary-count" style={{ fontSize: '0.75rem' }}>
                  {transactions.filter((t) => t.amount < 0).length} עסקאות
                </div>
              </div>
              <div className="summary-card net" style={{ padding: '0.75rem' }}>
                <div className="summary-label" style={{ fontSize: '0.8rem' }}>מאזן</div>
                <div
                  className={
                    'summary-amount ' +
                    (transactions.reduce((sum, t) => sum + t.amount, 0) > 0 ? 'positive' : 'negative')
                  }
                  style={{ fontSize: '1.25rem' }}
                >
                  {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                    transactions.reduce((sum, t) => sum + t.amount, 0)
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {availableMonths.length === 0 && (
          <div className="banner" style={{ marginTop: '1rem' }}>
            לא נמצאו קבצים מיובאים. עבור לעמוד "ייבוא קבצים" כדי להתחיל.
          </div>
        )}

        {selectedMonth && !loading && (
          <>
            {/* Category Breakdown - Pie Chart */}
            {categoryData.length > 0 && (
              <section style={{ marginTop: '2rem' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
                  פילוח הוצאות לפי נושא
                </h2>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                  <div style={{ flex: '0 0 400px', height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                          onClick={(data) => handleCategoryClick(data.name)}
                          style={{ cursor: 'pointer' }}
                        >
                          {categoryData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              opacity={selectedCategory === null || selectedCategory === entry.name ? 1 : 0.3}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) =>
                            new Intl.NumberFormat('he-IL', {
                              style: 'currency',
                              currency: 'ILS',
                            }).format(value)
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {categoryData.map((cat) => (
                        <div
                          key={cat.name}
                          onClick={() => handleCategoryClick(cat.name)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            background: selectedCategory === cat.name ? '#e0f2fe' : '#f8fafc',
                            border: selectedCategory === cat.name ? '2px solid #0284c7' : '1px solid #e2e8f0',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            opacity: selectedCategory === null || selectedCategory === cat.name ? 1 : 0.5,
                          }}
                          onMouseEnter={(e) => {
                            if (selectedCategory !== cat.name) {
                              e.currentTarget.style.background = '#f1f5f9'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedCategory !== cat.name) {
                              e.currentTarget.style.background = '#f8fafc'
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div
                              style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                background: cat.color,
                              }}
                            />
                            <span style={{ fontWeight: 500 }}>{cat.name}</span>
                            {selectedCategory === cat.name && (
                              <span style={{ fontSize: '0.75rem', color: '#0284c7' }}>✓</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                              {((cat.value / categoryData.reduce((sum, c) => sum + c.value, 0)) * 100).toFixed(1)}%
                            </span>
                            <span style={{ fontWeight: 600 }}>
                              {new Intl.NumberFormat('he-IL', {
                                style: 'currency',
                                currency: 'ILS',
                              }).format(cat.value)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Transactions Table */}
            <section style={{ marginTop: '2rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>עסקאות</h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>תאריך</th>
                      <th>עסק</th>
                      <th>נושא</th>
                      <th>סכום</th>
                      <th>אמצעי תשלום</th>
                      <th>קבוע</th>
                      <th>תשלום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTransactions.map((transaction) => {
                      const isAutoClassified = autoClassifiedIds.has(transaction.id)
                      return (
                        <tr
                          key={transaction.id}
                          style={{
                            backgroundColor: isAutoClassified ? '#fef3c7' : undefined,
                            transition: 'background-color 0.3s ease',
                          }}
                        >
                          <td>{transaction.date}</td>
                          <td>
                            {transaction.business}
                            {isAutoClassified && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}>✨</span>
                            )}
                          </td>
                        <td>
                          <select
                            value={transaction.category}
                            onChange={(e) => {
                              const newCategory = e.target.value
                              // Update local state
                              setTransactions((prev) =>
                                prev.map((t) => (t.id === transaction.id ? { ...t, category: newCategory } : t))
                              )
                              // Save to storage
                              transactionStore.updateAny(transaction.id, { category: newCategory })
                            }}
                            style={{
                              padding: '0.25rem',
                              borderRadius: '0.25rem',
                              border: '1px solid #d1d5db',
                              fontSize: '0.875rem',
                              width: '100%',
                            }}
                          >
                            <option value="">בחר נושא</option>
                            {categories
                              .filter((cat) =>
                                transaction.amount > 0 ? cat.type === 'income' : cat.type === 'expense'
                              )
                              .map((cat) => (
                                <option key={cat.id} value={cat.name}>
                                  {cat.name}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td
                          style={{
                            color: transaction.amount > 0 ? '#10b981' : '#ef4444',
                            fontWeight: 500,
                          }}
                        >
                          {new Intl.NumberFormat('he-IL', {
                            style: 'currency',
                            currency: 'ILS',
                          }).format(transaction.amount)}
                        </td>
                        <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          {transaction.paymentMethod}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={transaction.isFixed}
                            onChange={(e) => {
                              const newIsFixed = e.target.checked
                              // Update local state
                              setTransactions((prev) =>
                                prev.map((t) => (t.id === transaction.id ? { ...t, isFixed: newIsFixed } : t))
                              )
                              // Save to storage
                              transactionStore.updateAny(transaction.id, { isFixed: newIsFixed })
                            }}
                            style={{
                              width: '1rem',
                              height: '1rem',
                              cursor: 'pointer',
                            }}
                          />
                        </td>
                        <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          {transaction.installmentInfo && (
                            <div>
                              <div>{transaction.installmentInfo}</div>
                              {transaction.totalAmount && (
                                <div style={{ fontSize: '0.75rem' }}>
                                  (סה"כ{' '}
                                  {new Intl.NumberFormat('he-IL', {
                                    style: 'currency',
                                    currency: 'ILS',
                                  }).format(Math.abs(transaction.totalAmount))}
                                  )
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
