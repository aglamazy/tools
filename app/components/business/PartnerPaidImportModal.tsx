'use client'

import { useEffect, useMemo, useState } from 'react'
import { db, type ExpenseDocument } from '@/app/db/financeDB'
import { uploadExpenseDocument } from '@/app/services/googleDriveService'
import type { Partner as Participant } from '@/app/stores/partnerStore'
import type { Category } from '@/app/types/category'
import { normalizeDate } from '@/app/utils/parsers/shared'

interface PartnerPaidImportModalProps {
  open: boolean
  onClose: () => void
  businessId: string
  participants: Participant[]
  categories: Category[]
  selfUid: string | undefined
  claudeApiKey: string
  onImported: (count: number) => void
}

type ExtractedData = {
  vendor?: string
  documentTitle?: string
  description?: string
  date?: string
  amount?: number
  vatAmount?: number
  [key: string]: unknown
}

type RowStatus = 'pending' | 'extracting' | 'extracted' | 'failed' | 'dup-hard' | 'dup-soft'

type RowState = {
  fileName: string
  size: number
  lastModified: number
  status: RowStatus
  error?: string
  // Filled after Drive upload
  driveFileId?: string
  driveWebViewLink?: string
  // Filled after LLM extract
  vendor: string
  date: string                  // DD/MM/YYYY
  amount: number                // positive number; expense
  vatAmount?: number
  description?: string
  extractedData?: ExtractedData
  // User-editable
  paidByUid: string
  category: string
  // Dedup
  dedupMessage?: string
  includeInImport: boolean
}

// Local re-implementation of ExpenseTab's extractFromFile — same call shape,
// returned shape is ExtractedData with optional fields.
async function extractFromFile(
  file: File,
  hint: { date: string; description: string; amount: number },
  claudeApiKey: string,
): Promise<ExtractedData> {
  if (!claudeApiKey) return {}
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)

  const isPdf = file.type === 'application/pdf'
  const isImage = file.type.startsWith('image/')
  if (!isPdf && !isImage) return {}

  const res = await fetch('/api/match-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      isPdf
        ? { action: 'extract-pdf', pdfBase64: base64, transaction: hint, claudeApiKey }
        : {
            action: 'extract-image',
            imageBase64: base64,
            mediaType: file.type,
            transaction: hint,
            claudeApiKey,
          },
    ),
  })
  const out = await res.json()
  return out?.error ? {} : (out as ExtractedData)
}

function normalizeDateDdMmYyyy(input: string | undefined, fallbackTodayStr: string): string {
  const normalized = normalizeDate(input)
  const canonical = normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : normalizeDate(fallbackTodayStr)

  if (!canonical || !/^\d{4}-\d{2}-\d{2}$/.test(canonical)) return fallbackTodayStr
  const [year, month, day] = canonical.split('-')
  return `${day}/${month}/${year}`
}

function monthFromDateDdMmYyyy(date: string): string {
  const normalized = normalizeDate(date)
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return ''
  const [year, month] = normalized.split('-')
  return `${month}/${year}`
}

export default function PartnerPaidImportModal({
  open,
  onClose,
  businessId,
  participants,
  categories,
  selfUid,
  claudeApiKey,
  onImported,
}: PartnerPaidImportModalProps) {
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense' && c.businessId === businessId),
    [categories, businessId],
  )
  const defaultPartnerUid = useMemo(() => {
    const nonSelf = participants.find((p) => p.uid !== selfUid)
    return nonSelf?.uid || participants[0]?.uid || ''
  }, [participants, selfUid])

  const [phase, setPhase] = useState<'pick' | 'extract' | 'confirm'>('pick')
  const [modalPaidByUid, setModalPaidByUid] = useState<string>(defaultPartnerUid)
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<RowState[]>([])
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (!open) {
      // Reset on close so a reopened modal is clean.
      setPhase('pick')
      setFiles([])
      setRows([])
      setError('')
      setCommitting(false)
    }
  }, [open])

  useEffect(() => {
    setModalPaidByUid(defaultPartnerUid)
  }, [defaultPartnerUid])

  if (!open) return null

  const startExtraction = async () => {
    if (files.length === 0) return
    setPhase('extract')
    setError('')

    // Seed all rows as 'pending' so the user sees the list immediately.
    const today = new Date()
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
    const initialRows: RowState[] = files.map((f) => ({
      fileName: f.name,
      size: f.size,
      lastModified: f.lastModified,
      status: 'pending',
      vendor: '',
      date: todayStr,
      amount: 0,
      paidByUid: modalPaidByUid,
      category: '',
      includeInImport: true,
    }))
    setRows(initialRows)

    // Pull existing partner-paid docs once for dedup. Scope to this business.
    const existingDocs: ExpenseDocument[] = await db.expenseDocuments
      .filter((d) => d.businessId === businessId && !d.transactionId && !!d.paidByUid)
      .toArray()

    // Per-file processing — captures only its index `i` so it's safe to run
    // many in parallel.
    const processFile = async (i: number) => {
      const file = files[i]
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'extracting' } : r)))
      try {
        const yearStr = String(today.getFullYear())
        const monthStr = String(today.getMonth() + 1).padStart(2, '0')
        // Drive upload + LLM extract in parallel — they don't depend on
        // each other, so parallelizing inside each file shaves a network
        // round-trip per file too.
        const [uploaded, extracted] = await Promise.all([
          uploadExpenseDocument(file, { year: yearStr, month: monthStr }),
          extractFromFile(
            file,
            { date: todayStr, description: 'הוצאה ששילם שותף', amount: 0 },
            claudeApiKey,
          ),
        ])

        const date = normalizeDateDdMmYyyy(extracted.date, todayStr)
        const vendor =
          (typeof extracted.vendor === 'string' && extracted.vendor) ||
          (typeof extracted.documentTitle === 'string' && extracted.documentTitle) ||
          (typeof extracted.description === 'string' && extracted.description) ||
          file.name
        const amount = typeof extracted.amount === 'number' ? Math.abs(extracted.amount) : 0
        const vatAmount =
          typeof extracted.vatAmount === 'number' ? Math.abs(extracted.vatAmount) : undefined

        const externalTxRef =
          typeof extracted.externalTxRef === 'string' ? extracted.externalTxRef : undefined
        const referenceNumber =
          typeof extracted.referenceNumber === 'string' ? extracted.referenceNumber : undefined
        const docType =
          extracted.docType === 'invoice' ||
          extracted.docType === 'receipt' ||
          extracted.docType === 'receipt-invoice' ||
          extracted.docType === 'unknown'
            ? extracted.docType
            : undefined

        let dedupStatus: RowStatus = 'extracted'
        let dedupMessage: string | undefined
        if (externalTxRef) {
          const hardHit = existingDocs.find((d) => d.externalTxRef === externalTxRef)
          if (hardHit) {
            dedupStatus = 'dup-hard'
            dedupMessage = `כבר קיים — מזהה ${externalTxRef.slice(0, 24)}`
          }
        }
        if (dedupStatus === 'extracted') {
          const softHit = existingDocs.find(
            (d) =>
              d.vendor === vendor &&
              d.date === date &&
              typeof d.amount === 'number' &&
              Math.abs(d.amount - amount) < 0.01,
          )
          if (softHit) {
            dedupStatus = 'dup-soft'
            dedupMessage = 'ייתכן שכבר קיים (אותו ספק / תאריך / סכום)'
          }
        }

        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: dedupStatus,
                  driveFileId: uploaded.fileId,
                  driveWebViewLink: uploaded.webViewLink,
                  vendor,
                  date,
                  amount,
                  vatAmount,
                  description: vendor,
                  extractedData: {
                    ...extracted,
                    externalTxRef,
                    referenceNumber,
                    docType,
                  },
                  dedupMessage,
                  includeInImport: dedupStatus === 'extracted',
                }
              : r,
          ),
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה'
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: 'failed', error: msg, includeInImport: false } : r,
          ),
        )
      }
    }

    // Worker-pool with concurrency cap. Each worker pulls the next file
    // index from the shared counter until exhausted. CONCURRENCY=4 balances
    // throughput vs. browser network connection limit + Anthropic rate.
    // A single bad file (timeout, 429) only blocks one slot at a time.
    const CONCURRENCY = 4
    let nextIndex = 0
    const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
      while (true) {
        const i = nextIndex++
        if (i >= files.length) return
        await processFile(i)
      }
    })
    await Promise.all(workers)

    setPhase('confirm')
  }

  const updateRow = (i: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const checkedCount = rows.filter((r) => r.includeInImport && r.status !== 'failed').length

  const commit = async () => {
    setCommitting(true)
    setError('')
    try {
      const nowIso = new Date().toISOString()
      const toInsert: ExpenseDocument[] = rows
        .filter((r) => r.includeInImport && r.status !== 'failed')
        .map((r) => ({
          fileName: r.fileName,
          driveFileId: r.driveFileId,
          driveWebViewLink: r.driveWebViewLink,
          date: r.date,
          vendor: r.vendor,
          amount: r.amount,
          vatAmount: r.vatAmount,
          category: r.category || undefined,
          description: r.description || r.vendor,
          extractedData: r.extractedData,
          sourceType: 'upload',
          uploadedAt: nowIso,
          businessId,
          paidByUid: r.paidByUid,
          externalTxRef:
            typeof r.extractedData?.externalTxRef === 'string'
              ? r.extractedData.externalTxRef
              : undefined,
          referenceNumber:
            typeof r.extractedData?.referenceNumber === 'string'
              ? r.extractedData.referenceNumber
              : undefined,
          docType:
            r.extractedData?.docType === 'invoice' ||
            r.extractedData?.docType === 'receipt' ||
            r.extractedData?.docType === 'receipt-invoice' ||
            r.extractedData?.docType === 'unknown'
              ? r.extractedData.docType
              : undefined,
        }))
      await db.expenseDocuments.bulkAdd(toInsert)
      onImported(toInsert.length)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה'
      setError(`שמירה נכשלה: ${msg}`)
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !committing && phase !== 'extract') onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem 1rem',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: '#fff',
          width: 'min(960px, 100%)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
          direction: 'rtl',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
            ייבוא חשבוניות ששילם שותף
          </h2>
          <button
            onClick={onClose}
            disabled={phase === 'extract'}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '1.5rem',
              cursor: phase === 'extract' ? 'wait' : 'pointer',
              color: '#64748b',
            }}
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        {phase === 'pick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                שולם על ידי
              </label>
              <select
                value={modalPaidByUid}
                onChange={(e) => setModalPaidByUid(e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #cbd5e1',
                  width: '100%',
                  fontSize: '0.9rem',
                  background: '#fff',
                }}
              >
                {participants.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                קבצים (אפשר לבחור כמה)
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                style={{ fontSize: '0.85rem' }}
              />
              {files.length > 0 && (
                <ul style={{ marginTop: '0.5rem', paddingInlineStart: '1.25rem', fontSize: '0.85rem', color: '#475569' }}>
                  {files.map((f, i) => (
                    <li key={i}>
                      {f.name} <span style={{ color: '#94a3b8' }}>({Math.round(f.size / 1024)} KB)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                ביטול
              </button>
              <button
                onClick={startExtraction}
                disabled={files.length === 0 || !modalPaidByUid}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: files.length === 0 || !modalPaidByUid ? '#93c5fd' : '#3b82f6',
                  color: '#fff',
                  cursor: files.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                המשך לחילוץ
              </button>
            </div>
          </div>
        )}

        {phase === 'extract' && (() => {
          const done = rows.filter(
            (r) => r.status === 'extracted' || r.status === 'dup-soft' || r.status === 'dup-hard' || r.status === 'failed',
          ).length
          return (
          <div>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '0.5rem' }}>
              מחלץ נתונים מהקבצים ({done}/{rows.length}, 4 במקביל) — אין לסגור בזמן הטעינה
            </p>
            <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.85rem' }}>
              {rows.map((r, i) => (
                <li key={i} style={{ padding: '0.25rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>#{i + 1}</span>{' '}
                  <strong>{r.fileName}</strong>{' '}
                  <span style={{ color: '#0ea5e9' }}>
                    {r.status === 'pending' && 'בהמתנה...'}
                    {r.status === 'extracting' && 'מחלץ...'}
                    {r.status === 'extracted' && '✓ הופק'}
                    {r.status === 'dup-soft' && '⚠ ייתכן כפיל'}
                    {r.status === 'dup-hard' && '⚠ כבר קיים'}
                    {r.status === 'failed' && `✗ ${r.error || 'נכשל'}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          )
        })()}

        {phase === 'confirm' && (
          <div>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '0.5rem' }}>
              {checkedCount > 0
                ? `סקירת ${checkedCount} חשבוניות מוכנות לייבוא — אפשר לערוך כל שורה`
                : 'אין שורות לייבוא — יש לבדוק את ההתראות מימין'}
            </p>
            <div style={{ overflowX: 'auto', marginBottom: '0.75rem' }}>
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'right', color: '#475569', background: '#f8fafc' }}>
                    <th style={{ padding: '0.4rem' }}>✓</th>
                    <th style={{ padding: '0.4rem' }}>תאריך</th>
                    <th style={{ padding: '0.4rem' }}>שולם ע״י</th>
                    <th style={{ padding: '0.4rem' }}>ספק</th>
                    <th style={{ padding: '0.4rem' }}>סכום</th>
                    <th style={{ padding: '0.4rem' }}>נושא</th>
                    <th style={{ padding: '0.4rem' }}>קובץ / סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', opacity: r.status === 'failed' ? 0.6 : 1 }}>
                      <td style={{ padding: '0.4rem' }}>
                        <input
                          type="checkbox"
                          checked={r.includeInImport}
                          disabled={r.status === 'failed'}
                          onChange={(e) => updateRow(i, { includeInImport: e.target.checked })}
                        />
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <input
                          type="text"
                          value={r.date}
                          onChange={(e) => updateRow(i, { date: e.target.value })}
                          style={{ width: 100, padding: '0.25rem 0.4rem', border: '1px solid #cbd5e1', borderRadius: 4 }}
                        />
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <select
                          value={r.paidByUid}
                          onChange={(e) => updateRow(i, { paidByUid: e.target.value })}
                          style={{ padding: '0.25rem 0.4rem', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.85rem' }}
                        >
                          {participants.map((p) => (
                            <option key={p.uid} value={p.uid}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <input
                          type="text"
                          value={r.vendor}
                          onChange={(e) => updateRow(i, { vendor: e.target.value })}
                          style={{ width: 180, padding: '0.25rem 0.4rem', border: '1px solid #cbd5e1', borderRadius: 4 }}
                        />
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={r.amount}
                          onChange={(e) => updateRow(i, { amount: parseFloat(e.target.value) || 0 })}
                          style={{ width: 90, padding: '0.25rem 0.4rem', border: '1px solid #cbd5e1', borderRadius: 4 }}
                        />
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <select
                          value={r.category}
                          onChange={(e) => updateRow(i, { category: e.target.value })}
                          style={{ padding: '0.25rem 0.4rem', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.85rem' }}
                        >
                          <option value="">— ללא —</option>
                          {expenseCategories.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem', maxWidth: 260 }}>
                        <div style={{ fontSize: '0.78rem', color: '#475569', wordBreak: 'break-word' }}>
                          {r.driveWebViewLink ? (
                            <a href={r.driveWebViewLink} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9' }}>
                              {r.fileName}
                            </a>
                          ) : (
                            r.fileName
                          )}
                          {r.dedupMessage && (
                            <div style={{ color: '#b45309', marginTop: 2 }}>⚠ {r.dedupMessage}</div>
                          )}
                          {r.status === 'failed' && r.error && (
                            <div style={{ color: '#b91c1c', marginTop: 2 }}>✗ {r.error}</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{error}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '0.5rem' }}>
              <button
                onClick={onClose}
                disabled={committing}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  cursor: committing ? 'wait' : 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                ביטול
              </button>
              <button
                onClick={commit}
                disabled={committing || checkedCount === 0}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: committing || checkedCount === 0 ? '#93c5fd' : '#3b82f6',
                  color: '#fff',
                  cursor: committing || checkedCount === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                {committing ? 'שומר...' : `אשר ${checkedCount} חשבוניות`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
