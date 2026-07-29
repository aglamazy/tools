'use client'

import React from 'react'
import type { TaxDocument, Business, Transaction } from '@/app/db/financeDB'
import type { HouseholdMember } from './TaxesDebugPanel'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const cellStyle: React.CSSProperties = { padding: '0.4rem 0.6rem', fontSize: '0.82rem', textAlign: 'center' }
const tHeaderStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, background: '#f8fafc', color: '#475569', borderBottom: '2px solid #e2e8f0' }
const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })
const fmtVal = (n: number, style?: React.CSSProperties): React.ReactNode =>
  n ? <span style={n < 0 ? { color: '#dc2626', ...style } : style}>{fmt(n)}</span> : '—'

type Props = {
  members: HouseholdMember[]
  docs: TaxDocument[]
  selfEmployedBizzes: Business[]
  employeeBizzes: Business[]
  rentalBusinesses: Business[]
  transactions: Transaction[]
  bizCategoryMap: Map<string, string[]>
  expCategoryMap: Map<string, string[]>
  currentYear: number
  currentMonth: number
}

export default function HouseholdIncomeSummary({ members, docs, selfEmployedBizzes, employeeBizzes, rentalBusinesses, transactions, bizCategoryMap, expCategoryMap, currentYear, currentMonth }: Props) {
  const showRental = rentalBusinesses.length > 0

  // Build businessSyncId→userId map so docs without userId can be attributed by their business's owner
  const bizOwnerMap = new Map<string, string>()
  for (const biz of [...selfEmployedBizzes, ...employeeBizzes, ...rentalBusinesses]) {
    if (biz.syncId && biz.userId) bizOwnerMap.set(biz.syncId, biz.userId)
  }

  const belongsToMember = (d: TaxDocument, uid: string) =>
    d.userId === uid || (!d.userId && d.businessId != null && bizOwnerMap.get(d.businessId) === uid)

  const monthlyData = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`

    const perMember = members.map(member => {
      // שכיר: payslip docs + Employee-type business transactions (e.g. pension via bank)
      const memberDocs = docs.filter(d => d.month === monthStr && belongsToMember(d, member.uid))
      let employeeNet = memberDocs.reduce((s, d) => s + (d.netIncome || 0), 0)
      for (const biz of employeeBizzes.filter(b => b.userId === member.uid)) {
        const catNames = bizCategoryMap.get(biz.syncId!) || []
        employeeNet += transactions
          .filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
          .reduce((s, t) => s + (t.amount || 0), 0)
      }

      // עצמאי: from transactions
      let selfNet = 0
      for (const biz of selfEmployedBizzes.filter(b => b.userId === member.uid)) {
        const catNames = bizCategoryMap.get(biz.syncId!) || []
        const expCatNames = expCategoryMap.get(biz.syncId!) || []
        const income = transactions
          .filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
          .reduce((s, t) => s + (t.amount || 0), 0)
        const expTx = transactions
          .filter(t => t.month === monthStr && t.category && expCatNames.includes(t.category) && t.amount < 0)
          .filter(t => !t.currentStep || t.currentStep === 1)
          .map(t => t.totalSteps && t.totalSteps > 1 ? { ...t, amount: -(t.totalAmount || t.totalSteps * Math.abs(t.amount)) } : t)
        selfNet += income - expTx.reduce((s, t) => s + Math.abs(t.amount), 0)
      }
      return { employeeNet, selfNet }
    })

    const rental = rentalBusinesses.reduce((sum, biz) => {
      const catNames = bizCategoryMap.get(biz.syncId!) || []
      return sum + transactions
        .filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
        .reduce((s, t) => s + (t.amount || 0), 0)
    }, 0)

    const rowTotal = perMember.reduce((s, m) => s + m.employeeNet + m.selfNet, 0) + rental
    return { label: HEBREW_MONTHS[i], perMember, rental, rowTotal }
  })

  const colTotals = members.map((_, mi) => ({
    employeeNet: monthlyData.reduce((s, row) => s + row.perMember[mi].employeeNet, 0),
    selfNet: monthlyData.reduce((s, row) => s + row.perMember[mi].selfNet, 0),
  }))
  const rentalTotal = monthlyData.reduce((s, row) => s + row.rental, 0)
  const grandTotal = colTotals.reduce((s, m) => s + m.employeeNet + m.selfNet, 0) + rentalTotal

  // Determine which sub-columns to show per member
  const memberCols = members.map((m, mi) => ({
    uid: m.uid,
    label: m.label.split(' ')[0],
    showEmployee: colTotals[mi].employeeNet > 0,
    showSelf: colTotals[mi].selfNet > 0,
  }))

  const tdR: React.CSSProperties = { ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 500 }
  const subTh: React.CSSProperties = { ...tHeaderStyle, fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }

  const hasSubHeaders = memberCols.some(mc => mc.showEmployee && mc.showSelf)

  return (
    <div style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>משק בית — סיכום הכנסות {currentYear}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr>
            <th rowSpan={hasSubHeaders ? 2 : 1} style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl', verticalAlign: 'bottom' }}>חודש</th>
            {memberCols.map(mc => {
              const span = (mc.showEmployee ? 1 : 0) + (mc.showSelf ? 1 : 0)
              if (span === 0) return null
              if (span === 1 && !hasSubHeaders) {
                return <th key={mc.uid} style={tHeaderStyle}>{mc.label}</th>
              }
              return (
                <th key={mc.uid} colSpan={span} style={{ ...tHeaderStyle, borderBottom: hasSubHeaders ? '1px solid #e2e8f0' : undefined }}>
                  {mc.label}
                </th>
              )
            })}
            {showRental && <th rowSpan={hasSubHeaders ? 2 : 1} style={{ ...tHeaderStyle, background: '#ecfdf5', color: '#059669', verticalAlign: 'bottom' }}>השכרת דירה</th>}
            <th rowSpan={hasSubHeaders ? 2 : 1} style={{ ...tHeaderStyle, background: '#f0f9ff', color: '#1e40af', verticalAlign: 'bottom' }}>סה&quot;כ</th>
          </tr>
          {hasSubHeaders && (
            <tr>
              {memberCols.map(mc => (
                <React.Fragment key={mc.uid}>
                  {mc.showEmployee && <th style={subTh}>שכיר</th>}
                  {mc.showSelf && <th style={subTh}>עצמאי</th>}
                </React.Fragment>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {monthlyData.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={tdR}>{row.label}</td>
              {row.perMember.map((m, mi) => (
                <React.Fragment key={members[mi].uid}>
                  {memberCols[mi].showEmployee && <td style={cellStyle}>{fmtVal(m.employeeNet)}</td>}
                  {memberCols[mi].showSelf && <td style={cellStyle}>{fmtVal(m.selfNet)}</td>}
                </React.Fragment>
              ))}
              {showRental && <td style={{ ...cellStyle, background: '#f0fdf4' }}>{fmtVal(row.rental)}</td>}
              <td style={{ ...cellStyle, fontWeight: 500 }}>{fmtVal(row.rowTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f0f9ff' }}>
            <td style={{ ...tdR, fontWeight: 700 }}>סה&quot;כ</td>
            {colTotals.map((totals, mi) => (
              <React.Fragment key={members[mi].uid}>
                {memberCols[mi].showEmployee && <td style={{ ...cellStyle, fontWeight: 700 }}>{fmtVal(totals.employeeNet)}</td>}
                {memberCols[mi].showSelf && <td style={{ ...cellStyle, fontWeight: 700 }}>{fmtVal(totals.selfNet)}</td>}
              </React.Fragment>
            ))}
            {showRental && <td style={{ ...cellStyle, fontWeight: 700, color: '#059669', background: '#ecfdf5' }}>{fmtVal(rentalTotal)}</td>}
            <td style={{ ...cellStyle, fontWeight: 700, color: '#1e40af' }}>{fmtVal(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
