'use client'

import React, { useState, useEffect } from 'react'
import { capitalStore } from '@/app/stores/capitalStore'
import type { CapitalEntry } from '@/app/db/financeDB'
import type { PortfolioSnapshot } from '@/app/types/capital'
import { formatCurrency } from '@/app/utils/formatters'

export default function CapitalPage() {
  const [asOfDate, setAsOfDate] = useState<string>('')
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null)
  const [allEntries, setAllEntries] = useState<CapitalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'current' | 'all'>('current')

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      const entries = await capitalStore.getAll()
      setAllEntries(entries)

      // Set default date to today
      const today = new Date()
      const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
      setAsOfDate(todayStr)

      setLoading(false)
    }
    loadData()
  }, [])

  // Load portfolio when date changes
  useEffect(() => {
    if (!asOfDate) return

    const loadPortfolio = async () => {
      const snapshot = await capitalStore.getAsOfDate(asOfDate)
      setPortfolio(snapshot)
    }
    loadPortfolio()
  }, [asOfDate])

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value // YYYY-MM-DD from input
    if (!value) return

    // Convert to DD/MM/YYYY
    const [year, month, day] = value.split('-')
    setAsOfDate(`${day}/${month}/${year}`)
  }

  // Convert DD/MM/YYYY to YYYY-MM-DD for input
  const dateForInput = asOfDate
    ? (() => {
        const [day, month, year] = asOfDate.split('/')
        return `${year}-${month}-${day}`
      })()
    : ''

  if (loading) {
    return (
      <main className="app" dir="rtl">
        <div className="card">
          <p>טוען...</p>
        </div>
      </main>
    )
  }

  const activeHoldings = portfolio?.holdings.filter((h) => !h.soldDate) || []
  const soldHoldings = allEntries.filter((e) => e.soldDate)

  // Get unique sold holdings
  const soldHoldingsMap = new Map<string, CapitalEntry>()
  soldHoldings.forEach((h) => {
    const key = `${h.institution}|${h.accountNumber || ''}|${h.description}`
    const existing = soldHoldingsMap.get(key)
    if (!existing || h.soldDate! > existing.soldDate!) {
      soldHoldingsMap.set(key, h)
    }
  })
  const uniqueSoldHoldings = Array.from(soldHoldingsMap.values())

  return (
    <main className="app" dir="rtl">
      {allEntries.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: '#64748b' }}>
            עדיין אין רשומות הון. ייבא קובץ Excel או הוסף רשומות באופן ידני.
          </p>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label htmlFor="asOfDate" style={{ marginLeft: '0.5rem' }}>
                  הצג נכסים נכון ל:
                </label>
                <input
                  type="date"
                  id="asOfDate"
                  value={dateForInput}
                  onChange={handleDateChange}
                  style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setViewMode('current')}
                  className={viewMode === 'current' ? 'button-primary' : 'button-secondary'}
                >
                  נכסים פעילים
                </button>
                <button
                  onClick={() => setViewMode('all')}
                  className={viewMode === 'all' ? 'button-primary' : 'button-secondary'}
                >
                  כל הרשומות
                </button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          {viewMode === 'current' && portfolio && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {(Object.keys(portfolio.totalsByCurrency) as Array<'ILS' | 'USD' | 'EUR'>).map((curr) => {
                const total = portfolio.totalsByCurrency[curr]
                if (total === 0) return null
                return (
                  <div key={curr} className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem' }}>
                      סה"כ {curr}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                      {formatCurrency(total, curr)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Active Holdings Table */}
          {viewMode === 'current' && (
            <div className="card">
              <h2 style={{ margin: '0 0 1rem 0' }}>
                נכסים פעילים ({activeHoldings.length})
              </h2>
              {activeHoldings.length === 0 ? (
                <p style={{ color: '#64748b' }}>אין נכסים פעילים בתאריך זה</p>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>תאריך</th>
                        <th>סוג נכס</th>
                        <th>מוסד</th>
                        <th>מספר חשבון</th>
                        <th>תיאור</th>
                        <th>מעסיק</th>
                        <th>מסלול השקעה</th>
                        <th>סוכן</th>
                        <th>סכום</th>
                        <th>מטבע</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeHoldings.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.date}</td>
                          <td>{entry.assetType}</td>
                          <td>{entry.institution}</td>
                          <td>{entry.accountNumber || '-'}</td>
                          <td>{entry.description}</td>
                          <td>{entry.employer || '-'}</td>
                          <td>{entry.investmentTrack || '-'}</td>
                          <td>{entry.agent || '-'}</td>
                          <td className="amount-positive">{formatCurrency(entry.amount, entry.currency)}</td>
                          <td>{entry.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sold Holdings Section */}
              {uniqueSoldHoldings.length > 0 && (
                <>
                  <h2 style={{ margin: '2rem 0 1rem 0' }}>
                    נכסים שנמכרו ({uniqueSoldHoldings.length})
                  </h2>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>תאריך מכירה</th>
                          <th>סוג נכס</th>
                          <th>מוסד</th>
                          <th>מספר חשבון</th>
                          <th>תיאור</th>
                          <th>מעסיק</th>
                          <th>מסלול השקעה</th>
                          <th>סוכן</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueSoldHoldings.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.soldDate}</td>
                            <td>{entry.assetType}</td>
                            <td>{entry.institution}</td>
                            <td>{entry.accountNumber || '-'}</td>
                            <td>{entry.description}</td>
                            <td>{entry.employer || '-'}</td>
                            <td>{entry.investmentTrack || '-'}</td>
                            <td>{entry.agent || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* All Entries Table */}
          {viewMode === 'all' && (
            <div className="card">
              <h2 style={{ margin: '0 0 1rem 0' }}>
                כל הרשומות ({allEntries.length})
              </h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>תאריך</th>
                      <th>סוג נכס</th>
                      <th>מוסד</th>
                      <th>מספר חשבון</th>
                      <th>תיאור</th>
                      <th>מעסיק</th>
                      <th>מסלול השקעה</th>
                      <th>סוכן</th>
                      <th>סכום</th>
                      <th>מטבע</th>
                      <th>תאריך מכירה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.date}</td>
                        <td>{entry.assetType}</td>
                        <td>{entry.institution}</td>
                        <td>{entry.accountNumber || '-'}</td>
                        <td>{entry.description}</td>
                        <td>{entry.employer || '-'}</td>
                        <td>{entry.investmentTrack || '-'}</td>
                        <td>{entry.agent || '-'}</td>
                        <td className="amount-positive">{formatCurrency(entry.amount, entry.currency)}</td>
                        <td>{entry.currency}</td>
                        <td>{entry.soldDate || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
