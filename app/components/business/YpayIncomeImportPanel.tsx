'use client'

import React, { useState } from 'react'
import { readExcelFile } from '@/app/utils/excelReader'
import {
  parseYpayIncomeExportRows,
  importYpayIncomeRows,
  type YpayIncomeImportSummary,
} from '@/app/services/ypayIncomeImportService'

type Props = {
  onImported: () => void | Promise<void>
}

/**
 * aglamazo#381 part (b) — Agla: "the file is on ~/Downloads - read it to
 * shape the read incomes ... Should be taken care and dedup from existing
 * data." ypay has no bulk document-listing API (checked against the v1.9
 * docs), so Agla exports "ארכיון הכנסות" from ypay's own dashboard by hand
 * and uploads it here. Kept as its own component (not inline in
 * TaxVatSection.tsx's settings modal) since that file is already close to
 * the 850-line eslint cap.
 */
export default function YpayIncomeImportPanel({ onImported }: Props) {
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<YpayIncomeImportSummary | null>(null)

  const handleFile = async (file: File) => {
    setImporting(true)
    setError(null)
    setSummary(null)
    try {
      const rows = await readExcelFile(file)
      const { imported, ignoredCount, cancelledCount, testRowsExcluded } = parseYpayIncomeExportRows(rows)
      const result = await importYpayIncomeRows(imported, { ignoredCount, cancelledCount, testRowsExcluded })
      setSummary(result)
      await onImported()
    } catch (err: any) {
      console.error('[YpayIncomeImportPanel] import failed:', err)
      setError(err?.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#64748b' }}>
        אין API לחילוץ מסמכים מ-ypay — ייבוא קובץ &quot;ארכיון הכנסות&quot; שהופק ידנית מהדשבורד של
        ypay. חשבוניות מס וחשבוניות מס קבלה בלבד; זיכויים וקבלות רגילות מדולגים, ושורה שיש לה
        זיכוי תואם (אותו לקוח, אותו תאריך, סכום הפוך) מבוטלת גם היא ולא נספרת כהכנסה. שורות של
        לקוח &quot;בדיקות&quot; מדולגות לגמרי. שורה בתקופה שכבר דווחה ושולמה למע&quot;מ לא נוגעים בה. תיעוד
        קיים (לפי מס&apos; אסמכתא) לא נדרס. שיוך לעסק אוטומטי לפי עסקה תואמת בבנק/אשראי (סכום+תאריך),
        או לפי שם הלקוח מול שם פרויקט קיים — ללא התאמה חד-משמעית, המסמך נשאר לא משויך לקישור ידני.
      </p>
      <label className="file-picker secondary" style={{ display: 'inline-block', cursor: importing ? 'default' : 'pointer' }}>
        {importing ? 'מייבא...' : 'ייבוא קובץ ארכיון הכנסות'}
        <input
          type="file"
          accept=".xls,.xlsx"
          disabled={importing}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) handleFile(file)
          }}
        />
      </label>
      {error && (
        <p style={{ marginTop: '0.5rem', color: '#b91c1c', fontSize: '0.85rem' }}>{error}</p>
      )}
      {summary && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
          <p style={{ margin: 0, color: '#166534' }}>
            נוספו {summary.added} · תוקנו {summary.repaired} · תקינים כבר {summary.alreadyCorrect} · דולגו (סוג לא רלוונטי) {summary.ignoredType}
            {summary.cancelledCount > 0 ? ` · בוטלו ע"י זיכוי ${summary.cancelledCount}` : ''}
            {summary.testRowsExcluded.length > 0 ? ` · דולגו (בדיקות) ${summary.testRowsExcluded.length}` : ''}
          </p>
          {summary.unmatchedCount > 0 && (
            <p style={{ margin: '0.25rem 0 0', color: '#b45309' }}>
              ⚠️ {summary.unmatchedCount} מסמכים ללא עסקה תואמת בבנק/אשראי וללא פרויקט תואם לפי שם הלקוח — לא משויכים לעסק עדיין; ניתן לקשר ידנית בטאב ההכנסות (&quot;קשר&quot;), או שיובאו נכון בהרצה חוזרת לאחר שהעסקה/הפרויקט הרלוונטיים יתווספו.
            </p>
          )}
          {summary.skippedClosedPeriod.length > 0 && (
            <p style={{ margin: '0.25rem 0 0', color: '#b91c1c' }}>
              🚫 {summary.skippedClosedPeriod.length} מסמכים בתקופה שכבר דווחה ושולמה למע&quot;מ — לא נגעתי בהם: {summary.skippedClosedPeriod.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
