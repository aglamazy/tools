'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatMonthDisplay } from '@/app/utils/formatters'
import { transactionStore } from '@/app/stores/transactionStore'
import { subjectStore } from '@/app/stores/subjectStore'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { getHouseholdInfo } from '@/app/services/householdService'
import { subscribeToAuth } from '@/app/stores/authStore'
import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { useToast } from '@/app/components/ToastContainer'

export default function BudgetPage() {
  return (
    <Suspense fallback={<div className="app" dir="rtl"><div className="card">טוען...</div></div>}>
      <BudgetPageContent />
    </Suspense>
  )
}

function BudgetPageContent() {
  const { showToast } = useToast()
  const searchParams = useSearchParams()
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [autoClassifiedIds, setAutoClassifiedIds] = useState<Set<string>>(new Set())
  const [hideClassified, setHideClassified] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [drillDownCategory, setDrillDownCategory] = useState<string | null>(null)
  const [isPieChartCollapsed, setIsPieChartCollapsed] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'capital' | 'external'>('all')
  const [cardOwnerFilter, setCardOwnerFilter] = useState<string>('all') // 'all' or uid
  const [householdMembers, setHouseholdMembers] = useState<{ uid: string; label: string }[]>([])
  const [accountOwners, setAccountOwners] = useState<Record<string, string>>({})

  // Load household members for card owner filter
  useEffect(() => {
    let done = false
    const unsub = subscribeToAuth((authState) => {
      if (done) return
      if (!authState.loading && authState.user) {
        done = true
        void (async () => {
          const owners = await appSettingsStore.getAccountOwners()
          setAccountOwners(owners)

          const memberList: { uid: string; label: string }[] = []
          try {
            const info = await getHouseholdInfo()
            if (info.household) {
              const hNames = (info.household as any).memberNames || {}
              const hEmails = (info.household as any).memberEmails || {}
              for (const uid of info.household.members) {
                memberList.push({ uid, label: hNames[uid] || hEmails[uid] || uid })
              }
            }
          } catch { /* no household */ }
          if (!memberList.find(m => m.uid === authState.user!.uid)) {
            memberList.push({ uid: authState.user!.uid, label: authState.user!.displayName || authState.user!.email || authState.user!.uid })
          }
          setHouseholdMembers(memberList)
        })()
      } else if (!authState.loading) {
        done = true
      }
    })
    return () => { done = true; unsub() }
  }, [])

  // Load available months from transactions and categories
  useEffect(() => {
    const loadData = async () => {
      const months = await transactionStore.getAvailableMonths()

      setAvailableMonths(months)
      if (months.length > 0 && !selectedMonth) {
        // Check URL parameter first
        const monthParam = searchParams.get('month')
        if (monthParam && months.includes(monthParam)) {
          setSelectedMonth(monthParam)
        } else {
          // Try to restore from sessionStorage
          const savedMonth = sessionStorage.getItem('selectedMonth')
          if (savedMonth && months.includes(savedMonth)) {
            setSelectedMonth(savedMonth)
          } else {
            setSelectedMonth(months[0]) // Select newest month by default
          }
        }
      }

      // Check for filter parameter
      const filterParam = searchParams.get('filter')
      if (filterParam === 'unclassified') {
        setHideClassified(true)
        setIsPieChartCollapsed(true) // Collapse pie chart when showing unclassified
      }

      // Load categories from settings
      setCategories(subjectStore.getAll())

      setLoading(false)
    }
    loadData()
  }, [searchParams])

  // Save selected month to sessionStorage when it changes
  useEffect(() => {
    if (selectedMonth) {
      sessionStorage.setItem('selectedMonth', selectedMonth)
    }
  }, [selectedMonth])

  // Load transactions by transaction date (bank) and charging date (credit)
  useEffect(() => {
    if (!selectedMonth) return

    const loadTransactions = async () => {
      const budgetTransactions = await transactionStore.getBudgetTransactions(selectedMonth)
      setTransactions(budgetTransactions)
    }
    loadTransactions()
  }, [selectedMonth])

  // Build sets of special category names to exclude from daily totals
  const capitalNames = new Set(
    categories.filter((c) => c.isCapital).map((c) => c.name)
  )
  const externalNames = new Set(
    categories.filter((c) => c.isExternal).map((c) => c.name)
  )
  const nonDailyNames = new Set([...capitalNames, ...externalNames])
  const dailyTransactions = transactions.filter((t) => !nonDailyNames.has(t.category || ''))
  const capitalTransactions = transactions.filter((t) => capitalNames.has(t.category || '') && !t.isCreditCardCharge)
  const externalTransactions = transactions.filter((t) => externalNames.has(t.category || '') && !t.isCreditCardCharge)

  // Calculate category totals for pie chart with hierarchical structure
  const getCategoryData = () => {
    const expenses = dailyTransactions.filter((t) => t.amount < 0 && !t.isCreditCardCharge)
    const parentTotals = new Map<string, { total: number; color: string; subCategories: Map<string, { total: number; color: string }> }>()

    expenses.forEach((t) => {
      if (!t.category) return // Skip uncategorized

      const category = categories.find((c) => c.name === t.category)
      if (!category) return

      // If this is a sub-category, add to parent
      if (category.parentId) {
        const parent = categories.find((c) => c.id === category.parentId)
        if (!parent) return

        const parentData = parentTotals.get(parent.name) || { total: 0, color: parent.color, subCategories: new Map() }
        const subData = parentData.subCategories.get(t.category) || { total: 0, color: category.color }

        subData.total += Math.abs(t.amount)
        parentData.total += Math.abs(t.amount)
        parentData.subCategories.set(t.category, subData)
        parentTotals.set(parent.name, parentData)
      } else {
        // This is a parent category
        const parentData = parentTotals.get(t.category) || { total: 0, color: category.color, subCategories: new Map() }
        parentData.total += Math.abs(t.amount)
        parentData.color = category.color
        parentTotals.set(t.category, parentData)
      }
    })

    // Sort parent categories by total (descending)
    const sortedParents = Array.from(parentTotals.entries())
      .sort((a, b) => b[1].total - a[1].total)

    // If drilling down into a specific parent, show only its sub-categories
    if (drillDownCategory) {
      const parentData = parentTotals.get(drillDownCategory)
      if (parentData && parentData.subCategories.size > 0) {
        const subCategoryData = Array.from(parentData.subCategories.entries())
          .map(([name, { total, color }]) => ({
            name,
            value: total,
            color,
          }))
          .sort((a, b) => b.value - a.value)

        return { displayData: subCategoryData, parentTotals }
      }
    }

    // Default view: show only parent categories
    const parentData = sortedParents.map(([name, { total, color }]) => ({
      name,
      value: total,
      color,
    }))

    return { displayData: parentData, parentTotals }
  }

  const { displayData: categoryData, parentTotals } = getCategoryData()

  // Handler for pie slice click - drill down into parent categories
  const handlePieClick = (categoryName: string, event: React.MouseEvent) => {
    // If not in drill-down mode, check if this is a parent with sub-categories
    if (!drillDownCategory) {
      const parentData = parentTotals.get(categoryName)
      if (parentData && parentData.subCategories.size > 0) {
        // Drill down into this parent category
        setDrillDownCategory(categoryName)
        return
      }
    }

    // If already in drill-down or no sub-categories, use regular filter behavior
    handleCategoryClick(categoryName, event)
  }

  // Handler for category click in legend - supports multi-select with Ctrl/Cmd key
  const handleCategoryClick = (categoryName: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + Click: toggle this category in the selection
      setSelectedCategories((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(categoryName)) {
          newSet.delete(categoryName)
        } else {
          newSet.add(categoryName)
        }
        return newSet
      })
      setHideClassified(false) // Reset "not classified only" filter
    } else {
      // Regular click: select only this category (or clear if already selected)
      if (selectedCategories.size === 1 && selectedCategories.has(categoryName)) {
        // Clicking the same single category again clears the filter
        setSelectedCategories(new Set())
      } else {
        setSelectedCategories(new Set([categoryName]))
        setHideClassified(false) // Reset "not classified only" filter
      }
    }
  }

  // Filter transactions based on hideClassified toggle and selected categories
  const displayedTransactions = transactions.filter((t) => {
    // Skip credit card charges (they appear in the breakdown, not in main list)
    if (t.isCreditCardCharge) {
      return false
    }

    // Apply card/account owner filter
    if (cardOwnerFilter !== 'all') {
      const pm = t.paymentMethod || ''
      let ownerUid: string | undefined
      if (pm.startsWith('💳 ')) {
        ownerUid = accountOwners[`card:${pm.replace('💳 ', '')}`]
      } else {
        ownerUid = accountOwners[`bank:${pm}`]
      }
      if (ownerUid !== cardOwnerFilter) return false
    }

    // Apply type filter (income/expense/capital/external)
    if (typeFilter === 'capital') return capitalNames.has(t.category || '')
    if (typeFilter === 'external') return externalNames.has(t.category || '')
    if (typeFilter === 'income') return t.amount > 0 && !nonDailyNames.has(t.category || '')
    if (typeFilter === 'expense') return t.amount < 0 && !nonDailyNames.has(t.category || '')

    // First apply category filter if any are selected
    if (selectedCategories.size > 0) {
      return t.category && selectedCategories.has(t.category)
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
                    disabled={selectedCategories.size > 0}
                  >
                    {hideClassified ? '👁️ הצג הכל' : '🎯 רק לא מסווגים'}
                  </button>
                  {selectedCategories.size > 0 && (
                    <button
                      onClick={() => setSelectedCategories(new Set())}
                      className="upload-another-btn"
                      style={{
                        margin: 0,
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        background: '#0284c7',
                        color: 'white',
                      }}
                    >
                      ✕ נושאים ({selectedCategories.size}): {Array.from(selectedCategories).join(', ')}
                    </button>
                  )}
                  {householdMembers.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ fontWeight: 500, fontSize: '0.875rem' }}>כרטיס של:</label>
                      <select
                        value={cardOwnerFilter}
                        onChange={(e) => setCardOwnerFilter(e.target.value)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                        }}
                      >
                        <option value="all">הכל</option>
                        {householdMembers.map(m => (
                          <option key={m.uid} value={m.uid}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      const result = await transactionStore.autoClassify(selectedMonth)
                      if (result.count > 0) {
                        // Reload transactions to show the updates
                        const budgetTransactions = await transactionStore.getBudgetTransactions(selectedMonth)
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
              <div
                className="summary-card income"
                onClick={() => setTypeFilter(typeFilter === 'income' ? 'all' : 'income')}
                style={{
                  padding: '0.75rem',
                  cursor: 'pointer',
                  outline: typeFilter === 'income' ? '2px solid #10b981' : 'none',
                  opacity: typeFilter !== 'all' && typeFilter !== 'income' ? 0.5 : 1,
                }}
              >
                <div className="summary-label" style={{ fontSize: '0.8rem' }}>הכנסות</div>
                <div className="summary-amount" style={{ fontSize: '1.25rem' }}>
                  {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                    dailyTransactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
                  )}
                </div>
                <div className="summary-count" style={{ fontSize: '0.75rem' }}>
                  {dailyTransactions.filter((t) => t.amount > 0).length} עסקאות
                </div>
              </div>
              <div
                className="summary-card expenses"
                onClick={() => setTypeFilter(typeFilter === 'expense' ? 'all' : 'expense')}
                style={{
                  padding: '0.75rem',
                  cursor: 'pointer',
                  outline: typeFilter === 'expense' ? '2px solid #ef4444' : 'none',
                  opacity: typeFilter !== 'all' && typeFilter !== 'expense' ? 0.5 : 1,
                }}
              >
                <div className="summary-label" style={{ fontSize: '0.8rem' }}>הוצאות</div>
                <div className="summary-amount" style={{ fontSize: '1.25rem' }}>
                  {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                    Math.abs(dailyTransactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0))
                  )}
                </div>
                <div className="summary-count" style={{ fontSize: '0.75rem' }}>
                  {dailyTransactions.filter((t) => t.amount < 0).length} עסקאות
                </div>
              </div>
              <div className="summary-card net" style={{ padding: '0.75rem' }}>
                <div className="summary-label" style={{ fontSize: '0.8rem' }}>מאזן</div>
                <div
                  className={
                    'summary-amount ' +
                    (dailyTransactions.reduce((sum, t) => sum + t.amount, 0) > 0 ? 'positive' : 'negative')
                  }
                  style={{ fontSize: '1.25rem' }}
                >
                  {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                    dailyTransactions.reduce((sum, t) => sum + t.amount, 0)
                  )}
                </div>
              </div>
              {capitalTransactions.length > 0 && (
                <div
                  className="summary-card"
                  onClick={() => setTypeFilter(typeFilter === 'capital' ? 'all' : 'capital')}
                  style={{
                    padding: '0.75rem',
                    background: '#7c3aed',
                    color: 'white',
                    cursor: 'pointer',
                    outline: typeFilter === 'capital' ? '2px solid #7c3aed' : 'none',
                    outlineOffset: '2px',
                    opacity: typeFilter !== 'all' && typeFilter !== 'capital' ? 0.5 : 1,
                  }}
                >
                  <div className="summary-label" style={{ fontSize: '0.8rem' }}>הון</div>
                  <div className="summary-amount" style={{ fontSize: '1.25rem' }}>
                    {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                      -(capitalTransactions.reduce((sum, t) => sum + t.amount, 0))
                    )}
                  </div>
                  <div className="summary-count" style={{ fontSize: '0.75rem' }}>
                    {capitalTransactions.length} עסקאות
                  </div>
                </div>
              )}
              {externalTransactions.length > 0 && (
                <div
                  className="summary-card"
                  onClick={() => setTypeFilter(typeFilter === 'external' ? 'all' : 'external')}
                  style={{
                    padding: '0.75rem',
                    background: '#d97706',
                    color: 'white',
                    cursor: 'pointer',
                    outline: typeFilter === 'external' ? '2px solid #d97706' : 'none',
                    outlineOffset: '2px',
                    opacity: typeFilter !== 'all' && typeFilter !== 'external' ? 0.5 : 1,
                  }}
                >
                  <div className="summary-label" style={{ fontSize: '0.8rem' }}>חיצוני</div>
                  <div className="summary-amount" style={{ fontSize: '1.25rem' }}>
                    {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                      externalTransactions.reduce((sum, t) => sum + t.amount, 0)
                    )}
                  </div>
                  <div className="summary-count" style={{ fontSize: '0.75rem' }}>
                    {externalTransactions.length} עסקאות
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {availableMonths.length === 0 && (
          <div className="banner" style={{ marginTop: '1rem' }}>
            לא נמצאו עסקאות במאגר. עבור לעמוד "ייבוא קבצים" כדי להתחיל.
          </div>
        )}

        {selectedMonth && !loading && (
          <>
            {/* Category Breakdown - Pie Chart */}
            {categoryData.length > 0 && (
              <section style={{ marginTop: '2rem' }}>
                <h2
                  onClick={() => setIsPieChartCollapsed(!isPieChartCollapsed)}
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    marginBottom: '1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    userSelect: 'none',
                  }}
                >
                  <span style={{
                    transition: 'transform 0.2s',
                    transform: isPieChartCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  }}>
                    ▼
                  </span>
                  פילוח הוצאות לפי נושא
                </h2>
                {!isPieChartCollapsed && (
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                  <div style={{ flex: '0 0 450px', height: '350px', position: 'relative' }}>
                    {/* Category name badge and back button when in drill-down mode */}
                    {drillDownCategory && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          left: '10px',
                          zIndex: 1,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '1rem',
                        }}
                      >
                        <button
                          onClick={() => setDrillDownCategory(null)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          → חזרה
                        </button>
                        <div
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#f0f9ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: '0.375rem',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: '#1e40af',
                          }}
                        >
                          {drillDownCategory}
                        </div>
                      </div>
                    )}
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          outerRadius={120}
                          fill="#8884d8"
                          dataKey="value"
                          onClick={(data, index, event) => handlePieClick(data.name, event as any)}
                          style={{ cursor: 'pointer' }}
                          labelLine={true}
                          label={(props: any) => {
                            const { cx, cy, midAngle, outerRadius, name, percent } = props
                            const RADIAN = Math.PI / 180
                            const radius = outerRadius + 25
                            const x = cx + radius * Math.cos(-midAngle * RADIAN)
                            const y = cy + radius * Math.sin(-midAngle * RADIAN)
                            const percentValue = (percent ?? 0) * 100
                            const percentString = percentValue.toFixed(0)

                            if (percentValue < 1) return null

                            const text = percentValue > 3 ? `${name} ${percentString}%` : `${percentString}%`

                            return (
                              <text
                                x={x}
                                y={y}
                                fill="#1f2937"
                                textAnchor={x > cx ? 'start' : 'end'}
                                dominantBaseline="central"
                                style={{
                                  fontSize: '14px',
                                  fontWeight: 600,
                                  stroke: '#ffffff',
                                  strokeWidth: 3,
                                  paintOrder: 'stroke',
                                }}
                              >
                                {text}
                              </text>
                            )
                          }}
                          isAnimationActive={false}
                        >
                          {categoryData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              opacity={selectedCategories.size === 0 || selectedCategories.has(entry.name) ? 1 : 0.3}
                              stroke="#fff"
                              strokeWidth={2}
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
                          onClick={(e) => handleCategoryClick(cat.name, e)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            background: selectedCategories.has(cat.name) ? '#e0f2fe' : '#f8fafc',
                            border: selectedCategories.has(cat.name) ? '2px solid #0284c7' : '1px solid #e2e8f0',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            opacity: selectedCategories.size === 0 || selectedCategories.has(cat.name) ? 1 : 0.5,
                          }}
                          onMouseEnter={(e) => {
                            if (!selectedCategories.has(cat.name)) {
                              e.currentTarget.style.background = '#f1f5f9'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!selectedCategories.has(cat.name)) {
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
                            {selectedCategories.has(cat.name) && (
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
                )}
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
                      const isCapitalTx = capitalNames.has(transaction.category || '')
                      const isExternalTx = externalNames.has(transaction.category || '')
                      return (
                        <tr
                          key={transaction.id}
                          style={{
                            backgroundColor: isAutoClassified ? '#fef3c7' : isCapitalTx ? '#f5f3ff' : isExternalTx ? '#fffbeb' : undefined,
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
                            onChange={async (e) => {
                              const newCategory = e.target.value
                              // Update local state
                              setTransactions((prev) =>
                                prev.map((t) => (t.id === transaction.id ? { ...t, category: newCategory } : t))
                              )
                              // Save to storage
                              await transactionStore.updateAny(transaction.id, { category: newCategory })
                              // Save business-category mapping for auto-classification
                              await transactionStore.saveBusinessCategory(transaction.business, newCategory)
                            }}
                            style={{
                              padding: '0.25rem',
                              borderRadius: '0.25rem',
                              border: '1px solid #d1d5db',
                              fontSize: '0.875rem',
                              width: '100%',
                              direction: 'rtl',
                            }}
                          >
                            <option value="">בחר נושא</option>
                            {categories
                              .filter((cat) =>
                                transaction.amount > 0 ? cat.type === 'income' : cat.type === 'expense'
                              )
                              .map((cat) => {
                                // For parent categories, render them and their sub-categories
                                if (!cat.parentId) {
                                  const subCats = cat.subCategories?.map((subId) =>
                                    categories.find((c) => c.id === subId)
                                  ).filter(Boolean) || []

                                  return (
                                    <React.Fragment key={cat.id}>
                                      <option value={cat.name}>{cat.name}</option>
                                      {subCats.map((subCat) => (
                                        <option key={subCat!.id} value={subCat!.name}>
                                          {'  ┘─ ' + subCat!.name}
                                        </option>
                                      ))}
                                    </React.Fragment>
                                  )
                                }
                                // Sub-categories are already rendered with their parents
                                return null
                              })}
                          </select>
                        </td>
                        <td
                          style={{
                            color: capitalNames.has(transaction.category || '')
                              ? '#7c3aed'
                              : externalNames.has(transaction.category || '')
                              ? '#d97706'
                              : transaction.amount > 0 ? '#10b981' : '#ef4444',
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
