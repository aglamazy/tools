'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { ExpenseDocument } from '@/app/db/financeDB'
import { matchReceiptForTransaction, manualPickCandidate, parseDateFolder, extractReceiptFromFile, type CheckedCandidate, type SearchInfo } from '@/app/services/receiptMatchService'
import { uploadExpenseDocument } from '@/app/services/googleDriveService'
import { getAccessToken, requestGoogleAccess } from '@/app/services/googleTokenService'
import SearchResultsModal from './SearchResultsModal'

type MatchStatus = 'idle' | 'searching' | 'uploading' | 'matched' | 'no-match' | 'error'

export type ExpenseMatchTxInput = {
  id: number
  syncId?: string
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
  // Agla, live, on the read-only checked-candidates list: "what is [this]
  // good for? What can I do with it?" — the subject pre-filter can reject
  // a candidate the user can see with their own eyes is the right one
  // (aglamazo#396). Declared here, before the early return below, since
  // every hook in this component must run on every render regardless of
  // which branch it takes (a hook declared after an early return crashed
  // live the moment linkedDoc got set mid-session: "Rendered fewer hooks
  // than expected").
  const [pickingId, setPickingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Google Drive/Gmail share one OAuth grant (googleTokenService.ts), stored
  // device-local and never synced — so "connected" is per-browser-profile,
  // not per-account. null = still checking (avoids a flash of "not
  // connected" before the async check resolves). Both action buttons need
  // this grant, so check it up front rather than let each button discover
  // the gap on click — a device that never granted it showed "שגיאה" on
  // every attempt with no visible reason (aglamazo#343, 2026-09-08).
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    getAccessToken().then(token => { if (!cancelled) setGoogleConnected(!!token) })
    return () => { cancelled = true }
  }, [])

  const handleConnectGoogle = async () => {
    setErrorMsg('')
    const r = await requestGoogleAccess()
    if (r.success) {
      setGoogleConnected(true)
    } else {
      setErrorMsg(r.error || 'החיבור ל-Google נכשל')
      setStatus('error')
    }
  }

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
        {linkedDoc?.mismatch && (
          <span
            title={linkedDoc.mismatchDetails ? `המסמך לא תואם לעסקה: ${linkedDoc.mismatchDetails}` : 'המסמך לא תואם לעסקה — כדאי לבדוק'}
            style={{ color: '#b45309', fontSize: '0.85rem', cursor: 'help' }}
          >
            ⚠️
          </span>
        )}
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
      // Agla, 2026-09-14, live, batch-testing many rows in a row: "I don't
      // want this modal at all." Popping it after every single search made
      // a multi-row batch unusable — the row's own status (⚠️/מסמך/לא נמצא)
      // plus the existing "🔍 N נבדקו" link already let the user open it
      // when THEY want detail, on any one row.
    } catch (err: any) {
      console.error('[ExpenseMatch] exception for tx', transaction.id, transaction.description, ':', err)
      setErrorMsg(err?.message || String(err))
      setStatus('error')
    }
  }

  // Lets the user force verification on ONE specific checked candidate,
  // skipping the subject guess — the real document/body check inside still
  // runs, so a wrong pick is still rejected on its own content.
  const handleManualPick = async (candidate: CheckedCandidate) => {
    if (!claudeApiKey) {
      setErrorMsg('חסר מפתח Anthropic בהגדרות — נדרש לאימות וחילוץ הקבלה')
      return
    }
    setPickingId(candidate.messageId)
    try {
      const result = await manualPickCandidate(
        candidate.messageId,
        { subject: candidate.subject, from: candidate.from },
        transaction,
        transaction.description,
        claudeApiKey,
      )
      if ('doc' in result) {
        onMatched(result.doc)
        setStatus('matched')
        setShowResults(false)
      } else {
        setCheckedCandidates((prev) => prev.map((c) => c.messageId === candidate.messageId ? { ...c, reason: result.error } : c))
      }
    } finally {
      setPickingId(null)
    }
  }

  const handleUpload = async (file: File) => {
    setStatus('uploading')
    setErrorMsg('')
    const isPdf = file.type === 'application/pdf'
    const isImage = file.type.startsWith('image/')
    if (!isPdf && !isImage) {
      setErrorMsg('סוג קובץ לא נתמך (PDF/תמונה בלבד)')
      setStatus('error')
      return
    }
    try {
      const uploaded = await uploadExpenseDocument(file, parseDateFolder(transaction.date))
      if (!uploaded.webViewLink) {
        setErrorMsg('העלאה ל-Drive נכשלה')
        setStatus('error')
        return
      }

      const extracted = await extractReceiptFromFile(
        file,
        { date: transaction.date, description: transaction.description, amount: transaction.amount },
        claudeApiKey,
      )
      console.log('[ExpenseMatch] manual upload extract →', extracted)

      const doc: ExpenseDocument = {
        transactionId: transaction.syncId,
        fileName: file.name,
        vendor: extracted?.vendor,
        amount: extracted?.amount,
        vatAmount: extracted?.vatAmount,
        date: extracted?.date,
        description: extracted?.documentTitle || extracted?.description,
        driveFileId: uploaded.fileId,
        driveWebViewLink: uploaded.webViewLink,
        extractedData: Object.keys(extracted).length > 0 ? extracted : undefined,
        sourceType: 'upload',
        uploadedAt: new Date().toISOString(),
        // The auto-search path REJECTS a candidate outright when Claude's own
        // matchesTransaction check fails; a manual upload had no such guard —
        // it silently accepted whatever was uploaded, vendor/amount mismatch
        // or not. Confirmed live 2026-09-15 (Agla, correctly): a water bill
        // got manually attached to an Arnona transaction with no warning
        // anywhere — "I don't want the fixes to be from behind the scenes.
        // It should be UI solvable." A manual upload is often deliberately an
        // override (the user knows better than the extraction), so this
        // still accepts the doc — but now flags it visibly instead of hiding
        // the mismatch, using the existing (previously unused) mismatch/
        // mismatchDetails fields.
        mismatch: extracted?.matchesTransaction === false,
        mismatchDetails: extracted?.matchReason,
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

  // Neither action works without this grant — show that state up front
  // rather than let the user hit it on click. googleConnected === null
  // (still checking) renders the same connect state, not the normal
  // buttons, so nothing clickable-but-broken flashes before we know.
  if (googleConnected !== true) {
    return (
      <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
        <span title="נדרש חיבור ל-Google כדי לחפש ב-Gmail או להעלות קבצים" style={{ color: '#b45309', fontWeight: 600, fontSize: '0.85rem' }}>⚠️</span>
        <button
          type="button"
          onClick={() => void handleConnectGoogle()}
          style={{
            padding: '0.2rem 0.55rem',
            background: '#fffbeb',
            color: '#92400e',
            border: '1px solid #fde68a',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          התחבר ל-Google
        </button>
        {status === 'error' && errorMsg && (
          <span style={{ color: '#b91c1c', fontSize: '0.75rem' }} title={errorMsg}>
            שגיאה: {errorMsg}
          </span>
        )}
      </div>
    )
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
        // The badge alone hid a genuinely actionable message (e.g. "connect
        // your Google account") behind a hover-only tooltip nobody saw live
        // — Sheli + Agla lost an hour to an opaque "שגיאה" that had the real
        // cause sitting in errorMsg the whole time (aglamazo#343, 2026-09-08).
        <span
          style={{ color: '#b91c1c', fontSize: '0.75rem', cursor: errorMsg ? 'help' : 'default' }}
          title={errorMsg || undefined}
        >
          {errorMsg ? `שגיאה: ${errorMsg}` : 'שגיאה'}
        </span>
      )}
      {(status === 'no-match' || status === 'matched' || status === 'error') && checkedCandidates.length > 0 && (
        <button
          type="button"
          onClick={() => setShowResults(true)}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          🔍 {checkedCandidates.length} נבדקו
        </button>
      )}
      {showResults && (
        <SearchResultsModal
          candidates={checkedCandidates}
          searchInfo={searchInfo}
          onClose={() => setShowResults(false)}
          onPick={handleManualPick}
          pickingId={pickingId}
        />
      )}
    </div>
  )
}
