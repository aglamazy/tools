'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db, type Business, type ExpenseDocument, type Transaction } from '@/app/db/financeDB'
import type { Category } from '@/app/types/category'
import { effectiveExpenseAmount } from './expenseScale'
import Modal from '@/app/components/Modal'
import BusinessForm from '@/app/components/settings/BusinessForm'
import type { BusinessUI } from '@/app/types/business'
import { businessStore } from '@/app/stores/businessStore'
import { HEBREW_MONTHS, cellStyle, tHeaderStyle, fmt } from './taxSharedStyles'
import ExpenseMatchCell from './ExpenseMatchCell'

type SelfEmployedTableProps = {
  businesses: Business[]
  transactions: Transaction[]
  bizCategoryMap: Map<number, string[]>
  expCategoryMap: Map<number, string[]>
  categoryByName: Map<string, Category>
  currentYear: number
  currentMonth: number
}

export default function SelfEmployedSummaryTable({ businesses, transactions, bizCategoryMap, expCategoryMap, categoryByName, currentYear, currentMonth }: SelfEmployedTableProps) {
  // Household-scope deductible expense category names: any category with no
  // businessId but deductibleByMember set. Each appears under "משק בית" in
  // the table, NOT under a business column, even though tax math still folds
  // them into per-business deductions via expCategoryMap.
  const householdCatNames = useMemo(() => {
    const names = new Set<string>()
    for (const c of categoryByName.values()) {
      if (c.businessId == null && c.type === 'expense' && c.isDeductible && c.deductibleByMember) {
        names.add(c.name)
      }
    }
    return names
  }, [categoryByName])

  const monthlyData = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`

    const bizIncome: Record<number, number> = {}
    const bizExpense: Record<number, number> = {}
    let householdExpense = 0
    for (const biz of businesses) {
      const catNames = bizCategoryMap.get(biz.id!) || []
      const bizTx = transactions.filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
      bizIncome[biz.id!] = bizTx.reduce((s, t) => s + (t.amount || 0), 0)

      // Per-business expense column: only business-scoped categories
      // (cat.businessId === biz.id). Household-deductible categories go to
      // the household column instead.
      const allExpCatNames = expCategoryMap.get(biz.id!) || []
      const bizScopedCatNames = allExpCatNames.filter(n => !householdCatNames.has(n))
      const expTx = transactions.filter(t => t.month === monthStr && t.category && bizScopedCatNames.includes(t.category) && t.amount < 0)
        .filter(t => !t.currentStep || t.currentStep === 1)
        .map(t => {
          if (t.totalSteps && t.totalSteps > 1) {
            const fullAmount = t.totalAmount || (t.totalSteps * Math.abs(t.amount))
            return { ...t, amount: -fullAmount }
          }
          return t
        })
      bizExpense[biz.id!] = expTx.reduce((s, t) => s + effectiveExpenseAmount(t, biz, categoryByName), 0)
    }

    // Household column — share-adjusted via the FIRST business of the person
    // (all businesses on an individual tab share the same userId).
    const hostBiz = businesses[0]
    if (hostBiz) {
      const hhTx = transactions.filter(t => t.month === monthStr && t.category && householdCatNames.has(t.category) && t.amount < 0)
        .filter(t => !t.currentStep || t.currentStep === 1)
        .map(t => {
          if (t.totalSteps && t.totalSteps > 1) {
            const fullAmount = t.totalAmount || (t.totalSteps * Math.abs(t.amount))
            return { ...t, amount: -fullAmount }
          }
          return t
        })
      householdExpense = hhTx.reduce((s, t) => s + effectiveExpenseAmount(t, hostBiz, categoryByName), 0)
    }

    return { month: i, label: HEBREW_MONTHS[i], bizIncome, bizExpense, householdExpense }
  })

  const totals = {
    bizIncome: Object.fromEntries(businesses.map(biz => [
      biz.id!, monthlyData.reduce((s, m) => s + (m.bizIncome[biz.id!] || 0), 0),
    ])),
    bizExpense: Object.fromEntries(businesses.map(biz => [
      biz.id!, monthlyData.reduce((s, m) => s + (m.bizExpense[biz.id!] || 0), 0),
    ])),
    householdExpense: monthlyData.reduce((s, m) => s + m.householdExpense, 0),
  }

  // Annual profit forecast — two projections per business. Profit per month =
  // bizIncome - bizExpense (per-business expense column only; household-shared
  // deductibles are NOT folded in here — they sit in their own column).
  //   A) avgAll * 12   — naive: (sum so far / past months) extrapolated to 12.
  //   B) sum + remain * avgRecent  — actuals to date + recent-trend (last
  //      up-to-3 months) projected onto the remaining months. Catches a
  //      late-year ramp or fall that the all-months average smooths over.
  const forecast = useMemo(() => {
    const pastMonths = monthlyData.length          // = currentMonth + 1
    const remain = Math.max(0, 12 - pastMonths)
    const recentN = Math.min(3, pastMonths)
    const recentMonths = recentN > 0 ? monthlyData.slice(-recentN) : []

    const profitOf = (m: typeof monthlyData[number], id: number) =>
      (m.bizIncome[id] || 0) - (m.bizExpense[id] || 0)

    const perBiz = businesses.map(biz => {
      const id = biz.id!
      const sumPast = monthlyData.reduce((s, m) => s + profitOf(m, id), 0)
      const avgAll = pastMonths > 0 ? sumPast / pastMonths : 0
      const recentSum = recentMonths.reduce((s, m) => s + profitOf(m, id), 0)
      const avgRecent = recentN > 0 ? recentSum / recentN : 0
      return {
        biz,
        figA: avgAll * 12,
        figB: sumPast + remain * avgRecent,
      }
    })

    return {
      perBiz,
      pastMonths,
      remain,
      recentN,
      totals: {
        figA: perBiz.reduce((s, r) => s + r.figA, 0),
        figB: perBiz.reduce((s, r) => s + r.figB, 0),
      },
    }
  }, [monthlyData, businesses])

  const [drillDown, setDrillDown] = useState<{ monthIdx: number; bizId: number | 'household'; kind: 'income' | 'expense' } | null>(null)
  const [editingBiz, setEditingBiz] = useState<BusinessUI | null>(null)
  const [expenseDocs, setExpenseDocs] = useState<ExpenseDocument[]>([])
  const [claudeApiKey, setClaudeApiKey] = useState<string>('')

  useEffect(() => {
    let alive = true
    void (async () => {
      const [docs, claudeKey] = await Promise.all([
        db.expenseDocuments.toArray(),
        db.appSettings.where('key').equals('claudeApiKey').first(),
      ])
      if (!alive) return
      setExpenseDocs(docs)
      if (claudeKey?.value) setClaudeApiKey(claudeKey.value)
    })()
    return () => { alive = false }
  }, [])

  const docByTxId = useMemo(() => {
    const m = new Map<number, ExpenseDocument>()
    for (const d of expenseDocs) {
      if (d.transactionId != null) m.set(d.transactionId, d)
    }
    return m
  }, [expenseDocs])

  const onDocMatched = async (doc: ExpenseDocument) => {
    const id = await db.expenseDocuments.add(doc)
    setExpenseDocs(prev => [...prev, { ...doc, id: id as number }])
  }

  const handleBizSave = async () => {
    if (!editingBiz) return
    await businessStore.saveUI(editingBiz, false)
    setEditingBiz(null)
  }

  const getDrillDownTransactions = () => {
    if (!drillDown) return []
    const monthStr = `${String(drillDown.monthIdx + 1).padStart(2, '0')}/${currentYear}`
    let catNames: string[] = []
    if (drillDown.bizId === 'household') {
      catNames = Array.from(householdCatNames)
    } else {
      const all = (drillDown.kind === 'income' ? bizCategoryMap : expCategoryMap).get(drillDown.bizId) || []
      // Per-biz expense drill: strip household-scoped cats (they live in the household column now)
      catNames = drillDown.kind === 'expense' ? all.filter(n => !householdCatNames.has(n)) : all
    }
    return transactions
      .filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
      .filter(t => drillDown.kind === 'income' ? t.amount >= 0 : t.amount < 0)
      .filter(t => t.amount >= 0 || !t.currentStep || t.currentStep === 1)
      .map(t => {
        if (t.amount < 0 && t.totalSteps && t.totalSteps > 1) {
          const fullAmount = t.totalAmount || (t.totalSteps * Math.abs(t.amount))
          return { ...t, amount: -fullAmount }
        }
        return t
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }

  const isCellOpen = (monthIdx: number, bizId: number | 'household', kind: 'income' | 'expense') =>
    drillDown?.monthIdx === monthIdx && drillDown?.bizId === bizId && drillDown?.kind === kind

  const subTh: React.CSSProperties = { ...tHeaderStyle, fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }
  const incomeBg = '#f0fdf4'
  const expenseBg = '#fef2f2'
  const incomeOpen = '#bbf7d0'
  const expenseOpen = '#fecaca'

  return (
    <div style={{ overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>עצמאי — הכנסות / הוצאות {currentYear}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl', verticalAlign: 'bottom' }}>חודש</th>
            {businesses.map(biz => (
              <th key={biz.id} colSpan={2} style={{ ...tHeaderStyle, background: '#faf5ff', color: '#7c3aed', borderBottom: '1px solid #e2e8f0' }}>
                {biz.name}
                <button
                  onClick={() => { const { createdAt: _, updatedAt: __, ...ui } = biz; setEditingBiz({ ...ui, id: biz.id! }) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', marginRight: '0.25rem' }}
                  title="הגדרות עסק"
                >⚙️</button>
              </th>
            ))}
            {householdCatNames.size > 0 && (
              <th rowSpan={2} style={{ ...tHeaderStyle, background: '#fef9c3', color: '#854d0e', verticalAlign: 'bottom' }}>
                משק בית
              </th>
            )}
          </tr>
          <tr>
            {businesses.map(biz => (
              <React.Fragment key={biz.id}>
                <th style={{ ...subTh, color: '#16a34a' }}>הכנסה</th>
                <th style={{ ...subTh, color: '#dc2626' }}>הוצאה</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthlyData.map(row => (
            <tr key={row.month} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 500 }}>{row.label}</td>
              {businesses.map(biz => {
                const income = row.bizIncome[biz.id!] || 0
                const expense = row.bizExpense[biz.id!] || 0
                return (
                  <React.Fragment key={biz.id}>
                    <td
                      onClick={() => income ? setDrillDown(isCellOpen(row.month, biz.id!, 'income') ? null : { monthIdx: row.month, bizId: biz.id!, kind: 'income' }) : undefined}
                      style={{
                        ...cellStyle,
                        background: isCellOpen(row.month, biz.id!, 'income') ? incomeOpen : incomeBg,
                        cursor: income ? 'pointer' : 'default',
                        color: '#16a34a',
                      }}
                    >
                      {income ? fmt(income) : '—'}
                    </td>
                    <td
                      onClick={() => expense ? setDrillDown(isCellOpen(row.month, biz.id!, 'expense') ? null : { monthIdx: row.month, bizId: biz.id!, kind: 'expense' }) : undefined}
                      style={{
                        ...cellStyle,
                        background: isCellOpen(row.month, biz.id!, 'expense') ? expenseOpen : expenseBg,
                        cursor: expense ? 'pointer' : 'default',
                        color: '#dc2626',
                      }}
                    >
                      {expense ? fmt(expense) : '—'}
                    </td>
                  </React.Fragment>
                )
              })}
              {householdCatNames.size > 0 && (
                <td
                  onClick={() => row.householdExpense
                    ? setDrillDown(isCellOpen(row.month, 'household', 'expense') ? null : { monthIdx: row.month, bizId: 'household', kind: 'expense' })
                    : undefined}
                  style={{
                    ...cellStyle,
                    background: isCellOpen(row.month, 'household', 'expense') ? '#fde68a' : '#fef9c3',
                    cursor: row.householdExpense ? 'pointer' : 'default',
                    color: '#854d0e',
                  }}
                >
                  {row.householdExpense ? fmt(row.householdExpense) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0' }}>
            <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
            {businesses.map(biz => (
              <React.Fragment key={biz.id}>
                <td style={{ ...cellStyle, fontWeight: 700, background: incomeBg, color: '#16a34a' }}>
                  {fmt(totals.bizIncome[biz.id!] || 0)}
                </td>
                <td style={{ ...cellStyle, fontWeight: 700, background: expenseBg, color: '#dc2626' }}>
                  {fmt(totals.bizExpense[biz.id!] || 0)}
                </td>
              </React.Fragment>
            ))}
            {householdCatNames.size > 0 && (
              <td style={{ ...cellStyle, fontWeight: 700, background: '#fef9c3', color: '#854d0e' }}>
                {fmt(totals.householdExpense)}
              </td>
            )}
          </tr>
        </tfoot>
      </table>

      {/* Drill-down panel */}
      {drillDown && (() => {
        const isHousehold = drillDown.bizId === 'household'
        const biz = isHousehold ? undefined : businesses.find(b => b.id === drillDown.bizId)
        // For household column we still need a business context for the
        // share-% scaling — use the first business (homogeneous owner on
        // an individual member tab).
        const shareBiz = biz || businesses[0]
        const txList = getDrillDownTransactions()
        const isExpense = drillDown.kind === 'expense'
        const effectiveAmount = (t: Transaction): number => {
          if (!isExpense || !shareBiz) return t.amount || 0
          return -effectiveExpenseAmount(t, shareBiz, categoryByName)
        }
        const total = txList.reduce((s, t) => s + effectiveAmount(t), 0)
        const panelTitle = isHousehold ? 'משק בית' : biz?.name
        return (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            background: '#fffbeb',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                {panelTitle} — {drillDown.kind === 'income' ? 'הכנסות' : 'הוצאות'} — {HEBREW_MONTHS[drillDown.monthIdx]} {currentYear}
              </h4>
              <button
                onClick={() => setDrillDown(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>
            {txList.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>אין תנועות</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>תאריך</th>
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>תיאור</th>
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>קטגוריה</th>
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>אמצעי תשלום</th>
                    <th style={tHeaderStyle}>סכום</th>
                    {isExpense && <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>מסמך</th>}
                  </tr>
                </thead>
                <tbody>
                  {txList.map(tx => {
                    const budgetHref = tx.id != null && tx.month
                      ? `/app/budget?month=${encodeURIComponent(tx.month)}&tx=${tx.id}#tx-${tx.id}`
                      : undefined
                    return (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.date}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>
                        {budgetHref ? (
                          <a
                            href={budgetHref}
                            title="פתח בעמוד התקציב לעדכון הסיווג"
                            style={{ color: '#2563eb', textDecoration: 'none' }}
                          >
                            {tx.description}
                          </a>
                        ) : tx.description}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.category}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', color: '#64748b', fontSize: '0.8rem' }}>
                        {tx.type === 'credit' && tx.cardNumber
                          ? `כרטיס ${tx.cardNumber}`
                          : tx.type === 'bank' && tx.accountNumber
                            ? `חשבון ${tx.accountNumber}`
                            : 'מזומן'}
                      </td>
                      <td style={{ ...cellStyle, color: tx.amount >= 0 ? '#16a34a' : '#dc2626' }}>
                        {(() => {
                          const eff = effectiveAmount(tx)
                          if (!isExpense || eff === tx.amount) return fmt(tx.amount)
                          return (
                            <span title={`מקורי: ${fmt(tx.amount)}`}>
                              {fmt(eff)}
                              <span style={{ marginInlineStart: '0.4rem', fontSize: '0.75em', color: '#94a3b8' }}>
                                ({fmt(tx.amount)})
                              </span>
                            </span>
                          )
                        })()}
                      </td>
                      {isExpense && (
                        <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>
                          {tx.id != null && (
                            <ExpenseMatchCell
                              transaction={{
                                id: tx.id,
                                date: tx.date,
                                description: tx.description || '',
                                merchant: tx.merchant,
                                amount: tx.amount,
                              }}
                              linkedDoc={docByTxId.get(tx.id)}
                              claudeApiKey={claudeApiKey}
                              onMatched={onDocMatched}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                    <td colSpan={4} style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: total >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(total)}</td>
                    {isExpense && <td style={cellStyle}></td>}
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )
      })()}
      {/* Annual income forecast */}
      {forecast.pastMonths > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>תחזית רווח שנתית {currentYear}</h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 0, marginBottom: '0.75rem' }}>
            רווח לעסק (הכנסה − הוצאה לעסק) — מבוסס על {forecast.pastMonths} חודשים מתחילת השנה. נותרו {forecast.remain} חודשים. הוצאות משותפות למשק הבית לא כלולות בחישוב.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>עסק</th>
                <th style={tHeaderStyle}>
                  ממוצע × 12
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>
                    (ממוצע על כל החודשים)
                  </div>
                </th>
                <th style={tHeaderStyle}>
                  עד עכשיו + נותר × ממוצע {forecast.recentN}
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>
                    ({forecast.recentN} חודשים אחרונים)
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {forecast.perBiz.map(({ biz, figA, figB }) => (
                <tr key={biz.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{biz.name}</td>
                  <td style={{ ...cellStyle, background: incomeBg, color: '#16a34a' }}>{fmt(figA)}</td>
                  <td style={{ ...cellStyle, background: incomeBg, color: '#16a34a' }}>{fmt(figB)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
                <td style={{ ...cellStyle, background: incomeBg, color: '#16a34a', fontWeight: 700 }}>
                  {fmt(forecast.totals.figA)}
                </td>
                <td style={{ ...cellStyle, background: incomeBg, color: '#16a34a', fontWeight: 700 }}>
                  {fmt(forecast.totals.figB)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Modal isOpen={!!editingBiz} onClose={() => setEditingBiz(null)} maxWidth="500px">
        {editingBiz && (
          <BusinessForm business={editingBiz} onChange={setEditingBiz} onSave={handleBizSave} onCancel={() => setEditingBiz(null)} isNew={false} />
        )}
      </Modal>
    </div>
  )
}
