'use client'

import { useRef, useState } from 'react'
import type { ExpenseDocument } from '@/app/db/financeDB'
import { matchReceiptForTransaction } from '@/app/services/receiptMatchService'
import { getAccessToken } from '@/app/services/googleTokenService'

export type BatchMatchRow = {
  transactionId: number
  transactionSyncId: string
  txDescription: string
  txMerchant?: string
  txAmount: number
  txDateStr: string // DD/MM/YYYY
}

type ExpenseBatchMatchControlProps = {
  rows: BatchMatchRow[] // rows WITHOUT a linked doc — the caller filters
  claudeApiKey: string
  onMatched: (doc: ExpenseDocument) => Promise<void> | void
  onError: (message: string) => void
}

// Agla, 2026-09-14: "the loop should run few files at a time. Maybe 8?" —
// bounded-concurrency worker pool instead of fully sequential. A worker pool
// (not Promise.all-everything) keeps at most this many matchReceiptForTransaction
// calls in flight at once, picking up the next row as soon as one finishes,
// so a handful of slow no-known-sender rows can't starve the rest of the batch.
const CONCURRENCY = 8

/**
 * Runs the Gmail-receipt matcher over every unmatched expense row, up to
 * CONCURRENCY at a time, with visible progress and a stop button (born from
 * live batch-testing row by row: "Can we add a button to run a loop over all
 * rows?"). A row with no known sender can check a dozen+ real candidates on
 * its own, so a full run can take a while — the stop button and live counter
 * exist because of that, not as polish. Stop takes effect once the rows
 * already in flight finish (up to CONCURRENCY of them), not instantly — there
 * is no way to abort a Gmail/LLM call already underway.
 */
export default function ExpenseBatchMatchControl({ rows, claudeApiKey, onMatched, onError }: ExpenseBatchMatchControlProps) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; matched: number } | null>(null)
  const stopRef = useRef(false)

  const run = async () => {
    if (!claudeApiKey) {
      onError('חסר מפתח Anthropic בהגדרות — נדרש לאימות וחילוץ קבלות')
      return
    }
    const token = await getAccessToken()
    if (!token) {
      onError('נדרש חיבור ל-Google כדי לחפש ב-Gmail')
      return
    }
    const targets = [...rows]
    if (targets.length === 0) return
    onError('')
    stopRef.current = false
    setRunning(true)
    let matched = 0
    let done = 0
    let nextIndex = 0
    setProgress({ done: 0, total: targets.length, matched: 0 })

    const worker = async () => {
      while (!stopRef.current) {
        const i = nextIndex++
        if (i >= targets.length) return
        const r = targets[i]
        try {
          const result = await matchReceiptForTransaction(
            { id: r.transactionId, syncId: r.transactionSyncId, date: r.txDateStr, description: r.txDescription, merchant: r.txMerchant, amount: r.txAmount },
            claudeApiKey,
          )
          if (result.status === 'matched') {
            await onMatched(result.doc)
            matched++
          }
        } catch (err) {
          console.error('[ExpenseBatchMatch] error for tx', r.transactionId, r.txDescription, ':', err)
        }
        done++
        setProgress({ done, total: targets.length, matched })
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()))

    setProgress({ done, total: targets.length, matched })
    setRunning(false)
  }

  if (rows.length === 0 && !progress) return null

  if (running) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#1e40af' }}>
        בודק {progress?.done ?? 0}/{progress?.total ?? 0} · נמצאו {progress?.matched ?? 0}
        <button
          type="button"
          onClick={() => { stopRef.current = true }}
          style={{ padding: '0.1rem 0.5rem', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.75rem' }}
        >
          עצור
        </button>
      </span>
    )
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {rows.length > 0 && (
        <button
          type="button"
          onClick={() => void run()}
          title="מריץ חיפוש+אימות ב-Gmail על כל ההוצאות ללא מסמך, אחת אחרי השנייה"
          style={{ padding: '0.2rem 0.6rem', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}
        >
          🔄 בדוק הכל ב-Gmail ({rows.length})
        </button>
      )}
      {progress && progress.done === progress.total && (
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
          הושלם — נמצאו {progress.matched} מתוך {progress.total}
        </span>
      )}
    </span>
  )
}
