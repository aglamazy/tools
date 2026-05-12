'use client'

import React, { useState } from 'react'
import type { ExpenseDocument } from '@/app/db/financeDB'
import { matchReceiptForTransaction } from '@/app/services/receiptMatchService'
import { hasGmailAccess, requestGmailAccess } from '@/app/services/gmailService'

type MatchStatus = 'idle' | 'searching' | 'matched' | 'no-match' | 'error'

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
}

export default function ExpenseMatchCell({ transaction, linkedDoc, claudeApiKey, onMatched }: ExpenseMatchCellProps) {
  const [status, setStatus] = useState<MatchStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')

  // A doc only counts as truly linked if we have an independent stored copy
  // (driveWebViewLink). Anything else is a half-match from the older flow —
  // treat it as not-yet-linked so the user can re-run the matcher.
  if (linkedDoc?.driveWebViewLink) {
    return (
      <a
        href={linkedDoc.driveWebViewLink}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem' }}
        title={linkedDoc.vendor || linkedDoc.fileName}
      >
        מסמך
      </a>
    )
  }

  const handleMatch = async () => {
    setStatus('searching')
    setErrorMsg('')
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
      if (result.status === 'matched') {
        onMatched(result.doc)
      }
      setStatus(result.status)
    } catch (err: any) {
      console.error('[ExpenseMatch] exception for tx', transaction.id, transaction.description, ':', err)
      setErrorMsg(err?.message || String(err))
      setStatus('error')
    }
  }

  if (status === 'searching') {
    return <span style={{ color: '#64748b', fontSize: '0.8rem' }}>מחפש…</span>
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
      {status === 'no-match' && <span style={{ color: '#b45309', fontSize: '0.75rem' }}>לא נמצא</span>}
      {status === 'error' && (
        <span
          style={{ color: '#b91c1c', fontSize: '0.75rem', cursor: 'help' }}
          title={errorMsg || 'ראה קונסולה לפרטים'}
        >
          שגיאה
        </span>
      )}
    </div>
  )
}
