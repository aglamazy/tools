import React, { useEffect, useRef, useState } from 'react'
import { db } from '@/app/db/financeDB'
import type { Business, TaxDocument, Transaction, AdvancePayment } from '@/app/db/financeDB'
import type { TaxProfile } from '@/app/components/TaxProfileSection'

export type BTLRates = {
  reduced: { nationalInsurance: number; healthInsurance: number }
  regular: { nationalInsurance: number; healthInsurance: number }
  threshold: number; maxIncome: number; minIncome: number
}

export type IncomeTaxStep = { upTo: number; rate: number }

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const cellStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem',
  textAlign: 'left' as const,
  direction: 'ltr',
}

const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

// ---------------------------------------------------------------------------
// Self-Employed BTL Calculation Section (ביטוח לאומי + בריאות)
// ---------------------------------------------------------------------------

function computeMonthlyBTL(monthlyIncome: number, rates: BTLRates) {
  const below = Math.min(monthlyIncome, rates.threshold)
  const above = Math.max(0, Math.min(monthlyIncome, rates.maxIncome) - rates.threshold)
  const nationalInsurance = below * (rates.reduced.nationalInsurance / 100) + above * (rates.regular.nationalInsurance / 100)
  const healthInsurance = below * (rates.reduced.healthInsurance / 100) + above * (rates.regular.healthInsurance / 100)
  return { nationalInsurance, healthInsurance, total: nationalInsurance + healthInsurance }
}

export function SelfEmployedBTLSection({ businesses, transactions, bizCategoryMap, expCategoryMap, currentYear, currentMonth, rates, taxProfile, personUid }: {
  businesses: Business[]; transactions: Transaction[]; bizCategoryMap: Map<string, string[]>
  expCategoryMap: Map<string, string[]>; currentYear: number; currentMonth: number; rates: BTLRates; taxProfile?: TaxProfile; personUid?: string
}) {
  const seBiz = businesses.filter(b => !b.isTaxFree)
  if (seBiz.length === 0) return null

  const seCatNames = new Set<string>()
  const seExpCatNames = new Set<string>()
  for (const biz of seBiz) {
    (biz.syncId && bizCategoryMap.get(biz.syncId) || []).forEach(n => seCatNames.add(n))
    ;(biz.syncId && expCategoryMap.get(biz.syncId) || []).forEach(n => seExpCatNames.add(n))
  }

  // A BTL payment is any transaction whose category starts with "ביטוח לאומי".
  // personUid (the selected tab's uid) is passed in so we can still scope per
  // tab when classifications are tagged like "ביטוח לאומי (yaakov)".
  const [btlTx, setBtlTx] = useState<Transaction[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const all = await db.transactions.toArray()
      const yearTx = all.filter(
        (t) => t.category?.startsWith('ביטוח לאומי') && t.month?.endsWith(`/${currentYear}`),
      )
      if (!cancelled) setBtlTx(yearTx)
    })()
    return () => { cancelled = true }
  }, [currentYear])

  const paymentMonthStr = (i: number): string => {
    // Payment for month index i (0 = Jan) is made in the following calendar month.
    const nextIdx = i + 1
    if (nextIdx >= 12) return `01/${currentYear + 1}`
    return `${String(nextIdx + 1).padStart(2, '0')}/${currentYear}`
  }

  // Expected BTL amount and due date from the uploaded notice schedule, if any.
  const schedule = (taxProfile?.btlNotices || []).find(n => n.year === currentYear)?.schedule || []
  const scheduleByMonth = new Map(schedule.map(s => [s.month, s]))
  const fallbackAmount = taxProfile?.btlAdvancePayment || 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const monthlyRows = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const income = transactions.filter(t => t.month === monthStr && t.category && seCatNames.has(t.category)).reduce((s, t) => s + (t.amount || 0), 0)
    const expenses = transactions.filter(t => t.month === monthStr && t.category && seExpCatNames.has(t.category)).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const netIncome = Math.max(0, income - expenses)
    const btl = computeMonthlyBTL(netIncome, rates)
    // A BTL payment for calendar month i shows up as a transaction in month i+1.
    const payMonth = paymentMonthStr(i)
    const actualPaid = btlTx
      .filter((t) => t.month === payMonth)
      .reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const paid = actualPaid > 0

    // Expected amount: prefer schedule entry for this month, else the flat fallback.
    const scheduled = scheduleByMonth.get(monthStr)
    const expected = scheduled?.amount ?? fallbackAmount

    // Deadline: from schedule dueDate, else 15th of payment month.
    let deadline: Date
    if (scheduled?.dueDate) {
      deadline = new Date(scheduled.dueDate)
    } else {
      const [pm, py] = payMonth.split('/').map(Number)
      deadline = new Date(py, pm - 1, 15)
    }
    deadline.setHours(0, 0, 0, 0)

    // 5-day "due soon" window leading up to the deadline (10th-15th of the
    // payment month if deadline is the 15th).
    const windowStart = new Date(deadline)
    windowStart.setDate(windowStart.getDate() - 5)

    const status: 'paid' | 'overdue' | 'due-soon' | 'upcoming' =
      paid ? 'paid'
      : today > deadline ? 'overdue'
      : today >= windowStart ? 'due-soon'
      : 'upcoming'
    const diff = expected > 0 ? expected - btl.total : 0
    return {
      month: i,
      label: HEBREW_MONTHS[i],
      income, expenses, netIncome, ...btl,
      expected, actualPaid, status, diff,
      deadline, windowStart,
    }
  })

  const totals = {
    income: monthlyRows.reduce((s, r) => s + r.income, 0),
    expenses: monthlyRows.reduce((s, r) => s + r.expenses, 0),
    netIncome: monthlyRows.reduce((s, r) => s + r.netIncome, 0),
    nationalInsurance: monthlyRows.reduce((s, r) => s + r.nationalInsurance, 0),
    healthInsurance: monthlyRows.reduce((s, r) => s + r.healthInsurance, 0),
    total: monthlyRows.reduce((s, r) => s + r.total, 0),
    expected: monthlyRows.reduce((s, r) => s + r.expected, 0),
    diff: monthlyRows.reduce((s, r) => s + r.diff, 0),
  }

  // Only show the advance/status/diff columns when the person actually has a
  // configured downpayment (schedule or flat amount). Otherwise this section
  // is showing Suzi's (or any empty-profile) view and the status would be noise.
  const hasDownpayment = monthlyRows.some(r => r.expected > 0)

  const hStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, background: '#faf5ff', color: '#6b21a8', borderBottom: '2px solid #e2e8f0' }

  return (
    <div style={{ marginTop: '2rem', overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>ביטוח לאומי ובריאות — עצמאי — {currentYear}</h3>
      <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
        חישוב מבוסס על הכנסה נטו (הכנסה פחות הוצאות) מעסקים: {seBiz.map(b => b.name).join(', ')}
      </p>
      <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#6b21a8', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <span>ביטוח לאומי: {rates.reduced.nationalInsurance}%/{rates.regular.nationalInsurance}% (סף: {fmt(rates.threshold)})</span>
        <span>ביטוח בריאות: {rates.reduced.healthInsurance}%/{rates.regular.healthInsurance}% (סף: {fmt(rates.threshold)})</span>
        <span>תקרה: {fmt(rates.maxIncome)}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ ...hStyle, textAlign: 'right', direction: 'rtl' }}>חודש</th>
            <th style={hStyle}>הכנסה</th>
            <th style={hStyle}>הוצאות</th>
            <th style={hStyle}>הכנסה נטו</th>
            <th style={hStyle}>ביטוח לאומי</th>
            <th style={hStyle}>ביטוח בריאות</th>
            <th style={{ ...hStyle, background: '#f3e8ff' }}>סה&quot;כ</th>
            {hasDownpayment && <th style={hStyle}>מקדמות</th>}
            {hasDownpayment && <th style={hStyle}>סטטוס</th>}
            {hasDownpayment && <th style={hStyle}>הפרש</th>}
          </tr>
        </thead>
        <tbody>
          {monthlyRows.map(row => (
            <tr key={row.month} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 500 }}>{row.label}</td>
              <td style={cellStyle}>{row.income ? fmt(row.income) : '—'}</td>
              <td style={{ ...cellStyle, color: '#dc2626' }}>{row.expenses ? fmt(row.expenses) : '—'}</td>
              <td style={{ ...cellStyle, fontWeight: 500 }}>{row.netIncome ? fmt(row.netIncome) : '—'}</td>
              <td style={cellStyle}>{row.nationalInsurance ? fmt(row.nationalInsurance) : '—'}</td>
              <td style={cellStyle}>{row.healthInsurance ? fmt(row.healthInsurance) : '—'}</td>
              <td style={{ ...cellStyle, background: '#faf5ff', fontWeight: 500 }}>{row.total ? fmt(row.total) : '—'}</td>
              {hasDownpayment && <td style={cellStyle}>{row.expected ? fmt(row.expected) : '—'}</td>}
              {hasDownpayment && (
                <td style={{ ...cellStyle, fontSize: '1rem', textAlign: 'center' }} title={
                  row.status === 'paid' ? `שולם ✓ · סכום שנמצא: ${fmt(row.actualPaid)}`
                  : row.status === 'overdue' ? `באיחור — לא נמצא תשלום לאחר ${row.deadline.toLocaleDateString('he-IL')}`
                  : row.status === 'due-soon' ? `פעולה נדרשת — עד ${row.deadline.toLocaleDateString('he-IL')}`
                  : `יופיע לפעולה ב-${row.windowStart.toLocaleDateString('he-IL')}`
                }>
                  {row.status === 'paid' && (
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
                  )}
                  {row.status === 'overdue' && (
                    <span style={{
                      display: 'inline-block',
                      padding: '0.1rem 0.4rem',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '0.375rem',
                      color: '#b91c1c',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}>🚨 באיחור</span>
                  )}
                  {row.status === 'due-soon' && (
                    <span style={{
                      display: 'inline-block',
                      padding: '0.1rem 0.4rem',
                      background: '#fefce8',
                      border: '1px solid #fde68a',
                      borderRadius: '0.375rem',
                      color: '#a16207',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}>⏰ לתשלום</span>
                  )}
                  {row.status === 'upcoming' && (
                    <span style={{ color: '#cbd5e1' }}>·</span>
                  )}
                </td>
              )}
              {hasDownpayment && (
                <td style={{ ...cellStyle, fontWeight: 500, color: row.diff > 0 ? '#b45309' : row.diff < 0 ? '#dc2626' : undefined }}>{row.expected ? fmt(row.diff) : '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0', background: '#faf5ff' }}>
            <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.income)}</td>
            <td style={{ ...cellStyle, fontWeight: 700, color: '#dc2626' }}>{fmt(totals.expenses)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.netIncome)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.nationalInsurance)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.healthInsurance)}</td>
            <td style={{ ...cellStyle, fontWeight: 700, background: '#f3e8ff', color: '#6b21a8' }}>{fmt(totals.total)}</td>
            {hasDownpayment && <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.expected)}</td>}
            {hasDownpayment && <td style={cellStyle} />}
            {hasDownpayment && (
              <td style={{ ...cellStyle, fontWeight: 700, color: totals.diff > 0 ? '#b45309' : totals.diff < 0 ? '#dc2626' : '#16a34a' }}>{fmt(totals.diff)}</td>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Self-Employed Income Tax Calculation Section (מס הכנסה — עצמאי)
// ---------------------------------------------------------------------------

function computeIncomeTax(income: number, brackets: IncomeTaxStep[]): number {
  if (income <= 0 || brackets.length === 0) return 0

  const sorted = [...brackets].sort((a, b) => (a.upTo || Infinity) - (b.upTo || Infinity))
  let tax = 0
  let prev = 0

  for (let i = 0; i < sorted.length; i++) {
    const step = sorted[i]
    const isLast = i === sorted.length - 1
    const upper = isLast ? Infinity : step.upTo

    const bracketIncome = Math.min(income, upper) - prev
    if (bracketIncome > 0) {
      tax += bracketIncome * (step.rate / 100)
    }

    if (income <= upper) break
    prev = isLast ? prev : step.upTo
  }

  return tax
}

export function SelfEmployedIncomeTaxSection({ businesses, transactions, bizCategoryMap, expCategoryMap, currentYear, currentMonth, btlRates, brackets, salaryDocs, advancePayments, onUploadReceipt, taxProfile }: {
  businesses: Business[]; transactions: Transaction[]; bizCategoryMap: Map<string, string[]>
  expCategoryMap: Map<string, string[]>; currentYear: number; currentMonth: number; btlRates: BTLRates | null; brackets: IncomeTaxStep[]
  salaryDocs: TaxDocument[]
  advancePayments?: AdvancePayment[]
  onUploadReceipt?: (month: string, file: File) => Promise<void>
  taxProfile?: TaxProfile
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadMonth, setUploadMonth] = React.useState<string | null>(null)
  const seBiz = businesses.filter(b => !b.isTaxFree)
  if (seBiz.length === 0) return null

  const seCatNames = new Set<string>()
  const seExpCatNames = new Set<string>()
  for (const biz of seBiz) {
    (biz.syncId && bizCategoryMap.get(biz.syncId) || []).forEach(n => seCatNames.add(n))
    ;(biz.syncId && expCategoryMap.get(biz.syncId) || []).forEach(n => seExpCatNames.add(n))
  }

  const BTL_DEDUCTION_RATE = 0.52 // 52% of BTL paid is deductible

  // Income tax advance payment — from tax profile (person-level)
  const advancePercent = taxProfile?.incomeTaxAdvancePercent || 0
  const advancePeriod: 1 | 2 = taxProfile?.incomeTaxAdvancePeriod ?? 1
  const hasAdvance = advancePercent > 0

  // Calculate monthly salary from שכיר docs (grossIncome per month)
  const monthlySalary: number[] = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    return salaryDocs.filter(d => d.month === monthStr).reduce((s, d) => s + (d.grossIncome || 0), 0)
  })

  const monthlyRows = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const income = transactions.filter(t => t.month === monthStr && t.category && seCatNames.has(t.category)).reduce((s, t) => s + (t.amount || 0), 0)
    const expenses = transactions.filter(t => t.month === monthStr && t.category && seExpCatNames.has(t.category)).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const netIncome = income - expenses

    // BTL paid (use advance or calculated)
    let btlPaid = 0
    if (btlRates) {
      const monthlyNetForBtl = Math.max(0, netIncome)
      const btl = computeMonthlyBTL(monthlyNetForBtl, btlRates)
      btlPaid = btl.total
    }
    const btlMonthlyAdvance = taxProfile?.btlAdvancePayment || 0
    if (btlMonthlyAdvance > 0) btlPaid = btlMonthlyAdvance

    const btlDeduction = btlPaid * BTL_DEDUCTION_RATE
    const taxBase = Math.max(0, netIncome - btlDeduction)
    const salary = monthlySalary[i] || 0

    // Tax: compute on (salary + taxBase) minus tax on salary alone
    const taxTotal = computeIncomeTax(salary + taxBase, brackets)
    const taxSalaryOnly = computeIncomeTax(salary, brackets)
    const tax = taxTotal - taxSalaryOnly

    // Advance payment paid = % of income for the period
    // Bi-monthly: pay on even months (Feb, Apr, Jun...) covering 2 months of income
    let advancePaid = 0
    if (hasAdvance) {
      if (advancePeriod === 2) {
        // Bi-monthly: payment on even months (index 1, 3, 5... = Feb, Apr, Jun...)
        const isPaymentMonth = i % 2 === 1
        if (isPaymentMonth) {
          // Sum net income of this month + previous month
          const prevMonthStr = `${String(i).padStart(2, '0')}/${currentYear}`
          const prevIncome = transactions.filter(t => t.month === prevMonthStr && t.category && seCatNames.has(t.category)).reduce((s, t) => s + (t.amount || 0), 0)
          const prevExpenses = transactions.filter(t => t.month === prevMonthStr && t.category && seExpCatNames.has(t.category)).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
          const prevNetIncome = prevIncome - prevExpenses
          advancePaid = (prevNetIncome + netIncome) * (advancePercent / 100)
        }
      } else {
        advancePaid = income * (advancePercent / 100)
      }
    }

    // Payment status from advancePayments records
    const monthKey = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const paymentRecord = advancePayments?.find(p => p.month === monthKey && p.type === 'incomeTax')
    const isPaymentMonth = advancePeriod === 2 ? i % 2 === 1 : true
    const isDue = hasAdvance && isPaymentMonth && advancePaid > 0

    return { month: i, label: HEBREW_MONTHS[i], income, expenses, netIncome, btlPaid, btlDeduction, taxBase, salary, tax, advancePaid, monthKey, paymentRecord, isDue }
  })

  const annualTotals = {
    income: monthlyRows.reduce((s, r) => s + r.income, 0),
    expenses: monthlyRows.reduce((s, r) => s + r.expenses, 0),
    netIncome: monthlyRows.reduce((s, r) => s + r.netIncome, 0),
    btlPaid: monthlyRows.reduce((s, r) => s + r.btlPaid, 0),
    btlDeduction: monthlyRows.reduce((s, r) => s + r.btlDeduction, 0),
    taxBase: monthlyRows.reduce((s, r) => s + r.taxBase, 0),
    salary: monthlyRows.reduce((s, r) => s + r.salary, 0),
    tax: monthlyRows.reduce((s, r) => s + r.tax, 0),
    advancePaid: monthlyRows.reduce((s, r) => s + r.advancePaid, 0),
  }

  const hStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, background: '#fff7ed', color: '#92400e', borderBottom: '2px solid #e2e8f0' }

  return (
    <div style={{ marginTop: '2rem', overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>מס הכנסה — עצמאי — {currentYear}</h3>
      <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
        חישוב מבוסס על הכנסה נטו פחות 52% מביטוח לאומי ששולם. עסקים: {seBiz.map(b => b.name).join(', ')}
        {annualTotals.salary > 0 ? ` | הכנסה ממשכורת: ${fmt(annualTotals.salary)} (מדרגות מס מחושבות בהתאם)` : ''}
      </p>

      {/* Brackets info */}
      <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#92400e' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>מדרגות מס {currentYear}:</div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {[...brackets].sort((a, b) => (a.upTo || Infinity) - (b.upTo || Infinity)).map((step, idx, arr) => (
            <span key={idx}>
              {!step.upTo
                ? `מעל ${(arr[idx - 1]?.upTo || 0).toLocaleString('he-IL')}₪`
                : `עד ${step.upTo.toLocaleString('he-IL')}₪`
              }: {step.rate}%
            </span>
          ))}
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file && uploadMonth && onUploadReceipt) {
            await onUploadReceipt(uploadMonth, file)
          }
          e.target.value = ''
          setUploadMonth(null)
        }}
      />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ ...hStyle, textAlign: 'right', direction: 'rtl' }}>חודש</th>
            <th style={hStyle}>הכנסה נטו</th>
            <th style={hStyle}>בל&quot;ל ששולם</th>
            <th style={hStyle}>ניכוי 52%</th>
            <th style={{ ...hStyle, background: '#fef3c7' }}>בסיס לתשלום</th>
            {annualTotals.salary > 0 && <th style={hStyle}>הכנסה חייבת (שכיר)</th>}
            <th style={{ ...hStyle, background: '#fef3c7' }}>מס הכנסה</th>
            {hasAdvance && <th style={hStyle}>מקדמה</th>}
            {hasAdvance && <th style={hStyle}>סטטוס</th>}
          </tr>
        </thead>
        <tbody>
          {monthlyRows.map(row => (
            <tr key={row.month} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 500 }}>{row.label}</td>
              <td style={cellStyle}>{row.netIncome ? fmt(row.netIncome) : '—'}</td>
              <td style={cellStyle}>{row.btlPaid ? fmt(row.btlPaid) : '—'}</td>
              <td style={{ ...cellStyle, color: '#16a34a' }}>{row.btlDeduction ? fmt(row.btlDeduction) : '—'}</td>
              <td style={{ ...cellStyle, background: '#fffbeb', fontWeight: 500 }}>{row.taxBase ? fmt(row.taxBase) : '—'}</td>
              {annualTotals.salary > 0 && <td style={cellStyle}>{row.salary ? fmt(row.salary) : '—'}</td>}
              <td style={{ ...cellStyle, background: '#fffbeb', fontWeight: 500, color: '#b45309' }}>{row.tax ? fmt(row.tax) : '—'}</td>
              {hasAdvance && <td style={cellStyle}>{row.advancePaid ? fmt(row.advancePaid) : '—'}</td>}
              {hasAdvance && (
                <td style={{ ...cellStyle, direction: 'rtl' }}>
                  {row.isDue ? (
                    row.paymentRecord?.paidAt ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ color: '#16a34a', fontWeight: 500, fontSize: '0.8rem' }}>שולם</span>
                        {row.paymentRecord.driveWebViewLink && (
                          <a href={row.paymentRecord.driveWebViewLink} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.75rem' }}>קבלה</a>
                        )}
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#d97706', fontWeight: 500, fontSize: '0.8rem' }}>ממתין</span>
                        <a href="https://secapp.taxes.gov.il/gmftashmhid/main/dvcTashlumMikdamot" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.75rem' }}>שלם</a>
                        {onUploadReceipt && (
                          <button
                            onClick={() => { setUploadMonth(row.monthKey); fileInputRef.current?.click() }}
                            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.25rem', padding: '0.1rem 0.35rem', cursor: 'pointer', fontSize: '0.7rem', color: '#64748b' }}
                          >
                            העלה אישור
                          </button>
                        )}
                      </span>
                    )
                  ) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0', background: '#fff7ed' }}>
            <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(annualTotals.netIncome)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(annualTotals.btlPaid)}</td>
            <td style={{ ...cellStyle, fontWeight: 700, color: '#16a34a' }}>{fmt(annualTotals.btlDeduction)}</td>
            <td style={{ ...cellStyle, fontWeight: 700, background: '#fef3c7' }}>{fmt(annualTotals.taxBase)}</td>
            {annualTotals.salary > 0 && <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(annualTotals.salary)}</td>}
            <td style={{ ...cellStyle, fontWeight: 700, background: '#fef3c7', color: '#b45309' }}>{fmt(annualTotals.tax)}</td>
            {hasAdvance && <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(annualTotals.advancePaid)}</td>}
            {hasAdvance && <td style={cellStyle} />}
          </tr>
          {hasAdvance && (
            <tr style={{ background: '#fef3c7' }}>
              <td colSpan={annualTotals.salary > 0 ? 7 : 6} style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>
                הפרש (מקדמות ששולמו − מס שחושב)
              </td>
              <td colSpan={2} style={{ ...cellStyle, fontWeight: 700, fontSize: '0.95rem', color: annualTotals.advancePaid - annualTotals.tax > 0 ? '#16a34a' : '#dc2626' }}>
                {fmt(annualTotals.advancePaid - annualTotals.tax)}
                <span style={{ fontSize: '0.75rem', fontWeight: 400, marginRight: '0.5rem' }}>
                  {annualTotals.advancePaid - annualTotals.tax > 0 ? '(שולם ביתר — יוחזר)' : annualTotals.advancePaid - annualTotals.tax < 0 ? '(שולם בחסר — לתשלום)' : ''}
                </span>
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  )
}
