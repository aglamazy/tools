'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db } from '@/app/db/financeDB'
import type { Business, Transaction, YpayDocument, ExpenseDocument } from '@/app/db/financeDB'
import type { Category } from '@/app/types/category'
import type { TaxProfile } from '@/app/components/TaxProfileSection'
import { getVatRateForDate } from '@/app/lib/vat'
import { YpayDocType } from '@/app/services/ypayService'

const ILS = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const HEB_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

type FilingPeriod = {
  key: string      // "2026-05-01_2026-06-30" — used as appSettings key suffix
  label: string    // "מאי-יוני 2026"
  startISO: string
  endISO: string
  start: Date
  end: Date
}

function getLatestCompletePeriod(vatReportPeriod: 1 | 2, effectiveISO: string): FilingPeriod | null {
  const now = new Date()
  const eff = new Date(effectiveISO)

  if (vatReportPeriod === 1) {
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    const start = new Date(y, m, 1)
    if (start < eff) return null
    const end = new Date(y, m + 1, 0)
    return {
      key: `${isoDate(start)}_${isoDate(end)}`,
      label: `${HEB_MONTHS[m]} ${y}`,
      startISO: isoDate(start), endISO: isoDate(end), start, end,
    }
  }

  // Bi-monthly buckets: Jan-Feb (0), Mar-Apr (2), May-Jun (4), Jul-Aug (6), Sep-Oct (8), Nov-Dec (10)
  const curBucket = Math.floor(now.getMonth() / 2) * 2
  let bStart: Date, bEnd: Date
  if (curBucket === 0) {
    bStart = new Date(now.getFullYear() - 1, 10, 1)
    bEnd = new Date(now.getFullYear() - 1, 12, 0)
  } else {
    const prev = curBucket - 2
    bStart = new Date(now.getFullYear(), prev, 1)
    bEnd = new Date(now.getFullYear(), prev + 2, 0)
  }
  if (bStart < eff) return null
  return {
    key: `${isoDate(bStart)}_${isoDate(bEnd)}`,
    label: `${HEB_MONTHS[bStart.getMonth()]}-${HEB_MONTHS[bEnd.getMonth()]} ${bStart.getFullYear()}`,
    startISO: isoDate(bStart), endISO: isoDate(bEnd), start: bStart, end: bEnd,
  }
}

function parseDmy(s: string): Date | null {
  const [dd, mm, yyyy] = s.split('/').map(Number)
  if (!yyyy) return null
  return new Date(yyyy, mm - 1, dd)
}

type Props = {
  businesses: Business[]
  transactions: Transaction[]
  bizCategoryMap: Map<number, string[]>
  expCategoryMap: Map<number, string[]>
  categoryByName: Map<string, Category>
  taxProfile: TaxProfile
  personUid: string
}

export default function MonthClosureReport({
  businesses, transactions, bizCategoryMap, expCategoryMap, categoryByName, taxProfile, personUid,
}: Props) {
  const isAuthorized = taxProfile.vatType === 'authorized' && !!taxProfile.vatConversion?.effectiveDate
  const vatReportPeriod: 1 | 2 = taxProfile.vatReportPeriod ?? 2
  const effectiveISO = taxProfile.vatConversion?.effectiveDate || ''

  const period = useMemo(
    () => (isAuthorized && effectiveISO ? getLatestCompletePeriod(vatReportPeriod, effectiveISO) : null),
    [isAuthorized, vatReportPeriod, effectiveISO],
  )

  const [ypayDocs, setYpayDocs] = useState<YpayDocument[]>([])
  const [expenseDocs, setExpenseDocs] = useState<ExpenseDocument[]>([])
  const [vatRef, setVatRef] = useState('')
  const [itRef, setItRef] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!period) { setLoading(false); return }
    let alive = true
    void (async () => {
      const [yp, ex, vr, ir] = await Promise.all([
        db.ypayDocuments.toArray(),
        db.expenseDocuments.toArray(),
        db.appSettings.where('key').equals(`closureRef_vat_${period.key}`).first(),
        db.appSettings.where('key').equals(`closureRef_it_${period.key}`).first(),
      ])
      if (!alive) return
      setYpayDocs(yp); setExpenseDocs(ex)
      setVatRef((vr?.value as string) || '')
      setItRef((ir?.value as string) || '')
      setLoading(false)
    })()
    return () => { alive = false }
  }, [period?.key])

  const summary = useMemo(() => {
    if (!period || loading) return null
    const { start, end } = period

    const seBiz = businesses.filter(b => !b.isTaxFree)
    const seCatNames = new Set<string>()
    const seExpCatNames = new Set<string>()
    for (const b of seBiz) {
      ;(bizCategoryMap.get(b.id!) || []).forEach(n => seCatNames.add(n))
      ;(expCategoryMap.get(b.id!) || []).forEach(n => seExpCatNames.add(n))
    }

    const inTx = transactions.filter(t => {
      if (!t.category || !seCatNames.has(t.category)) return false
      const d = parseDmy(t.date); return d !== null && d >= start && d <= end
    })
    const exTx = transactions.filter(t => {
      if (!t.category || !seExpCatNames.has(t.category)) return false
      const d = parseDmy(t.date); return d !== null && d >= start && d <= end
    })
    const totalIncome = inTx.reduce((s, t) => s + (t.amount || 0), 0)
    const totalExpenses = exTx.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const netIncome = Math.max(0, totalIncome - totalExpenses)

    // Output VAT from issued invoices (YpayDocuments)
    const taxableTypes = new Set([YpayDocType.TaxInvoice, YpayDocType.TaxInvoiceReceipt])
    let outputVat = 0
    for (const d of ypayDocs) {
      if (!taxableTypes.has(d.docType)) continue
      const created = new Date(d.createdAt)
      if (created < start || created > end) continue
      // amount is NET (VAT-exclusive) per ypayService convention
      outputVat += (d.amount || 0) * getVatRateForDate(created)
    }

    // Input VAT from expense documents linked to in-period expense transactions
    const exTxIds = new Set(exTx.map(t => t.id).filter((x): x is number => x != null))
    let inputVat = 0
    for (const ed of expenseDocs) {
      if (ed.transactionId == null || !exTxIds.has(ed.transactionId)) continue
      const txCat = exTx.find(t => t.id === ed.transactionId)?.category
      const cat = txCat ? categoryByName.get(txCat) : undefined
      const share = cat?.businessId != null
        ? 100 : cat?.deductibleByMember?.[personUid] ?? (cat?.isDeductible ? 100 : 0)
      if (share <= 0) continue
      inputVat += (ed.vatAmount || 0) * (share / 100)
    }

    const advancePercent = taxProfile.incomeTaxAdvancePercent || 0
    return {
      totalIncome, totalExpenses, netIncome,
      outputVat, inputVat, netVat: outputVat - inputVat,
      advancePercent, itAdvance: netIncome * (advancePercent / 100),
    }
  }, [period, loading, businesses, transactions, bizCategoryMap, expCategoryMap, ypayDocs, expenseDocs, categoryByName, personUid, taxProfile])

  const saveRef = async (type: 'vat' | 'it', value: string) => {
    if (!period) return
    const key = type === 'vat' ? `closureRef_vat_${period.key}` : `closureRef_it_${period.key}`
    const ts = new Date().toISOString()
    const existing = await db.appSettings.where('key').equals(key).first()
    if (existing) {
      await db.appSettings.update(existing.id!, { value, updatedAt: ts })
    } else {
      await db.appSettings.add({ key, value, updatedAt: ts })
    }
    if (type === 'vat') setVatRef(value); else setItRef(value)
  }

  if (!period || loading || !summary) return null

  const allFiled = vatRef && (summary.advancePercent === 0 || itRef)
  const btlTemplate = itRef
    ? `לכבוד ביטוח לאומי,\n\nבהמשך לבקשתכם לאסמכתא ממס הכנסה:\n\nהכנסה נטו לתקופה ${period.label}: ${ILS(summary.netIncome)}\nאסמכתא מקדמת מס הכנסה: ${itRef}\n\nבברכה,\nיעקב אגלמז`
    : null

  return (
    <div style={{
      marginBottom: '1.5rem',
      padding: '1rem 1.25rem',
      background: allFiled ? '#f0fdf4' : '#fffbeb',
      border: `1px solid ${allFiled ? '#86efac' : '#fde68a'}`,
      borderRadius: '0.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span>{allFiled ? '✅' : '📋'}</span>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
          סגירת חודש — {period.label}
        </h3>
        {allFiled && <span style={{ fontSize: '0.8rem', color: '#16a34a', marginRight: 'auto', fontWeight: 500 }}>דווח ✓</span>}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '0.5rem',
        marginBottom: '1rem',
      }}>
        <NumCard label="הכנסה" value={ILS(summary.totalIncome)} color="#1d4ed8" />
        <NumCard label="הוצאות" value={ILS(summary.totalExpenses)} color="#dc2626" />
        <NumCard label="הכנסה נטו" value={ILS(summary.netIncome)} color="#0f766e" bold />
        <NumCard label="מס עסקאות" value={ILS(summary.outputVat)} color="#7c3aed" />
        <NumCard label="מס תשומות" value={ILS(summary.inputVat)} color="#7c3aed" />
        <NumCard label="מע״מ לתשלום" value={ILS(summary.netVat)} color="#7c3aed" bold />
        {summary.advancePercent > 0 && (
          <NumCard label={`מקדמה ${summary.advancePercent}%`} value={ILS(summary.itAdvance)} color="#ea580c" bold />
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: btlTemplate ? '1rem' : 0 }}>
        <RefInput label="אסמכתא מע״מ" value={vatRef} placeholder="לאחר תשלום במע״מ" onSave={v => saveRef('vat', v)} />
        {summary.advancePercent > 0 && (
          <RefInput label="אסמכתא מקדמה" value={itRef} placeholder="לאחר תשלום מקדמה" onSave={v => saveRef('it', v)} />
        )}
      </div>

      {btlTemplate && (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.3rem', fontWeight: 600 }}>
            תבנית מייל לביטוח לאומי:
          </p>
          <pre style={{
            fontSize: '0.8rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            whiteSpace: 'pre-wrap',
            direction: 'rtl',
            fontFamily: 'inherit',
            color: '#1e293b',
            margin: 0,
          }}>
            {btlTemplate}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(btlTemplate)}
            style={{
              marginTop: '0.4rem',
              fontSize: '0.75rem',
              padding: '0.25rem 0.65rem',
              background: '#e0f2fe',
              border: '1px solid #bae6fd',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              color: '#0369a1',
            }}
          >
            העתק
          </button>
        </div>
      )}
    </div>
  )
}

function NumCard({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{
      padding: '0.5rem 0.75rem',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '0.5rem',
    }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.15rem' }}>{label}</div>
      <div style={{ fontSize: '0.88rem', fontWeight: bold ? 700 : 500, color, direction: 'ltr', textAlign: 'right' }}>{value}</div>
    </div>
  )
}

function RefInput({ label, value, onSave, placeholder }: {
  label: string; value: string; onSave: (v: string) => void; placeholder: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <div style={{ flex: '1 1 200px' }}>
      <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>{label}</label>
      <div style={{ display: 'flex', gap: '0.3rem' }}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: '0.3rem 0.6rem',
            fontSize: '0.85rem',
            border: `1px solid ${value ? '#86efac' : '#e2e8f0'}`,
            borderRadius: '0.375rem',
            background: value ? '#f0fdf4' : '#fff',
            outline: 'none',
            direction: 'ltr',
          }}
        />
        {draft !== value && draft && (
          <button
            onClick={() => onSave(draft)}
            style={{
              padding: '0.3rem 0.6rem',
              fontSize: '0.75rem',
              background: '#dbeafe',
              border: '1px solid #bfdbfe',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              color: '#1d4ed8',
            }}
          >
            שמור
          </button>
        )}
        {value && draft === value && (
          <span style={{ fontSize: '1rem', alignSelf: 'center', color: '#16a34a' }}>✓</span>
        )}
      </div>
    </div>
  )
}
