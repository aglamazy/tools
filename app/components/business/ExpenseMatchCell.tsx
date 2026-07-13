'use client'

import React, { useRef, useState } from 'react'
import type { ExpenseDocument } from '@/app/db/financeDB'
import { matchReceiptForTransaction, parseDateFolder, type CheckedCandidate, type SearchInfo } from '@/app/services/receiptMatchService'
import { hasGmailAccess, requestGmailAccess } from '@/app/services/gmailService'
import { uploadExpenseDocument } from '@/app/services/googleDriveService'
import SearchResultsModal from './SearchResultsModal'

type MatchStatus = 'idle' | 'searching' | 'uploading' | 'matched' | 'no-match' | 'error'

export type ExpenseMatchTxInput = {
  id: number
  date: string // DD/MM/YYYY
  description: string
  merchant?: string
  amount: number
}

type ExpenseMatchCellProps = {
  transaction: ExpenseMatchTxInput
  linkedDoc?: ExpenseDocument
  claudeApiKey: string
  onMatched: (doc: ExpenseDocument) => void
  onUnlink: (docId: number) => void
}

export default function ExpenseMatchCell({ transaction, linkedDoc, claudeApiKey, onMatched, onUnlink }: ExpenseMatchCellProps) {
  const [status, setStatus] = useState<MatchStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [checkedCandidates, setCheckedCandidates] = useState<CheckedCandidate[]>([])
  const [searchInfo, setSearchInfo] = useState<SearchInfo | null>(null)
  const [showResults, setShowResults] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // A doc counts as truly linked if either:
  //  - we have an independent stored copy on Drive (driveWebViewLink), or
  //  - we captured an externalUrl (e.g. YPAY hosted invoice, no PDF attachment).
  // Anything else is a half-match from the older flow — treat it as not-yet-
  // linked so the user can re-run the matcher.
  const docHref = linkedDoc?.driveWebViewLink || linkedDoc?.externalUrl
  if (docHref) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
        <a
          href={docHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem' }}
          title={linkedDoc?.vendor || linkedDoc?.fileName}
        >
          מסמך
        </a>
        <button
          type="button"
          onClick={() => { if (linkedDoc?.id != null) onUnlink(linkedDoc.id) }}
          title="הסר קישור למסמך — כדי לחפש ולחלץ מחדש"
          style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', padding: 0, lineHeight: 1 }}
        >
          ✕
        </button>
      </span>
    )
  }

  const handleMatch = async () => {
    setStatus('searching')
    setErrorMsg('')
    setCheckedCandidates([])
    if (!hasGmailAccess()) {
      const r = await requestGmailAccess()
      if (!r.success) {
        console.error('[ExpenseMatch] Gmail access denied:', r.error)
        setErrorMsg(r.error || 'Gmail access denied')
        setStatus('error')
        return
      }
    }
    if (!claudeApiKey) {
      console.error('[ExpenseMatch] No Claude API key set — cannot verify/extract receipts')
      setErrorMsg('חסר מפתח Anthropic בהגדרות — נדרש לאימות וחילוץ הקבלה')
      setStatus('error')
      return
    }
    try {
      const result = await matchReceiptForTransaction(transaction, claudeApiKey)
      console.log('[ExpenseMatch] result for tx', transaction.id, transaction.description, ':', result)
      setCheckedCandidates(result.checkedCandidates)
      setSearchInfo(result.searchInfo)
      if (result.status === 'matched') {
        onMatched(result.doc)
      }
      setStatus(result.status)
      setShowResults(true)
    } catch (err: any) {
      console.error('[ExpenseMatch] exception for tx', transaction.id, transaction.description, ':', err)
      setErrorMsg(err?.message || String(err))
      setStatus('error')
    }
  }

  const handleUpload = async (file: File) => {
    setStatus('uploading')
    setErrorMsg('')
    if (!claudeApiKey) {
      setErrorMsg('חסר מפתח Anthropic בהגדרות — נדרש לחילוץ נתוני הקבלה')
      setStatus('error')
      return
    }
    const isPdf = file.type === 'application/pdf'
    const isImage = file.type.startsWith('image/')
    if (!isPdf && !isImage) {
      setErrorMsg('סוג קובץ לא נתמך (PDF/תמונה בלבד)')
      setStatus('error')
      return
    }
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)

      const uploaded = await uploadExpenseDocument(file, parseDateFolder(transaction.date))
      if (!uploaded.webViewLink) {
        setErrorMsg('העלאה ל-Drive נכשלה')
        setStatus('error')
        return
      }

      const extractRes = await fetch('/api/match-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isPdf ? {
          action: 'extract-pdf', pdfBase64: base64,
          transaction: { date: transaction.date, description: transaction.description, amount: transaction.amount },
          claudeApiKey,
        } : {
          action: 'extract-image', imageBase64: base64, mediaType: file.type,
          transaction: { date: transaction.date, description: transaction.description, amount: transaction.amount },
          claudeApiKey,
        }),
      })
      const extracted = await extractRes.json()
      console.log('[ExpenseMatch] manual upload extract →', extracted)

      const doc: ExpenseDocument = {
        transactionId: transaction.id,
        fileName: file.name,
        vendor: extracted?.vendor,
        amount: extracted?.amount,
        vatAmount: extracted?.vatAmount,
        date: extracted?.date,
        description: extracted?.documentTitle || extracted?.description,
        driveFileId: uploaded.fileId,
        driveWebViewLink: uploaded.webViewLink,
        extractedData: extracted?.error ? undefined : extracted,
        sourceType: 'upload',
        uploadedAt: new Date().toISOString(),
      }
      onMatched(doc)
      setStatus('matched')
    } catch (err: any) {
      console.error('[ExpenseMatch] upload failed for tx', transaction.id, ':', err)
      setErrorMsg(err?.message || String(err))
      setStatus('error')
    }
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleUpload(file)
    e.target.value = ''
  }

  if (status === 'searching') {
    return <span style={{ color: '#64748b', fontSize: '0.8rem' }}>מחפש…</span>
  }
  if (status === 'uploading') {
    return <span style={{ color: '#64748b', fontSize: '0.8rem' }}>מעלה…</span>
  }

  return (
    <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
      <span title="הוצאה ללא מסמך מאומת" style={{ color: '#b45309', fontWeight: 600, fontSize: '0.85rem' }}>⚠️</span>
      <button
        type="button"
        onClick={() => void handleMatch()}
        style={{
          padding: '0.2rem 0.55rem',
          background: '#eff6ff',
          color: '#1e40af',
          border: '1px solid #bfdbfe',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          fontSize: '0.8rem',
        }}
      >
        חפש ב-Gmail
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title="העלה קובץ PDF או תמונה של הקבלה"
        style={{
          padding: '0.2rem 0.55rem',
          background: '#f0fdf4',
          color: '#166534',
          border: '1px solid #bbf7d0',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          fontSize: '0.8rem',
        }}
      >
        העלה קובץ
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        onChange={handleFilePick}
        style={{ display: 'none' }}
      />
      {status === 'no-match' && <span style={{ color: '#b45309', fontSize: '0.75rem' }}>לא נמצא</span>}
      {status === 'error' && (
        <span
          style={{ color: '#b91c1c', fontSize: '0.75rem', cursor: 'help' }}
          title={errorMsg || 'ראה קונסולה לפרטים'}
        >
          שגיאה
        </span>
      )}
      {(status === 'no-match' || status === 'matched') && checkedCandidates.length > 0 && (
        <button
          type="button"
          onClick={() => setShowResults(true)}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          🔍 {checkedCandidates.length} נבדקו
        </button>
      )}
      {showResults && (
        <SearchResultsModal candidates={checkedCandidates} searchInfo={searchInfo} onClose={() => setShowResults(false)} />
      )}
    </div>
  )
}
