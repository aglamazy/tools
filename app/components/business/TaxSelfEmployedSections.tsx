import React, { useEffect, useRef, useState } from 'react'
import { db } from '@/app/db/financeDB'
import type { Business, TaxDocument, Transaction, AdvancePayment } from '@/app/db/financeDB'
import type { Category } from '@/app/types/category'
import { resolveBtlScheduleByMonth, vatTypeForDate, type TaxProfile } from '@/app/components/TaxProfileSection'
import { getVatRateForDate } from '@/app/lib/vat'
import { resolveExpenseLine, type ExpenseLine } from './expenseScale'
import MonthBreakdownPanel from './MonthBreakdownPanel'

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

/**
 * מקדמת מס הכנסה is a percentage of turnover (מחזור) EXCLUDING VAT — for an
 * עוסק מורשה the deposited amount includes VAT it collected on the state's
 * behalf, which is not the dealer's own turnover. Resolved per transaction
 * (not per month) via vatTypeForDate, since a mid-year exempt→authorized
 * conversion means a single bi-monthly period can straddle both statuses
 * (aglamazo#381).
 */
export function turnoverExVat(monthTransactions: Transaction[], taxProfile: TaxProfile | undefined): number {
  return monthTransactions.reduce((sum, t) => {
    const amount = t.amount || 0
    const vatType = taxProfile ? vatTypeForDate(taxProfile, t.date) : undefined
    if (vatType === 'authorized') {
      return sum + amount / (1 + getVatRateForDate(t.date))
    }
    return sum + amount
  }, 0)
}

// A payment made for calendar month i shows up as a transaction the
// following month — the same convention SelfEmployedBTLSection's
// paymentMonthStr already uses.
export function btlPaymentMonthFor(monthIndex: number, currentYear: number): string {
  const nextIdx = monthIndex + 1
  if (nextIdx >= 12) return `01/${currentYear + 1}`
  return `${String(nextIdx + 1).padStart(2, '0')}/${currentYear}`
}

/**
 * aglamazo#384 (Sheli/Agla, 2026-09-14): "בל״ל ששולם" was the flat profile
 * advance for every month regardless of what actually happened — real
 * payments stopped after May, and a ₪23,744 refund in July was never
 * subtracted. Real payments (minus real refunds landing in the same
 * payMonth) take priority; only when nothing real has landed yet does a
 * forecast apply — the per-month notice schedule (aglamazo#376) first, the
 * flat profile advance as a last resort — and it's flagged (isForecast) so
 * the UI never shows it as "paid".
 */
export function resolveBtlPaidForMonth(params: {
  payMonth: string
  btlPaymentTx: Transaction[]
  btlRefundTx: Transaction[]
  scheduledAmount: number | undefined
  fallbackAmount: number
}): { amount: number; isForecast: boolean } {
  const paymentsThisMonth = params.btlPaymentTx.filter((t) => t.month === params.payMonth)
  const refundsThisMonth = params.btlRefundTx.filter((t) => t.month === params.payMonth)
  // A real refund fully offsetting a real payment (net exactly 0) is still
  // a REAL month, not "nothing happened yet" — must not fall through to a
  // forecast just because the net figure happens to be zero.
  if (paymentsThisMonth.length > 0 || refundsThisMonth.length > 0) {
    const paid = paymentsThisMonth.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const refunded = refundsThisMonth.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    return { amount: Math.max(0, paid - refunded), isForecast: false }
  }
  const scheduled = params.scheduledAmount ?? params.fallbackAmount
  return scheduled > 0 ? { amount: scheduled, isForecast: true } : { amount: 0, isForecast: false }
}

/**
 * Cumulative net of what Agla has put into BTL: real payments minus real
 * refunds, running (aglamazo#391 — supersedes #386's charged-minus-paid-
 * plus-refunded definition, which Sheli found double-counts against a
 * charge that's already unreliable per #390). Charges never enter it — a
 * month with no payment and no refund simply carries the previous line
 * forward rather than accruing anything, which falls out of the formula on
 * its own since a 0/0 month contributes a zero delta. Ends the year at the
 * same figure as the income-tax table's own "net BTL cost" footnote
 * (aglamazo#384), by construction — both read the same payment/refund
 * transactions.
 */
export function computeBtlRunningBalance(
  rows: { paid: number; refunded: number }[],
): number[] {
  let running = 0
  return rows.map((r) => {
    running += r.paid - r.refunded
    return running
  })
}

export type BtlStatus = 'paid' | 'overdue' | 'due-soon' | 'upcoming' | 'none'

/**
 * A month's payment status for the BTL table's status badge. Agla, live,
 * on a real ₪0 row showing 🚨 באיחור: "0 can't be late." — a month with
 * nothing charged has nothing to be late on, so `expected === 0` is
 * checked as its own real state ('none'), ahead of the deadline
 * comparison, rather than falling through into 'upcoming'/'overdue' logic
 * that assumes there's something to track.
 */
export function resolveBtlStatus(params: {
  paid: boolean
  expected: number
  today: Date
  deadline: Date
  windowStart: Date
}): BtlStatus {
  if (params.paid) return 'paid'
  if (params.expected === 0) return 'none'
  if (params.today > params.deadline) return 'overdue'
  if (params.today >= params.windowStart) return 'due-soon'
  return 'upcoming'
}

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

export function SelfEmployedBTLSection({ businesses, transactions, bizCategoryMap, expCategoryMap, categoryByName, currentYear, currentMonth, rates, taxProfile, personUid, advancePayments, onUploadReceipt, onDetachReceipt }: {
  businesses: Business[]; transactions: Transaction[]; bizCategoryMap: Map<string, string[]>
  expCategoryMap: Map<string, string[]>; categoryByName: Map<string, Category>
  currentYear: number; currentMonth: number; rates: BTLRates; taxProfile?: TaxProfile; personUid?: string
  advancePayments?: AdvancePayment[]
  onUploadReceipt?: (month: string, file: File, type?: 'incomeTax' | 'btl') => Promise<void>
  onDetachReceipt?: (month: string, type?: 'incomeTax' | 'btl') => Promise<void>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadMonth, setUploadMonth] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const seBiz = businesses.filter(b => !b.isTaxFree)
  if (seBiz.length === 0) return null

  const seCatNames = new Set<string>()
  const seExpCatNames = new Set<string>()
  for (const biz of seBiz) {
    (biz.syncId && bizCategoryMap.get(biz.syncId) || []).forEach(n => seCatNames.add(n))
    ;(biz.syncId && expCategoryMap.get(biz.syncId) || []).forEach(n => seExpCatNames.add(n))
  }

  // A BTL payment is any transaction whose category starts with "ביטוח לאומי";
  // a refund is "החזר ביטוח לאומי" (aglamazo#386 — Agla, twice: "this page
  // should reflect my balance with BTL", "the refund is not here"). Both
  // shown as their own visible lines per his spec, never netted away.
  // personUid (the selected tab's uid) is passed in so we can still scope per
  // tab when classifications are tagged like "ביטוח לאומי (yaakov)".
  const [btlTx, setBtlTx] = useState<Transaction[]>([])
  const [btlRefundTx, setBtlRefundTx] = useState<Transaction[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const all = await db.transactions.toArray()
      const yearOf = (t: Transaction) => t.month?.endsWith(`/${currentYear}`)
      if (!cancelled) {
        setBtlTx(all.filter((t) => t.category?.startsWith('ביטוח לאומי') && yearOf(t)))
        setBtlRefundTx(all.filter((t) => t.category?.startsWith('החזר ביטוח לאומי') && yearOf(t)))
      }
    })()
    return () => { cancelled = true }
  }, [currentYear])

  const paymentMonthStr = (i: number): string => {
    // Payment for month index i (0 = Jan) is made in the following calendar month.
    const nextIdx = i + 1
    if (nextIdx >= 12) return `01/${currentYear + 1}`
    return `${String(nextIdx + 1).padStart(2, '0')}/${currentYear}`
  }

  // Expected BTL amount and due date from the uploaded notice schedule(s),
  // resolved per month (aglamazo#376 — a mid-year BTL revision adds a
  // second notice for the same year rather than replacing the first, so a
  // single "find one notice for this year" no longer covers every month).
  const scheduleByMonth = resolveBtlScheduleByMonth(taxProfile || {}, currentYear)
  const fallbackAmount = taxProfile?.btlAdvancePayment || 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const monthlyRows = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const income = transactions.filter(t => t.month === monthStr && t.category && seCatNames.has(t.category)).reduce((s, t) => s + (t.amount || 0), 0)
    // aglamazo#395 (Sheli): this table computed its own netIncome
    // independently of SelfEmployedIncomeTaxSection and missed #394's fix —
    // a household-folded category (ארנונה/חשמל) must scale by the member's
    // recognized % here too, since this netIncome drives the ביטוח לאומי +
    // בריאות calculation below.
    const expenses = transactions
      .filter(t => t.month === monthStr && t.category && seExpCatNames.has(t.category))
      .reduce((s, t) => s + resolveExpenseLine(t, seBiz, categoryByName).recognizedAmount, 0)
    const netIncome = Math.max(0, income - expenses)
    const btl = computeMonthlyBTL(netIncome, rates)
    // A BTL payment for calendar month i shows up as a transaction in month i+1.
    const payMonth = paymentMonthStr(i)
    const actualPaid = btlTx
      .filter((t) => t.month === payMonth)
      .reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const actualRefunded = btlRefundTx
      .filter((t) => t.month === payMonth)
      .reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    // aglamazo#387: a month can also be marked paid manually (paid directly
    // on BTL's site, approval uploaded here) before any matching bank
    // transaction lands — same shape as the income-tax section's
    // paymentRecord, now wired up for BTL too.
    const monthKey = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const paymentRecord = advancePayments?.find(p => p.month === monthKey && p.type === 'btl')
    const paid = actualPaid > 0 || !!paymentRecord?.paidAt

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

    const status = resolveBtlStatus({ paid, expected, today, deadline, windowStart })
    const diff = expected > 0 ? expected - btl.total : 0
    return {
      month: i,
      label: HEBREW_MONTHS[i],
      income, expenses, netIncome, ...btl,
      expected, actualPaid, actualRefunded, status, diff,
      deadline, windowStart, monthKey, paymentRecord,
      expectedIsOverride: !!scheduled?.isOverride,
      expectedOverrideNote: scheduled?.overrideNote,
    }
  })

  // aglamazo#391: running net of what's been paid vs. refunded — not a
  // balance owed. Charges don't enter it (see computeBtlRunningBalance).
  const btlRunningBalances = computeBtlRunningBalance(
    monthlyRows.map((r) => ({ paid: r.actualPaid, refunded: r.actualRefunded })),
  )

  const totals = {
    income: monthlyRows.reduce((s, r) => s + r.income, 0),
    expenses: monthlyRows.reduce((s, r) => s + r.expenses, 0),
    netIncome: monthlyRows.reduce((s, r) => s + r.netIncome, 0),
    nationalInsurance: monthlyRows.reduce((s, r) => s + r.nationalInsurance, 0),
    healthInsurance: monthlyRows.reduce((s, r) => s + r.healthInsurance, 0),
    total: monthlyRows.reduce((s, r) => s + r.total, 0),
    expected: monthlyRows.reduce((s, r) => s + r.expected, 0),
    diff: monthlyRows.reduce((s, r) => s + r.diff, 0),
    actualPaid: monthlyRows.reduce((s, r) => s + r.actualPaid, 0),
    actualRefunded: monthlyRows.reduce((s, r) => s + r.actualRefunded, 0),
    balance: btlRunningBalances.length > 0 ? btlRunningBalances[btlRunningBalances.length - 1] : 0,
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
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".pdf,.png,.jpg,.jpeg,.webp,.html,.htm"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file && uploadMonth && onUploadReceipt) {
            setUploadError(null)
            try {
              await onUploadReceipt(uploadMonth, file, 'btl')
            } catch (err) {
              setUploadError(err instanceof Error ? err.message : 'העלאת הקבלה נכשלה')
            }
          }
          e.target.value = ''
          setUploadMonth(null)
        }}
      />
      {uploadError && (
        <p style={{ fontSize: '0.8rem', color: '#dc2626', margin: '0 0 0.75rem 0' }}>
          ⚠️ {uploadError}
        </p>
      )}
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
            {hasDownpayment && <th style={hStyle}>מקדמות (חיוב)</th>}
            {hasDownpayment && <th style={hStyle}>סטטוס</th>}
            {hasDownpayment && <th style={hStyle}>שולם</th>}
            {hasDownpayment && <th style={hStyle}>הוחזר</th>}
            {hasDownpayment && <th style={{ ...hStyle, background: '#f3e8ff' }}>נטו שהופקד*</th>}
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
              {hasDownpayment && (
                <td style={cellStyle} title={row.expectedIsOverride ? `חריגה ידנית${row.expectedOverrideNote ? ` — ${row.expectedOverrideNote}` : ''}` : undefined}>
                  {row.expected ? fmt(row.expected) : '—'}
                  {row.expectedIsOverride && <span style={{ marginRight: '0.25rem' }}>✏️</span>}
                </td>
              )}
              {hasDownpayment && (
                <td style={{ ...cellStyle, fontSize: '1rem' }} title={
                  row.status === 'paid' ? `שולם ✓ · סכום שנמצא: ${fmt(row.actualPaid)}`
                  : row.status === 'none' ? 'אין חיוב לחודש זה'
                  : row.status === 'overdue' ? `באיחור — לא נמצא תשלום לאחר ${row.deadline.toLocaleDateString('he-IL')}`
                  : row.status === 'due-soon' ? `פעולה נדרשת — עד ${row.deadline.toLocaleDateString('he-IL')}`
                  : `יופיע לפעולה ב-${row.windowStart.toLocaleDateString('he-IL')}`
                }>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {row.status === 'paid' && (
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
                    )}
                    {row.status === 'none' && (
                      <span style={{ color: '#cbd5e1' }}>—</span>
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
                    {row.status === 'paid' && row.paymentRecord?.driveWebViewLink && (
                      <a href={row.paymentRecord.driveWebViewLink} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.75rem' }}>אישור</a>
                    )}
                    {row.status === 'paid' && onDetachReceipt && (
                      <button
                        onClick={async () => {
                          setUploadError(null)
                          try { await onDetachReceipt(row.monthKey, 'btl') } catch (err) { setUploadError(err instanceof Error ? err.message : 'הסרת הקבלה נכשלה') }
                        }}
                        title="הסר קובץ — כדי להעלות את הקובץ הנכון"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#dc2626', padding: 0 }}
                      >
                        ✕
                      </button>
                    )}
                    {row.status !== 'paid' && row.status !== 'none' && onUploadReceipt && (
                      <button
                        onClick={() => { setUploadMonth(row.monthKey); fileInputRef.current?.click() }}
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.25rem', padding: '0.1rem 0.35rem', cursor: 'pointer', fontSize: '0.7rem', color: '#64748b' }}
                      >
                        העלה אישור
                      </button>
                    )}
                  </span>
                </td>
              )}
              {hasDownpayment && <td style={{ ...cellStyle, color: '#16a34a' }}>{row.actualPaid ? fmt(row.actualPaid) : '—'}</td>}
              {hasDownpayment && <td style={{ ...cellStyle, color: '#2563eb' }}>{row.actualRefunded ? fmt(row.actualRefunded) : '—'}</td>}
              {hasDownpayment && (
                <td style={{ ...cellStyle, background: '#faf5ff', fontWeight: 500 }}>
                  {fmt(btlRunningBalances[row.month])}
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
            {hasDownpayment && <td style={{ ...cellStyle, fontWeight: 700, color: '#16a34a' }}>{fmt(totals.actualPaid)}</td>}
            {hasDownpayment && <td style={{ ...cellStyle, fontWeight: 700, color: '#2563eb' }}>{fmt(totals.actualRefunded)}</td>}
            {hasDownpayment && (
              <td style={{ ...cellStyle, fontWeight: 700, background: '#f3e8ff' }}>{fmt(totals.balance)}</td>
            )}
            {hasDownpayment && (
              <td style={{ ...cellStyle, fontWeight: 700, color: totals.diff > 0 ? '#b45309' : totals.diff < 0 ? '#dc2626' : '#16a34a' }}>{fmt(totals.diff)}</td>
            )}
          </tr>
        </tfoot>
      </table>
      {hasDownpayment && (
        <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.35rem' }}>
          * הסכום שהופקד בפועל אצל המוסד לביטוח לאומי מצטבר, נטו החזרים (ששולם − הוחזר) — לא חיוב וגם לא יתרה מולם; חודש ללא תשלום או החזר אינו משנה את הסכום המצטבר.
        </p>
      )}
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

export function SelfEmployedIncomeTaxSection({ businesses, transactions, bizCategoryMap, expCategoryMap, categoryByName, currentYear, currentMonth, btlRates, brackets, salaryDocs, advancePayments, onUploadReceipt, onDetachReceipt, taxProfile }: {
  businesses: Business[]; transactions: Transaction[]; bizCategoryMap: Map<string, string[]>
  expCategoryMap: Map<string, string[]>; categoryByName: Map<string, Category>
  currentYear: number; currentMonth: number; btlRates: BTLRates | null; brackets: IncomeTaxStep[]
  salaryDocs: TaxDocument[]
  advancePayments?: AdvancePayment[]
  onUploadReceipt?: (month: string, file: File, type?: 'incomeTax' | 'btl') => Promise<void>
  onDetachReceipt?: (month: string, type?: 'incomeTax' | 'btl') => Promise<void>
  taxProfile?: TaxProfile
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadMonth, setUploadMonth] = React.useState<string | null>(null)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const [breakdownMonth, setBreakdownMonth] = React.useState<number | null>(null)
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

  // Actual BTL payments/refunds — the ביטוח לאומי (<member>) / החזר ביטוח
  // לאומי (<member>) transactions, NOT the flat profile advance or a
  // computed-from-rates figure (aglamazo#384: the flat advance rendered
  // ₪6,013 under "בל״ל ששולם" for every one of 9 months regardless of what
  // was actually paid — real payments stopped after May, and a ₪23,744
  // refund in July was never subtracted at all). A payment made for
  // calendar month i shows up as a transaction the following month, same
  // convention as SelfEmployedBTLSection's paymentMonthStr; a refund is
  // netted against whichever payMonth bucket it itself falls into, since
  // there's no reliable way to attribute a lump refund back to the specific
  // months it overpaid.
  const [btlPaymentTx, setBtlPaymentTx] = useState<Transaction[]>([])
  const [btlRefundTx, setBtlRefundTx] = useState<Transaction[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const all = await db.transactions.toArray()
      const yearOf = (t: Transaction) => t.month?.endsWith(`/${currentYear}`)
      if (!cancelled) {
        setBtlPaymentTx(all.filter((t) => t.category?.startsWith('ביטוח לאומי') && yearOf(t)))
        setBtlRefundTx(all.filter((t) => t.category?.startsWith('החזר ביטוח לאומי') && yearOf(t)))
      }
    })()
    return () => { cancelled = true }
  }, [currentYear])

  const btlScheduleByMonth = resolveBtlScheduleByMonth(taxProfile || {}, currentYear)
  const btlFallbackAmount = taxProfile?.btlAdvancePayment || 0

  const monthlyRows = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const incomeTx = transactions.filter(t => t.month === monthStr && t.category && seCatNames.has(t.category))
    // aglamazo#394: a household-folded category (ארנונה/חשמל) only counts
    // toward this person's taxes at their own recognized % (Agla, aglamazo#369:
    // "16% should go to taxes page. Not AH") — never at its full bank amount.
    const expenseLines = transactions
      .filter(t => t.month === monthStr && t.category && seExpCatNames.has(t.category))
      .map(t => resolveExpenseLine(t, seBiz, categoryByName))
    const income = incomeTx.reduce((s, t) => s + (t.amount || 0), 0)
    const expenses = expenseLines.reduce((s, l) => s + l.recognizedAmount, 0)
    const netIncome = income - expenses

    const btlPayMonth = btlPaymentMonthFor(i, currentYear)
    const { amount: btlPaid, isForecast: btlIsForecast } = resolveBtlPaidForMonth({
      payMonth: btlPayMonth,
      btlPaymentTx,
      btlRefundTx,
      scheduledAmount: btlScheduleByMonth.get(monthStr)?.amount,
      fallbackAmount: btlFallbackAmount,
    })

    // aglamazo#384 follow-up (Sheli, live-verified against Agla's real
    // 2026 book): the 52% rule applies to BTL actually PAID — a forecast
    // row (no real transaction yet) must not reduce the tax base, the same
    // way it's already excluded from being labeled "paid" in the column.
    const btlDeduction = btlIsForecast ? 0 : btlPaid * BTL_DEDUCTION_RATE
    const taxBase = Math.max(0, netIncome - btlDeduction)
    const salary = monthlySalary[i] || 0

    // Tax: compute on (salary + taxBase) minus tax on salary alone
    const taxTotal = computeIncomeTax(salary + taxBase, brackets)
    const taxSalaryOnly = computeIncomeTax(salary, brackets)
    const tax = taxTotal - taxSalaryOnly

    // Advance due = % of TURNOVER (excluding VAT) for the period — not net
    // income. A מקדמת מס הכנסה is set by פקיד שומה as a percentage of מחזור;
    // expenses never enter it (that's settled annually in the דוח), and for
    // an עוסק מורשה the deposited amount includes VAT collected on the
    // state's behalf, which isn't the dealer's own turnover either
    // (aglamazo#381).
    const monthIncomeTx = transactions.filter(t => t.month === monthStr && t.category && seCatNames.has(t.category))
    const advanceTurnover = turnoverExVat(monthIncomeTx, taxProfile)
    let advancePaid = 0
    if (hasAdvance) {
      if (advancePeriod === 2) {
        // Bi-monthly: payment on even months (index 1, 3, 5... = Feb, Apr, Jun...)
        const isPaymentMonth = i % 2 === 1
        if (isPaymentMonth) {
          const prevMonthStr = `${String(i).padStart(2, '0')}/${currentYear}`
          const prevIncomeTx = transactions.filter(t => t.month === prevMonthStr && t.category && seCatNames.has(t.category))
          const prevAdvanceTurnover = turnoverExVat(prevIncomeTx, taxProfile)
          advancePaid = (prevAdvanceTurnover + advanceTurnover) * (advancePercent / 100)
        }
      } else {
        advancePaid = advanceTurnover * (advancePercent / 100)
      }
    }

    // Payment status from advancePayments records
    const monthKey = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const paymentRecord = advancePayments?.find(p => p.month === monthKey && p.type === 'incomeTax')
    // Agla, live: "I can't upload the income tax payment," reproduced live
    // via MCP on his real 2026 book — September isn't a bi-monthly
    // isPaymentMonth (period 2 pairs it with October), so the upload
    // control was hidden there even though he can make a real payment on
    // any month he chooses. The BTL table already gives him that freedom
    // (its own control gates only on already-paid, never on a schedule) —
    // matched here: available whenever an advance regime exists, unless
    // this month is already marked paid.
    const isDue = hasAdvance

    // Agla, live: "It probably used the figure (paid amount) from the line
    // itself. But it's wrong. It should extract from the document." —
    // advancePaid above is always a turnover-based estimate; once a real
    // receipt has an extracted amount, that's what was actually paid.
    const advancePaidIsForecast = paymentRecord?.amount === undefined
    const advancePaidDisplay = paymentRecord?.amount ?? advancePaid

    return { month: i, label: HEBREW_MONTHS[i], income, expenses, netIncome, incomeTx, expenseLines, btlPaid, btlIsForecast, btlDeduction, taxBase, salary, tax, advancePaid, advancePaidDisplay, advancePaidIsForecast, monthKey, paymentRecord, isDue }
  })

  // Actual payments — the מקדמות מס הכנסה (<member>) transactions, NOT the
  // computed-due figure above (aglamazo#381's second bug: the footer summed
  // advancePaid, which is what's DUE, and mislabeled it as what was PAID).
  const [advanceTaxTx, setAdvanceTaxTx] = useState<Transaction[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const all = await db.transactions.toArray()
      const yearTx = all.filter(
        (t) => t.category?.startsWith('מקדמות מס הכנסה') && t.month?.endsWith(`/${currentYear}`),
      )
      if (!cancelled) setAdvanceTaxTx(yearTx)
    })()
    return () => { cancelled = true }
  }, [currentYear])

  const annualTotals = {
    income: monthlyRows.reduce((s, r) => s + r.income, 0),
    expenses: monthlyRows.reduce((s, r) => s + r.expenses, 0),
    netIncome: monthlyRows.reduce((s, r) => s + r.netIncome, 0),
    btlPaid: monthlyRows.reduce((s, r) => s + r.btlPaid, 0),
    btlDeduction: monthlyRows.reduce((s, r) => s + r.btlDeduction, 0),
    taxBase: monthlyRows.reduce((s, r) => s + r.taxBase, 0),
    salary: monthlyRows.reduce((s, r) => s + r.salary, 0),
    tax: monthlyRows.reduce((s, r) => s + r.tax, 0),
    advancePaid: monthlyRows.reduce((s, r) => s + r.advancePaidDisplay, 0),
    advancePaidActual: advanceTaxTx.reduce((s, t) => s + Math.abs(t.amount || 0), 0),
    // The true annual net BTL cost (real payments minus real refunds, not
    // clamped per row the way btlPaid above is) — a refund can exceed any
    // single row's payment, so the row-level sum above can overstate the
    // year's real net cost even after aglamazo#384's per-row fix. This is
    // the number that matches what Agla actually owes/paid this year.
    btlPaidNet: btlPaymentTx.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
      - btlRefundTx.reduce((s, t) => s + Math.abs(t.amount || 0), 0),
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
        accept=".pdf,.png,.jpg,.jpeg,.webp,.html,.htm"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file && uploadMonth && onUploadReceipt) {
            setUploadError(null)
            try {
              await onUploadReceipt(uploadMonth, file)
            } catch (err) {
              setUploadError(err instanceof Error ? err.message : 'העלאת הקבלה נכשלה')
            }
          }
          e.target.value = ''
          setUploadMonth(null)
        }}
      />
      {uploadError && (
        <p style={{ fontSize: '0.8rem', color: '#dc2626', margin: '0 0 0.75rem 0' }}>
          ⚠️ {uploadError}
        </p>
      )}
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
              <td style={cellStyle}>
                {row.netIncome ? (
                  <button
                    onClick={() => setBreakdownMonth(row.month)}
                    title="לחץ לפירוט ההכנסות וההוצאות של החודש"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' }}
                  >
                    {fmt(row.netIncome)}
                  </button>
                ) : '—'}
              </td>
              <td style={cellStyle}>
                {row.btlPaid ? fmt(row.btlPaid) : '—'}
                {row.btlIsForecast && row.btlPaid > 0 && (
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginRight: '0.25rem' }}>(צפי)</span>
                )}
              </td>
              <td style={{ ...cellStyle, color: '#16a34a' }}>{row.btlDeduction ? fmt(row.btlDeduction) : '—'}</td>
              <td style={{ ...cellStyle, background: '#fffbeb', fontWeight: 500 }}>{row.taxBase ? fmt(row.taxBase) : '—'}</td>
              {annualTotals.salary > 0 && <td style={cellStyle}>{row.salary ? fmt(row.salary) : '—'}</td>}
              <td style={{ ...cellStyle, background: '#fffbeb', fontWeight: 500, color: '#b45309' }}>{row.tax ? fmt(row.tax) : '—'}</td>
              {hasAdvance && (
                <td style={cellStyle}>
                  {row.advancePaidDisplay ? fmt(row.advancePaidDisplay) : '—'}
                  {row.advancePaidIsForecast && row.advancePaidDisplay > 0 && (
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginRight: '0.25rem' }}>(צפי)</span>
                  )}
                </td>
              )}
              {hasAdvance && (
                <td style={{ ...cellStyle, direction: 'rtl' }}>
                  {row.isDue ? (
                    row.paymentRecord?.paidAt ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ color: '#16a34a', fontWeight: 500, fontSize: '0.8rem' }}>שולם</span>
                        {row.paymentRecord.driveWebViewLink && (
                          <a href={row.paymentRecord.driveWebViewLink} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.75rem' }}>קבלה</a>
                        )}
                        {onDetachReceipt && (
                          <button
                            onClick={async () => {
                              setUploadError(null)
                              try { await onDetachReceipt(row.monthKey, 'incomeTax') } catch (err) { setUploadError(err instanceof Error ? err.message : 'הסרת הקבלה נכשלה') }
                            }}
                            title="הסר קובץ — כדי להעלות את הקובץ הנכון"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#dc2626', padding: 0 }}
                          >
                            ✕
                          </button>
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
          {Math.abs(annualTotals.btlPaidNet - annualTotals.btlPaid) > 1 && (
            <tr style={{ background: '#fef2f2' }}>
              <td colSpan={annualTotals.salary > 0 ? 8 : 7} style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontSize: '0.8rem', color: '#7f1d1d' }}>
                עלות בל&quot;ל נטו בפועל השנה (לאחר החזרים, ללא חלוקה חודשית): {fmt(annualTotals.btlPaidNet)} — שונה מסכום &quot;בל&quot;ל ששולם&quot; למעלה כי החזר יחיד יכול לעלות על תשלום של חודש בודד
              </td>
            </tr>
          )}
          {hasAdvance && (
            <tr style={{ background: '#fef3c7' }}>
              <td colSpan={annualTotals.salary > 0 ? 7 : 6} style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>
                הפרש (מקדמות ששולמו בפועל − מס שחושב)
              </td>
              <td colSpan={2} style={{ ...cellStyle, fontWeight: 700, fontSize: '0.95rem', color: annualTotals.advancePaidActual - annualTotals.tax > 0 ? '#16a34a' : '#dc2626' }}>
                {fmt(annualTotals.advancePaidActual - annualTotals.tax)}
                <span style={{ fontSize: '0.75rem', fontWeight: 400, marginRight: '0.5rem' }}>
                  {annualTotals.advancePaidActual - annualTotals.tax > 0 ? '(שולם ביתר — יוחזר)' : annualTotals.advancePaidActual - annualTotals.tax < 0 ? '(שולם בחסר — לתשלום)' : ''}
                </span>
              </td>
            </tr>
          )}
        </tfoot>
      </table>
      {breakdownMonth != null && (() => {
        const row = monthlyRows.find(r => r.month === breakdownMonth)
        if (!row) return null
        return (
          <MonthBreakdownPanel
            onClose={() => setBreakdownMonth(null)}
            monthLabel={`${row.label} ${currentYear}`}
            incomeTx={row.incomeTx}
            expenseLines={row.expenseLines}
          />
        )
      })()}
    </div>
  )
}
