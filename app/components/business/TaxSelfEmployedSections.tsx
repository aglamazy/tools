import React from 'react'
import type { Business, TaxDocument, Transaction } from '@/app/db/financeDB'

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

export function SelfEmployedBTLSection({ businesses, transactions, bizCategoryMap, expCategoryMap, currentYear, currentMonth, rates }: {
  businesses: Business[]; transactions: Transaction[]; bizCategoryMap: Map<number, string[]>
  expCategoryMap: Map<number, string[]>; currentYear: number; currentMonth: number; rates: BTLRates
}) {
  const seBiz = businesses.filter(b => !b.isTaxFree)
  if (seBiz.length === 0) return null

  const seCatNames = new Set<string>()
  const seExpCatNames = new Set<string>()
  for (const biz of seBiz) {
    (bizCategoryMap.get(biz.id!) || []).forEach(n => seCatNames.add(n))
    ;(expCategoryMap.get(biz.id!) || []).forEach(n => seExpCatNames.add(n))
  }

  const monthlyAdvance = seBiz.reduce((s, b) => s + (b.btlAdvancePayment || 0), 0)
  const hasAdvance = monthlyAdvance > 0

  const monthlyRows = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const income = transactions.filter(t => t.month === monthStr && t.category && seCatNames.has(t.category)).reduce((s, t) => s + (t.amount || 0), 0)
    const expenses = transactions.filter(t => t.month === monthStr && t.category && seExpCatNames.has(t.category)).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const netIncome = Math.max(0, income - expenses)
    const btl = computeMonthlyBTL(netIncome, rates)
    // Payment for month i is due on 1st of month i+1
    const today = new Date()
    const paymentDue = new Date(currentYear, i + 1, 1)
    const paid = today >= paymentDue
    const advance = paid ? monthlyAdvance : 0
    const diff = paid && hasAdvance ? monthlyAdvance - btl.total : 0
    return { month: i, label: HEBREW_MONTHS[i], income, expenses, netIncome, ...btl, advance, diff, paid }
  })

  const totals = {
    income: monthlyRows.reduce((s, r) => s + r.income, 0),
    expenses: monthlyRows.reduce((s, r) => s + r.expenses, 0),
    netIncome: monthlyRows.reduce((s, r) => s + r.netIncome, 0),
    nationalInsurance: monthlyRows.reduce((s, r) => s + r.nationalInsurance, 0),
    healthInsurance: monthlyRows.reduce((s, r) => s + r.healthInsurance, 0),
    total: monthlyRows.reduce((s, r) => s + r.total, 0),
    advance: monthlyRows.reduce((s, r) => s + r.advance, 0),
    diff: monthlyRows.reduce((s, r) => s + r.diff, 0),
  }

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
            {hasAdvance && <th style={hStyle}>מקדמות</th>}
            {hasAdvance && <th style={hStyle}>הפרש</th>}
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
              {hasAdvance && <td style={cellStyle}>{row.paid ? fmt(row.advance) : '—'}</td>}
              {hasAdvance && <td style={{ ...cellStyle, fontWeight: 500, color: row.diff > 0 ? '#b45309' : row.diff < 0 ? '#dc2626' : undefined }}>{row.paid ? fmt(row.diff) : '—'}</td>}
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
            {hasAdvance && <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.advance)}</td>}
            {hasAdvance && <td style={{ ...cellStyle, fontWeight: 700, color: totals.diff > 0 ? '#b45309' : totals.diff < 0 ? '#dc2626' : '#16a34a' }}>{fmt(totals.diff)}</td>}
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

export function SelfEmployedIncomeTaxSection({ businesses, transactions, bizCategoryMap, expCategoryMap, currentYear, currentMonth, btlRates, brackets, salaryDocs }: {
  businesses: Business[]; transactions: Transaction[]; bizCategoryMap: Map<number, string[]>
  expCategoryMap: Map<number, string[]>; currentYear: number; currentMonth: number; btlRates: BTLRates | null; brackets: IncomeTaxStep[]
  salaryDocs: TaxDocument[]
}) {
  const seBiz = businesses.filter(b => !b.isTaxFree)
  if (seBiz.length === 0) return null

  const seCatNames = new Set<string>()
  const seExpCatNames = new Set<string>()
  for (const biz of seBiz) {
    (bizCategoryMap.get(biz.id!) || []).forEach(n => seCatNames.add(n))
    ;(expCategoryMap.get(biz.id!) || []).forEach(n => seExpCatNames.add(n))
  }

  const BTL_DEDUCTION_RATE = 0.52 // 52% of BTL paid is deductible

  // Income tax advance payment — % of income paid each month as מקדמה
  const advancePercent = seBiz.reduce((max, b) => Math.max(max, b.incomeTaxAdvancePercent || 0), 0)
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
    const monthlyAdvance = seBiz.reduce((s, b) => s + (b.btlAdvancePayment || 0), 0)
    if (monthlyAdvance > 0) btlPaid = monthlyAdvance

    const btlDeduction = btlPaid * BTL_DEDUCTION_RATE
    const taxBase = Math.max(0, netIncome - btlDeduction)
    const salary = monthlySalary[i] || 0

    // Tax: compute on (salary + taxBase) minus tax on salary alone
    const taxTotal = computeIncomeTax(salary + taxBase, brackets)
    const taxSalaryOnly = computeIncomeTax(salary, brackets)
    const tax = taxTotal - taxSalaryOnly

    // Advance payment paid = % of gross income for that month
    const advancePaid = hasAdvance ? income * (advancePercent / 100) : 0

    return { month: i, label: HEBREW_MONTHS[i], income, expenses, netIncome, btlPaid, btlDeduction, taxBase, salary, tax, advancePaid }
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
            {hasAdvance && <th style={hStyle}>מקדמה שולמה</th>}
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
          </tr>
          {hasAdvance && (
            <tr style={{ background: '#fef3c7' }}>
              <td colSpan={annualTotals.salary > 0 ? 6 : 5} style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>
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
