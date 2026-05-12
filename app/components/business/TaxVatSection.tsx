'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db, type Business, type Transaction, type YpayDocument, type ExpenseDocument, type Project } from '@/app/db/financeDB'
import type { Category } from '@/app/types/category'
import { getVatRateForDate, vatInclusiveFactor } from '@/app/lib/vat'
import { YpayDocType } from '@/app/services/ypayService'
import ExpenseMatchCell from './ExpenseMatchCell'

const ILS = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

function parseDmy(date?: string): Date | null {
  if (!date) return null
  const [dd, mm, yyyy] = date.split('/')
  if (!dd || !mm || !yyyy) return null
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd))
}

function formatDmy(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

type TaxVatSectionProps = {
  effectiveDate: string // YYYY-MM-DD — when user became authorized
  personUid: string
  businesses: Business[] // user's relevant businesses
  transactions: Transaction[] // all year transactions (already filtered to bizCategories)
  expCategoryMap: Map<number, string[]>
  categoryByName: Map<string, Category>
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
  businesses,
  transactions,
  expCategoryMap,
  categoryByName,
}: TaxVatSectionProps) {
  const [ypayDocs, setYpayDocs] = useState<YpayDocument[]>([])
  const [expenseDocs, setExpenseDocs] = useState<ExpenseDocument[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [claudeApiKey, setClaudeApiKey] = useState<string>('')

  const cutoff = useMemo(() => {
    const d = new Date(effectiveDate)
    d.setHours(0, 0, 0, 0)
    return d
  }, [effectiveDate])

  useEffect(() => {
    let alive = true
    void (async () => {
      const [yp, ex, pj, claudeKey] = await Promise.all([
        db.ypayDocuments.toArray(),
        db.expenseDocuments.toArray(),
        db.projects.toArray(),
        db.appSettings.where('key').equals('claudeApiKey').first(),
      ])
      if (!alive) return
      setYpayDocs(yp)
      setExpenseDocs(ex)
      setProjects(pj)
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

  const incomeRows = useMemo<IncomeRow[]>(() => {
    const taxableTypes = new Set<number>([YpayDocType.TaxInvoice, YpayDocType.TaxInvoiceReceipt])
    const rows: IncomeRow[] = []
    for (const d of ypayDocs) {
      if (!taxableTypes.has(d.docType)) continue
      const created = new Date(d.createdAt)
      if (created < cutoff) continue
      if (d.projectName && !userProjectNames.has(d.projectName)) continue
      const amount = d.amount || 0
      const vatRate = getVatRateForDate(created)
      rows.push({
        id: d.id!,
        date: created,
        serial: d.serialNumber,
        projectName: d.projectName || '—',
        amount,
        outputVat: amount * vatInclusiveFactor(vatRate),
        vatRate,
        docType: d.docType,
      })
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime())
    return rows
  }, [ypayDocs, cutoff, userProjectNames])

  const expenseRows = useMemo<ExpenseRow[]>(() => {
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
      if (!txDate || txDate < cutoff) continue
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
        docUrl: linkedDoc?.driveWebViewLink,
      })
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime())
    return rows
  }, [transactions, expCategoryMap, categoryByName, expenseDocs, cutoff, personUid])

  const totals = useMemo(() => {
    const output = incomeRows.reduce((s, r) => s + r.outputVat, 0)
    const input = expenseRows.reduce((s, r) => s + r.inputVat, 0)
    return { output, input, net: output - input }
  }, [incomeRows, expenseRows])

  const missingDocCount = expenseRows.filter(r => !r.hasDoc).length

  const ratesInWindow = useMemo(() => {
    const set = new Set<number>()
    for (const r of incomeRows) set.add(r.vatRate)
    for (const r of expenseRows) set.add(r.vatRate)
    return Array.from(set).sort()
  }, [incomeRows, expenseRows])
  const rateLabel = ratesInWindow.length === 0
    ? '—'
    : ratesInWindow.map(r => `${Math.round(r * 100)}%`).join(' / ')

  if (loading) return <p style={{ color: '#94a3b8' }}>טוען נתוני מע״מ...</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>
          מע״מ — מתאריך {formatDmy(cutoff)}
        </h3>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
          שיעור מע״מ {rateLabel} (עוסק מורשה)
        </span>
      </div>

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
                <th style={{ ...thStyle, textAlign: 'left' }}>סכום ברוטו</th>
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

      <SectionBlock title={`הוצאות מוכרות (${expenseRows.length})${missingDocCount ? ` · ${missingDocCount} ללא מסמך ⚠️` : ''}`}>
        {expenseRows.length === 0 ? (
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
              {expenseRows.map(r => {
                const linked = expenseDocs.find(d => d.transactionId === r.transactionId)
                return (
                  <tr key={r.key} style={trStyle}>
                    <td style={tdStyle}>{formatDmy(r.date)}</td>
                    <td style={tdStyle}>{r.vendor}</td>
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
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700 }}>{ILS(expenseRows.reduce((s, r) => s + r.amount, 0))}</td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700 }}>{ILS(totals.input)}</td>
                <td style={tdStyle}></td>
              </tr>
            </tbody>
          </table>
        )}
      </SectionBlock>
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
