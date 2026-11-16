'use client'

import React from 'react'
import type { MonthIncome } from './invoiceIncome'
import { fmt } from './taxSharedStyles'

const DOC_TYPE_LABEL: Record<number, string> = {
  106: 'חשבונית מס',
  107: 'חשבונית מס זיכוי',
  108: 'קבלה',
  109: 'חשבונית מס קבלה',
}

const th: React.CSSProperties = { padding: '0.3rem 0.5rem', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #e2e8f0' }
const td: React.CSSProperties = { padding: '0.4rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem', textAlign: 'right' }
const num: React.CSSProperties = { ...td, textAlign: 'left', direction: 'ltr' }

/**
 * aglamazo#485: the drill-down behind an income figure — the tax documents
 * it is made of, then every deposit no counted invoice covers ("unpapered":
 * per the bookkeeping method §4 it needs a receipt linked or issued). Both
 * lists add up to the figure shown; amounts excl. VAT.
 */
export default function IncomeDocsList({ income }: { income: MonthIncome }) {
  if (income.docs.length === 0 && income.unpapered.length === 0) {
    return <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>אין הכנסות בחודש זה.</p>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      {income.docs.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>תאריך</th>
              <th style={th}>מספר</th>
              <th style={th}>סוג</th>
              <th style={th}>לקוח</th>
              <th style={{ ...th, textAlign: 'left' }}>סכום לפני מע״מ</th>
            </tr>
          </thead>
          <tbody>
            {income.docs.map((d, i) => (
              <tr key={`${d.docId ?? d.serial}-${i}`}>
                <td style={td}>{d.date}</td>
                <td style={td}>{d.serial}</td>
                <td style={td}>{DOC_TYPE_LABEL[d.docType] || d.docType}</td>
                <td style={td}>{d.customer || '—'}</td>
                <td style={{ ...num, color: d.net < 0 ? '#dc2626' : '#16a34a' }}>{fmt(d.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {income.unpapered.length > 0 && (
        <div style={{ marginTop: income.docs.length > 0 ? '0.75rem' : 0 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#b45309', marginBottom: '0.25rem' }}>
            ⚠ הכנסה ללא חשבונית — הפקדה שלא מכוסה בחשבונית. יש לקשר קבלה או להפיק אחת.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>תאריך</th>
                <th style={th}>תיאור</th>
                <th style={th}>מצב</th>
                <th style={{ ...th, textAlign: 'left' }}>הפקדה</th>
                <th style={{ ...th, textAlign: 'left' }}>לפני מע״מ</th>
              </tr>
            </thead>
            <tbody>
              {income.unpapered.map((u, i) => (
                <tr key={`${u.txId ?? i}-${i}`} style={{ background: '#fffbeb' }}>
                  <td style={td}>{u.date}</td>
                  <td style={td}>{u.description || '—'}</td>
                  <td style={td}>{u.linkedDocNoAmount ? `מסמך ${u.receiptSerial} ללא סכום` : u.receiptSerial ? `קבלה ${u.receiptSerial} ללא חשבונית` : 'ללא קבלה'}</td>
                  <td style={num}>{fmt(u.gross)}</td>
                  <td style={{ ...num, color: '#b45309' }}>{fmt(u.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
