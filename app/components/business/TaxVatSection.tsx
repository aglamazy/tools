'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { db, type Business, type Transaction, type YpayDocument, type ExpenseDocument, type Project, type VatPayment, type Supplier } from '@/app/db/financeDB'
import type { Category } from '@/app/types/category'
import { getVatRateForDate } from '@/app/lib/vat'
import { YpayDocType } from '@/app/services/ypayService'
import { uploadExpenseDocument } from '@/app/services/googleDriveService'
import { parseDateFolder } from '@/app/services/receiptMatchService'
import { normalizeDate } from '@/app/utils/parsers/shared'
import { resolveOrCreateSupplier } from '@/app/services/supplierService'
import ExpenseMatchCell from './ExpenseMatchCell'
import SupplierCardModal from './SupplierCardModal'

const ILS = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

function parseDmy(date?: string): Date | null {
  const normalized = normalizeDate(date)
  if (!normalized) return null
  const [yyyy, mm, dd] = normalized.split('-')
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd))
}

function formatDmy(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

type TaxVatSectionProps = {
  effectiveDate: string // YYYY-MM-DD — when user became authorized
  personUid: string
  vatReportPeriod: 1 | 2 // 1 = monthly, 2 = bi-monthly
  businesses: Business[] // user's relevant businesses
  transactions: Transaction[] // all year transactions (already filtered to bizCategories)
  expCategoryMap: Map<number, string[]>
  categoryByName: Map<string, Category>
}

type ReportPeriod = {
  key: string         // "2026-03_2026-04" — stable id
  label: string       // "מרץ-אפריל 2026"
  startISO: string    // inclusive YYYY-MM-DD
  endISO: string      // inclusive YYYY-MM-DD
  start: Date
  end: Date
}

const HEBREW_MONTHS_GEN = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Generate the fixed VAT reporting periods (calendar-aligned, never partial)
 * between effectiveDate and today.
 *  - monthly: Jan, Feb, …, Dec — each its own period
 *  - bi-monthly: Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec
 * The returned list is ordered oldest-first. effectiveDate inside a period
 * still produces the full calendar period (we just don't count rows before
 * the effectiveDate cutoff elsewhere).
 */
function generatePeriods(effectiveISO: string, periodSize: 1 | 2): ReportPeriod[] {
  const eff = new Date(effectiveISO)
  eff.setHours(0, 0, 0, 0)
  const now = new Date()
  const periods: ReportPeriod[] = []

  if (periodSize === 1) {
    // One period per calendar month.
    const cursor = new Date(eff.getFullYear(), eff.getMonth(), 1)
    const stop = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    while (cursor < stop) {
      const start = new Date(cursor)
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      end.setHours(23, 59, 59, 999)
      periods.push({
        key: `${isoDate(start)}_${isoDate(end)}`,
        label: `${HEBREW_MONTHS_GEN[start.getMonth()]} ${start.getFullYear()}`,
        startISO: isoDate(start),
        endISO: isoDate(end),
        start,
        end,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else {
    // Bi-monthly: 0/1, 2/3, 4/5, 6/7, 8/9, 10/11.
    const bucket = (m: number) => Math.floor(m / 2) * 2
    const cursor = new Date(eff.getFullYear(), bucket(eff.getMonth()), 1)
    const stop = new Date(now.getFullYear(), bucket(now.getMonth()) + 2, 1)
    while (cursor < stop) {
      const start = new Date(cursor)
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0)
      end.setHours(23, 59, 59, 999)
      periods.push({
        key: `${isoDate(start)}_${isoDate(end)}`,
        label: `${HEBREW_MONTHS_GEN[start.getMonth()]}-${HEBREW_MONTHS_GEN[start.getMonth() + 1]} ${start.getFullYear()}`,
        startISO: isoDate(start),
        endISO: isoDate(end),
        start,
        end,
      })
      cursor.setMonth(cursor.getMonth() + 2)
    }
  }

  return periods
}

type IncomeRow = {
  id: number
  date: Date
  serial: string
  projectName: string
  amount: number
  outputVat: number
  vatRate: number
  docType: number
}

type ExpenseRow = {
  key: string
  transactionId: number
  txDescription: string
  txMerchant?: string
  txAmount: number // raw transaction amount (negative for expense)
  txDateStr: string // DD/MM/YYYY original
  date: Date
  vendor: string
  amount: number
  inputVat: number
  vatRate: number
  sharePercent: number
  hasDoc: boolean
  docUrl?: string
}

export default function TaxVatSection({
  effectiveDate,
  personUid,
  vatReportPeriod,
  businesses,
  transactions,
  expCategoryMap,
  categoryByName,
}: TaxVatSectionProps) {
  const [ypayDocs, setYpayDocs] = useState<YpayDocument[]>([])
  const [expenseDocs, setExpenseDocs] = useState<ExpenseDocument[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [vatPayments, setVatPayments] = useState<VatPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [claudeApiKey, setClaudeApiKey] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string>('')
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Open (or create on the fly) the Supplier behind a vendor/description cell
  // — lets you set the real email sender right where you're already looking
  // at the failed match, instead of routing through Settings.
  const openSupplierCard = async (rawVendor: string) => {
    const supplier = await resolveOrCreateSupplier(rawVendor)
    setEditingSupplier(supplier)
  }

  const cutoff = useMemo(() => {
    const d = new Date(effectiveDate)
    d.setHours(0, 0, 0, 0)
    return d
  }, [effectiveDate])

  const periods = useMemo(() => generatePeriods(effectiveDate, vatReportPeriod), [effectiveDate, vatReportPeriod])
  // Default selection: the period containing today; falls back to the last one.
  const currentPeriodKey = useMemo(() => {
    const now = new Date()
    const found = periods.find(p => p.start <= now && now <= p.end)
    return found?.key || periods[periods.length - 1]?.key || ''
  }, [periods])
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>('')
  // Initialize / reset the selection when periods change.
  useEffect(() => {
    if (!selectedPeriodKey && currentPeriodKey) setSelectedPeriodKey(currentPeriodKey)
  }, [currentPeriodKey, selectedPeriodKey])
  const selectedPeriod = useMemo(
    () => periods.find(p => p.key === selectedPeriodKey) || periods.find(p => p.key === currentPeriodKey),
    [periods, selectedPeriodKey, currentPeriodKey],
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const [yp, ex, pj, vp, claudeKey] = await Promise.all([
        db.ypayDocuments.toArray(),
        db.expenseDocuments.toArray(),
        db.projects.toArray(),
        db.vatPayments.toArray(),
        db.appSettings.where('key').equals('claudeApiKey').first(),
      ])
      if (!alive) return
      setYpayDocs(yp)
      setExpenseDocs(ex)
      setProjects(pj)
      setVatPayments(vp)
      if (claudeKey?.value) setClaudeApiKey(claudeKey.value)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const onMatched = async (doc: ExpenseDocument) => {
    const id = await db.expenseDocuments.add(doc)
    setExpenseDocs(prev => [...prev, { ...doc, id: id as number }])
  }

  const userProjectNames = useMemo(() => {
    const businessIds = new Set(businesses.map(b => b.id).filter((x): x is number => x != null))
    const names = new Set<string>()
    for (const p of projects) {
      if (businessIds.has(p.businessId)) names.add(p.name)
    }
    return names
  }, [businesses, projects])

  // The VatPayment (if any) that matches the selected period's date range.
  // Used to decide closed-vs-open and which tagged docs to show.
  const selectedPayment = useMemo(
    () => selectedPeriod
      ? vatPayments.find(p => p.periodStart === selectedPeriod.startISO && p.periodEnd === selectedPeriod.endISO)
      : undefined,
    [vatPayments, selectedPeriod],
  )
  const isPeriodClosed = !!selectedPayment

  const incomeRows = useMemo<IncomeRow[]>(() => {
    if (!selectedPeriod) return []
    const taxableTypes = new Set<number>([YpayDocType.TaxInvoice, YpayDocType.TaxInvoiceReceipt])
    const rows: IncomeRow[] = []
    for (const d of ypayDocs) {
      if (!taxableTypes.has(d.docType)) continue
      if (d.projectName && !userProjectNames.has(d.projectName)) continue
      const created = new Date(d.createdAt)
      if (isPeriodClosed) {
        // Closed period: show only docs that were tagged with this payment.
        if (d.vatPaymentId !== selectedPayment!.id) continue
      } else {
        // Open period: untagged docs whose date falls inside the period
        // and on/after the dealer-conversion cutoff.
        if (d.vatPaymentId != null) continue
        if (created < cutoff) continue
        if (created < selectedPeriod.start || created > selectedPeriod.end) continue
      }
      const amount = d.amount || 0
      const vatRate = getVatRateForDate(created)
      rows.push({
        id: d.id!,
        date: created,
        serial: d.serialNumber,
        projectName: d.projectName || '—',
        amount,
        // YpayDocument.amount is the NET amount (lines are created with
        // vatIncluded:false in ypayService). So output VAT is amount × rate,
        // NOT the gross-inclusive factor.
        outputVat: amount * vatRate,
        vatRate,
        docType: d.docType,
      })
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime())
    return rows
  }, [ypayDocs, cutoff, userProjectNames, selectedPeriod, isPeriodClosed, selectedPayment])

  const expenseRows = useMemo<ExpenseRow[]>(() => {
    if (!selectedPeriod) return []
    const deductibleCatNames = new Set<string>()
    for (const names of expCategoryMap.values()) names.forEach(n => deductibleCatNames.add(n))

    const docByTxId = new Map<number, ExpenseDocument>()
    for (const ed of expenseDocs) {
      if (ed.transactionId != null) docByTxId.set(ed.transactionId, ed)
    }

    const rows: ExpenseRow[] = []
    for (const t of transactions) {
      if (!t.category || !deductibleCatNames.has(t.category)) continue
      const txDate = parseDmy(t.date)
      if (!txDate) continue
      if (t.paidByUid && t.paidByUid !== personUid) continue
      const cat = categoryByName.get(t.category)
      // Resolve deductibility share:
      //  - Business-scoped expense category (cat.businessId set) → implicitly 100%
      //    for the business owner; expCategoryMap only includes it for that owner.
      //  - Household-scoped: explicit per-member percent on deductibleByMember,
      //    falling back to 100% when isDeductible=true with no per-member split.
      const sharePercent = cat?.businessId != null
        ? 100
        : cat?.deductibleByMember?.[personUid] ?? (cat?.isDeductible ? 100 : 0)
      if (sharePercent <= 0) continue
      const eligibleAmount = Math.abs(t.amount || 0) * (sharePercent / 100)
      const linkedDoc = t.id != null ? docByTxId.get(t.id) : undefined
      if (isPeriodClosed) {
        // Closed period: only show docs tagged with this payment.
        if (linkedDoc?.vatPaymentId !== selectedPayment!.id) continue
      } else {
        // Open period: untagged docs whose date falls inside the period
        // and on/after the dealer-conversion cutoff.
        if (linkedDoc?.vatPaymentId != null) continue
        if (txDate < cutoff) continue
        if (txDate < selectedPeriod.start || txDate > selectedPeriod.end) continue
      }
      const vatRate = getVatRateForDate(txDate)
      // Input VAT is only what the linked document confirms. Without a doc we
      // cannot know if the vendor charged Israeli VAT (e.g. foreign vendors
      // like Vercel charge none) — so unlinked rows contribute 0 to input VAT.
      const inputVat = linkedDoc?.vatAmount != null
        ? linkedDoc.vatAmount * (sharePercent / 100)
        : 0
      rows.push({
        key: `tx:${t.id}`,
        transactionId: t.id!,
        txDescription: t.description || '',
        txMerchant: t.merchant,
        txAmount: t.amount || 0,
        txDateStr: t.date,
        date: txDate,
        vendor: linkedDoc?.vendor || t.merchant || t.description || '—',
        amount: eligibleAmount,
        inputVat,
        vatRate,
        sharePercent,
        hasDoc: !!linkedDoc,
        docUrl: linkedDoc?.driveWebViewLink || linkedDoc?.externalUrl,
      })
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime())
    return rows
  }, [transactions, expCategoryMap, categoryByName, expenseDocs, cutoff, personUid, selectedPeriod, isPeriodClosed, selectedPayment])

  const totals = useMemo(() => {
    const output = incomeRows.reduce((s, r) => s + r.outputVat, 0)
    const input = expenseRows.reduce((s, r) => s + r.inputVat, 0)
    return { output, input, net: output - input }
  }, [incomeRows, expenseRows])

  const missingDocCount = expenseRows.filter(r => !r.hasDoc).length

  // Rows with a matched document confirming zero VAT (e.g. foreign vendors like
  // Vercel that charge none) contribute nothing to input VAT — keep them out of
  // this table entirely; they're not actionable and just add noise to a report
  // whose whole point is reclaimable VAT. Undocumented rows stay visible (still
  // pending, might turn into real credit once a document is matched).
  const visibleExpenseRows = expenseRows.filter(r => !(r.hasDoc && r.inputVat === 0))

  const ratesInWindow = useMemo(() => {
    const set = new Set<number>()
    for (const r of incomeRows) set.add(r.vatRate)
    for (const r of expenseRows) set.add(r.vatRate)
    return Array.from(set).sort()
  }, [incomeRows, expenseRows])
  const rateLabel = ratesInWindow.length === 0
    ? '—'
    : ratesInWindow.map(r => `${Math.round(r * 100)}%`).join(' / ')

  const handleUploadVatPayment = async (file: File) => {
    setUploadError('')
    if (!claudeApiKey) {
      setUploadError('חסר מפתח Anthropic בהגדרות — נדרש לקריאת אישור התשלום')
      return
    }
    if (incomeRows.length === 0 && expenseRows.length === 0) {
      setUploadError('אין רשומות פתוחות לסגירה')
      return
    }
    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)

      // Today as the folder bucket for the Drive upload (real period extracted below).
      const today = new Date()
      const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const uploaded = await uploadExpenseDocument(file, parseDateFolder(ymd))
      if (!uploaded.webViewLink) throw new Error('העלאה ל-Drive נכשלה')

      const extractRes = await fetch('/api/match-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extract-vat-payment',
          pdfBase64: base64,
          mediaType: file.type || 'application/pdf',
          claudeApiKey,
        }),
      })
      const extracted = await extractRes.json()
      console.log('[VatPayment] extract →', extracted)
      if (extracted?.error) throw new Error(extracted.error)

      const now = new Date().toISOString()
      // Period boundaries default to the SELECTED period (the one the user is
      // closing). Claude's extracted values override when present.
      const fallbackStart = selectedPeriod?.startISO || cutoff.toISOString().slice(0, 10)
      const fallbackEnd = selectedPeriod?.endISO || ymd
      const fallbackLabel = selectedPeriod?.label || 'תקופה לא ידועה'
      const paymentId = await db.vatPayments.add({
        userId: personUid,
        periodLabel: extracted.periodLabel || fallbackLabel,
        periodStart: extracted.periodStart || fallbackStart,
        periodEnd: extracted.periodEnd || fallbackEnd,
        paymentDate: extracted.paymentDate || ymd,
        output: typeof extracted.output === 'number' ? extracted.output : totals.output,
        input: typeof extracted.input === 'number' ? extracted.input : totals.input,
        net: typeof extracted.net === 'number' ? extracted.net : totals.net,
        confirmationNumber: extracted.confirmationNumber || undefined,
        fileName: file.name,
        driveFileId: uploaded.fileId,
        driveWebViewLink: uploaded.webViewLink,
        extractedData: extracted,
        uploadedAt: now,
      })

      // Tag docs that fall WITHIN this payment's reporting period only —
      // not everything currently visible. Otherwise next-period invoices
      // already issued would get swept into this filing.
      const periodStartDate = new Date(extracted.periodStart || cutoff.toISOString().slice(0, 10))
      const periodEndDate = new Date(extracted.periodEnd || ymd)
      periodStartDate.setHours(0, 0, 0, 0)
      periodEndDate.setHours(23, 59, 59, 999)
      const inPeriod = (d: Date) => d >= periodStartDate && d <= periodEndDate
      await Promise.all([
        ...incomeRows
          .filter(r => inPeriod(r.date))
          .map(r => db.ypayDocuments.update(r.id, { vatPaymentId: paymentId as number })),
        ...expenseRows
          .filter(r => inPeriod(r.date))
          .map(r => expenseDocs.find(d => d.transactionId === r.transactionId))
          .filter((d): d is ExpenseDocument => !!d && d.id != null)
          .map(d => db.expenseDocuments.update(d.id!, { vatPaymentId: paymentId as number })),
      ])

      // Reload everything so the section reflects the closed period.
      const [yp, ex, vp] = await Promise.all([
        db.ypayDocuments.toArray(),
        db.expenseDocuments.toArray(),
        db.vatPayments.toArray(),
      ])
      setYpayDocs(yp)
      setExpenseDocs(ex)
      setVatPayments(vp)
    } catch (err: any) {
      console.error('[VatPayment] upload failed:', err)
      setUploadError(err?.message || String(err))
    } finally {
      setUploading(false)
    }
  }

  const handleVatFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleUploadVatPayment(file)
    e.target.value = ''
  }

  if (loading) return <p style={{ color: '#94a3b8' }}>טוען נתוני מע״מ...</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>תקופה</h3>
          <select
            value={selectedPeriodKey}
            onChange={e => setSelectedPeriodKey(e.target.value)}
            style={{ padding: '0.3rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
          >
            {periods.map(p => {
              const paid = vatPayments.some(v => v.periodStart === p.startISO && v.periodEnd === p.endISO)
              return (
                <option key={p.key} value={p.key}>
                  {p.label} {paid ? '✓ שולם' : ''}{p.key === currentPeriodKey ? ' (נוכחית)' : ''}
                </option>
              )
            })}
          </select>
          {selectedPeriod && (
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              {selectedPeriod.startISO} → {selectedPeriod.endISO}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            שיעור מע״מ {rateLabel} (עוסק מורשה)
          </span>
          {!isPeriodClosed && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              title="העלה אישור תשלום מע״מ — סוגר את התקופה הנבחרת"
              style={{
                padding: '0.3rem 0.75rem',
                background: uploading ? '#94a3b8' : '#166534',
                color: 'white', border: 'none', borderRadius: '0.375rem',
                cursor: uploading ? 'wait' : 'pointer', fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              {uploading ? 'מעלה…' : 'העלה אישור תשלום'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            onChange={handleVatFilePick}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {isPeriodClosed && selectedPayment && (
        <div style={{
          padding: '0.6rem 0.85rem', background: '#dcfce7', border: '1px solid #86efac',
          borderRadius: '0.5rem', fontSize: '0.9rem', color: '#166534',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
        }}>
          <span>
            ✓ תקופה סגורה — שולמה בתאריך {selectedPayment.paymentDate}
            {selectedPayment.confirmationNumber ? ` · אסמכתא ${selectedPayment.confirmationNumber}` : ''}
          </span>
          {selectedPayment.driveWebViewLink && (
            <a href={selectedPayment.driveWebViewLink} target="_blank" rel="noopener noreferrer"
               style={{ color: '#166534', textDecoration: 'underline', fontWeight: 600 }}>
              פתח אישור תשלום
            </a>
          )}
        </div>
      )}

      {uploadError && (
        <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '0.375rem', fontSize: '0.85rem' }}>
          {uploadError}
        </div>
      )}

      <SummaryStrip output={totals.output} input={totals.input} net={totals.net} />

      <SectionBlock title={`חשבוניות הכנסה (${incomeRows.length})`}>
        {incomeRows.length === 0 ? (
          <EmptyHint text="לא נמצאו חשבוניות חבות מע״מ מאז המעבר לעוסק מורשה." />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>תאריך</th>
                <th style={thStyle}>סידורי</th>
                <th style={thStyle}>פרויקט</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>סכום ללא מע״מ</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>%</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>מס עסקאות</th>
              </tr>
            </thead>
            <tbody>
              {incomeRows.map(r => (
                <tr key={r.id} style={trStyle}>
                  <td style={tdStyle}>{formatDmy(r.date)}</td>
                  <td style={tdStyle}>#{r.serial}</td>
                  <td style={tdStyle}>{r.projectName}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{ILS(r.amount)}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', color: '#64748b' }}>{Math.round(r.vatRate * 100)}%</td>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>{ILS(r.outputVat)}</td>
                </tr>
              ))}
              <tr style={totalRowStyle}>
                <td style={tdStyle} colSpan={3}>סה״כ</td>
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700 }}>{ILS(incomeRows.reduce((s, r) => s + r.amount, 0))}</td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700 }}>{ILS(totals.output)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </SectionBlock>

      <SectionBlock title={`הוצאות מוכרות (${visibleExpenseRows.length})${missingDocCount ? ` · ${missingDocCount} ללא מסמך ⚠️` : ''}`}>
        {visibleExpenseRows.length === 0 ? (
          <EmptyHint text="לא נמצאו הוצאות מוכרות בקטגוריות המנוכות מאז התאריך." />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>תאריך</th>
                <th style={thStyle}>ספק / תיאור</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>סכום מוכר</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>חלק</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>%</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>מס תשומות</th>
                <th style={thStyle}>מסמך</th>
              </tr>
            </thead>
            <tbody>
              {visibleExpenseRows.map(r => {
                const linked = expenseDocs.find(d => d.transactionId === r.transactionId)
                return (
                  <tr key={r.key} style={trStyle}>
                    <td style={tdStyle}>{formatDmy(r.date)}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => openSupplierCard(r.txMerchant || r.txDescription)}
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                        title="לחץ לצפייה/עריכת הספק — קביעת כתובת מייל הופכת את החיפוש למהיר וממוקד"
                      >
                        {r.vendor}
                      </button>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{ILS(r.amount)}</td>
                    <td style={{ ...tdStyle, textAlign: 'left', color: '#64748b' }}>
                      {r.sharePercent === 100 ? '—' : `${r.sharePercent}%`}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left', color: '#64748b' }}>{Math.round(r.vatRate * 100)}%</td>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>
                      {r.hasDoc ? ILS(r.inputVat) : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      <ExpenseMatchCell
                        transaction={{
                          id: r.transactionId,
                          date: r.txDateStr,
                          description: r.txDescription,
                          merchant: r.txMerchant,
                          amount: r.txAmount,
                        }}
                        linkedDoc={linked}
                        claudeApiKey={claudeApiKey}
                        onMatched={onMatched}
                      />
                    </td>
                  </tr>
                )
              })}
              <tr style={totalRowStyle}>
                <td style={tdStyle} colSpan={2}>סה״כ</td>
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700 }}>{ILS(visibleExpenseRows.reduce((s, r) => s + r.amount, 0))}</td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700 }}>{ILS(totals.input)}</td>
                <td style={tdStyle}></td>
              </tr>
            </tbody>
          </table>
        )}
      </SectionBlock>

      {vatPayments.length > 0 && (
        <SectionBlock title={`תשלומי מע״מ שהוגשו (${vatPayments.length})`}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>תקופה</th>
                <th style={thStyle}>תאריך תשלום</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>מס עסקאות</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>מס תשומות</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>נטו</th>
                <th style={thStyle}>אסמכתא</th>
                <th style={thStyle}>מסמך</th>
              </tr>
            </thead>
            <tbody>
              {[...vatPayments].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')).map(p => (
                <tr key={p.id} style={trStyle}>
                  <td style={tdStyle}>{p.periodLabel}</td>
                  <td style={tdStyle}>{p.paymentDate}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{p.output != null ? ILS(p.output) : '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{p.input != null ? ILS(p.input) : '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>{p.net != null ? ILS(p.net) : '—'}</td>
                  <td style={tdStyle}>{p.confirmationNumber || '—'}</td>
                  <td style={tdStyle}>
                    {p.driveWebViewLink ? (
                      <a href={p.driveWebViewLink} target="_blank" rel="noopener noreferrer"
                         style={{ color: '#2563eb', textDecoration: 'none' }}>
                        אישור
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionBlock>
      )}

      {editingSupplier && (
        <SupplierCardModal
          supplier={editingSupplier}
          onClose={() => setEditingSupplier(null)}
          onSaved={() => setEditingSupplier(null)}
        />
      )}
    </div>
  )
}

function SummaryStrip({ output, input, net }: { output: number; input: number; net: number }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
      <SummaryCard label="מס עסקאות (פלט)" value={output} color="#1e40af" bg="#dbeafe" />
      <SummaryCard label="מס תשומות (קלט)" value={input} color="#166534" bg="#dcfce7" />
      <SummaryCard
        label={net >= 0 ? 'מע״מ לתשלום' : 'מע״מ להחזר'}
        value={Math.abs(net)}
        color={net >= 0 ? '#92400e' : '#166534'}
        bg={net >= 0 ? '#fef3c7' : '#dcfce7'}
        emphasize
      />
    </div>
  )
}

function SummaryCard({ label, value, color, bg, emphasize }: { label: string; value: number; color: string; bg: string; emphasize?: boolean }) {
  return (
    <div style={{
      flex: '1 1 200px', padding: '0.75rem 1rem', background: bg, borderRadius: '0.5rem',
      border: `1px solid ${color}33`,
    }}>
      <div style={{ fontSize: '0.8rem', color, opacity: 0.85, marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: emphasize ? '1.4rem' : '1.2rem', color, fontWeight: 700 }}>{ILS(value)}</div>
    </div>
  )
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#334155' }}>{title}</h4>
      {children}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>{text}</p>
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.85rem',
}

const thStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  textAlign: 'right',
  background: '#f8fafc',
  borderBottom: '2px solid #e2e8f0',
  color: '#475569',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  borderBottom: '1px solid #f1f5f9',
}

const trStyle: React.CSSProperties = {}

const totalRowStyle: React.CSSProperties = {
  background: '#f8fafc',
  fontWeight: 700,
}
