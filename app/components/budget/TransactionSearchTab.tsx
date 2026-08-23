'use client'

import { useEffect, useState } from 'react'
import { transactionStore } from '@/app/stores/transactionStore'
import { matchesTransactionSearch } from '@/app/components/budget/transactionSearch'
import { useTransactionSort, type SortKey } from '@/app/components/budget/useTransactionSort'
import type { BudgetTransaction } from '@/app/types/transactions'

const SORTABLE_COLS: [SortKey, string][] = [
  ['date', 'תאריך'],
  ['paymentMethod', 'אמצעי תשלום'],
  ['business', 'תיאור'],
  ['amount', 'סכום'],
  ['category', 'נושא'],
]

/**
 * All-time, cross-month transaction search (#320/#322/#324) — separate from
 * the monthly budget-analysis tab by design (Agla 2026-08-23: "the page was
 * built as monthly budget... a different page for transaction search will
 * be better"). Loads every bank+credit transaction once; free-text search
 * and sort happen client-side on that full set.
 */
export default function TransactionSearchTab() {
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const { sortKey, sortDir, toggleSort, sortTransactions } = useTransactionSort('date', 'desc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    transactionStore.getAllBudgetTransactions().then((rows) => {
      if (!cancelled) {
        setTransactions(rows)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = transactions.filter(
    (t) => !t.isCreditCardCharge && matchesTransactionSearch(t, searchQuery)
  )
  const sorted = sortTransactions(filtered)

  return (
    <div>
      <p style={{ margin: '0 0 1rem', color: '#6b7280', fontSize: '0.875rem' }}>
        כל התנועות בבנק ובכרטיסי האשראי — כל החודשים, לפני ואחרי סיווג
      </p>

      <div style={{ position: 'relative', marginBottom: '1rem', maxWidth: '360px' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="חיפוש חופשי... (תיאור, נושא, תאריך, סכום)"
          autoFocus
          style={{
            padding: '0.5rem 0.75rem', paddingRight: '2rem', width: '100%',
            borderRadius: '0.375rem', border: `1px solid ${searchQuery ? '#a78bfa' : '#d1d5db'}`,
            fontSize: '0.875rem', background: searchQuery ? '#ede9fe' : 'white',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            title="נקה חיפוש"
            style={{
              position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.9rem', padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>טוען...</p>
      ) : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  {SORTABLE_COLS.map(([key, label]) => (
                    <th key={key} onClick={() => toggleSort(key)} style={{ cursor: 'pointer', userSelect: 'none' }} title="לחץ למיון">
                      {label}
                      {sortKey === key && <span style={{ marginInlineStart: '0.25rem', fontSize: '0.85em' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>{t.paymentMethod}</td>
                    <td>{t.business}</td>
                    <td
                      style={{
                        color: t.amount > 0 ? '#10b981' : '#ef4444',
                        fontWeight: 500,
                      }}
                    >
                      {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(t.amount)}
                    </td>
                    <td>{t.category || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && (
            <p style={{ color: '#6b7280', marginTop: '1rem' }}>לא נמצאו עסקאות תואמות.</p>
          )}
        </>
      )}
    </div>
  )
}
