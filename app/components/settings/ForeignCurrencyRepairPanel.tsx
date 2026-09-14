'use client'

import React, { useState } from 'react'
import {
  repairConfirmedForeignCurrencyAmount,
  deleteConfirmedDuplicateTransaction,
} from '@/app/services/duplicateCleanupService'

type Props = {
  onDone: () => void | Promise<void>
  onError: (message: string) => void
}

/**
 * aglamazo#372 — root cause fixed in pdfExtractionRows.ts/extract-pdf-
 * statement/extract-xls-statement (a foreign-currency row's USD amount no
 * longer silently becomes its NIS amount). These are the two rows already
 * imported wrong before that fix: tx 1823 has a CONFIRMED real NIS amount
 * (607.21, read straight from 1473_08_2026.xlsx's settled table) so it's
 * repaired in place; tx 1954 was imported from a "טרם נקלטו" (not yet
 * settled) row that has no NIS figure anywhere in the source document at
 * all — it's removed rather than guessed, and will reappear correctly once
 * a later statement shows it settled.
 *
 * Split into its own component (not another AdvancedTab.tsx section) —
 * that file is at the 850-line eslint cap.
 */
export default function ForeignCurrencyRepairPanel({ onDone, onError }: Props) {
  const [armed, setArmed] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ id: number; label: string; ok: boolean; reason?: string }[] | null>(null)

  const run = async () => {
    setRunning(true)
    try {
      const repair = await repairConfirmedForeignCurrencyAmount(
        1823,
        { merchantContains: 'ANTHROPIC* CLAUDE SUB', currentAmount: -200, date: '2026-07-09' },
        -607.21,
      )
      const remove = await deleteConfirmedDuplicateTransaction(1954, {
        merchantContains: 'ANTHROPIC* CLAUDE SUB',
        amount: -200,
        date: '2026-09-09',
      })
      setResult([
        { id: 1823, label: 'תיקון ל-607.21 ₪ (07/2026)', ok: repair.repaired, reason: repair.reason },
        { id: 1954, label: 'הסרה — טרם נקלטה בפועל (09/2026)', ok: remove.deleted, reason: remove.reason },
      ])
      setArmed(false)
      await onDone()
    } catch (err) {
      console.error('Error repairing foreign-currency transactions:', err)
      onError('הפעולה נכשלה, ראה קונסולה לפרטים.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #fca5a5', borderRadius: '0.75rem', background: '#fef2f2' }}>
      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>עסקת מט&quot;ח שנשמרה בדולר במקום בשקל (aglamazo#372)</h2>
      <p style={{ margin: '0.25rem 0 0', color: '#7f1d1d', fontSize: '0.9rem' }}>
        ANTHROPIC* CLAUDE SUB יובאה פעמיים בסכום הדולרי (200.00-) במקום סכום החיוב בשקלים.
        שורה 1823 (07/2026): מתקן ל-607.21- ₪ — הערך המדויק אומת מול 1473_08_2026.xlsx.
        שורה 1954 (09/2026): מוסר — העסקה טרם נקלטה בפועל בדוח המקור ואין לה עדיין סכום שקלי
        אמיתי; תיקלט נכון בדוח הבא.
      </p>
      {!result && (
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {!armed ? (
            <button onClick={() => setArmed(true)} className="file-picker secondary">
              הכן תיקון
            </button>
          ) : (
            <>
              <span style={{ color: '#7f1d1d', fontSize: '0.9rem' }}>בטוח? הפעולה בלתי הפיכה.</span>
              <button onClick={run} disabled={running} className="upload-another-btn">
                {running ? 'מתקן...' : 'אשר ותקן'}
              </button>
              <button onClick={() => setArmed(false)} className="file-picker secondary">
                ביטול
              </button>
            </>
          )}
        </div>
      )}
      {result && (
        <ul style={{ marginTop: '0.75rem', paddingInlineStart: '1.25rem', fontSize: '0.9rem' }}>
          {result.map((r) => (
            <li key={r.id} style={{ color: r.ok ? '#166534' : '#92400e' }}>
              {r.label} (שורה {r.id}): {r.ok ? 'בוצע' : `נכשל — ${r.reason}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
