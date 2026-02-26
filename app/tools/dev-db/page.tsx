'use client'

import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { db, type Transaction } from '@/app/db/financeDB'
import { config } from '@/app/config'
import DedupSection from '@/app/components/settings/sync/DedupSection'

type Grouped = {
  fileId: string
  transactions: Transaction[]
}

export default function DevDbPage() {
  if (!config.developerMode) notFound()

  const [data, setData] = useState<Grouped[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const txns = await db.transactions.toArray()
        const byFile = new Map<string, Transaction[]>()
        txns.forEach((t) => {
          const key = t.fileId || 'unknown'
          const list = byFile.get(key) || []
          list.push(t)
          byFile.set(key, list)
        })
        const grouped: Grouped[] = Array.from(byFile.entries()).map(([fileId, transactions]) => ({
          fileId,
          transactions,
        }))
        setData(grouped)
      } catch (err: any) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <h1>Dev DB</h1>

        <DedupSection />

        <section style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.75rem' }}>Transactions (IndexedDB)</h2>

          {loading && <div className="banner">טוען...</div>}
          {error && <div className="banner error">שגיאה: {error}</div>}

          {!loading && !error && (
            <div className="table-wrapper">
              {data.length === 0 && <div className="banner">אין רשומות בטבלה.</div>}
              {data.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {data.map((group) => (
                    <details key={group.fileId} open>
                      <summary style={{ fontWeight: 600, cursor: 'pointer' }}>
                        {group.fileId} ({group.transactions.length})
                      </summary>
                      <div style={{ marginTop: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
                        <pre style={{ margin: 0, padding: '0.75rem', overflowX: 'auto', background: '#f8fafc' }}>
                          {JSON.stringify(group.transactions, null, 2)}
                        </pre>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
