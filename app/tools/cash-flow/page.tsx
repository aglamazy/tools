'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatMonthDisplay, addMonths } from '@/app/utils/formatters'
import { transactionStore } from '@/app/stores/transactionStore'
import type { Transaction } from '@/app/db/financeDB'
import * as XLSX from 'xlsx'

type CreditCardCharge = {
  cardNumber: string
  chargingDate: string
  totalAmount: number
}

type ExpectedFixed = {
  business: string
  amount: number
  category: string
  date: string
}

export default function CashFlowPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [bankTransactions, setBankTransactions] = useState<Transaction[]>([])
  const [creditCharges, setCreditCharges] = useState<CreditCardCharge[]>([])
  const [expectedFixed, setExpectedFixed] = useState<ExpectedFixed[]>([])
  const [openingBalance, setOpeningBalance] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  // Load available months from transactions
  useEffect(() => {
    const loadMonths = async () => {
      const months = await transactionStore.getAvailableMonths()

      setAvailableMonths(months)
      if (months.length > 0 && !selectedMonth) {
        // Try to restore from sessionStorage
        const savedMonth = sessionStorage.getItem('selectedMonth')
        if (savedMonth && months.includes(savedMonth)) {
          setSelectedMonth(savedMonth)
        } else {
          setSelectedMonth(months[0]) // Select newest month by default
        }
      }
      setLoading(false)
    }
    loadMonths()
  }, [selectedMonth])

  // Save selected month to sessionStorage when it changes
  useEffect(() => {
    if (selectedMonth) {
      sessionStorage.setItem('selectedMonth', selectedMonth)
    }
  }, [selectedMonth])

  // Load cash flow data
  useEffect(() => {
    if (!selectedMonth) return

    const loadCashFlow = async () => {
      const cashFlowData = await transactionStore.getCashFlowData(selectedMonth)
      setOpeningBalance(cashFlowData.openingBalance)
      setBankTransactions(cashFlowData.transactions)
      setCreditCharges(cashFlowData.creditCharges)
      setExpectedFixed(cashFlowData.expectedFixed)
    }
    loadCashFlow()
  }, [selectedMonth])

  const handleDownloadExcel = () => {
    if (!selectedMonth) return

    // Prepare bank transactions data
    const bankData = bankTransactions.map(t => ({
      'תאריך': t.date,
      'תיאור': t.description,
      'סכום': t.amount,
      'יתרה': t.balance
    }))

    // Prepare credit card charges data
    const creditData = creditCharges.map(c => ({
      'כרטיס': c.cardNumber,
      'תאריך חיוב': c.chargingDate,
      'סכום': -c.totalAmount
    }))

    // Create workbook
    const wb = XLSX.utils.book_new()

    // Add bank transactions sheet
    const wsBank = XLSX.utils.json_to_sheet(bankData)
    XLSX.utils.book_append_sheet(wb, wsBank, 'עסקאות בנק')

    // Add credit charges sheet if there are any
    if (creditData.length > 0) {
      const wsCredit = XLSX.utils.json_to_sheet(creditData)
      XLSX.utils.book_append_sheet(wb, wsCredit, 'חיובי כרטיסי אשראי')
    }

    // Download
    const monthName = formatMonthDisplay(selectedMonth)
    XLSX.writeFile(wb, `תזרים_מזומנים_${monthName}.xlsx`)
  }

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header>
          <h1>ניתוח תזרים מזומנים</h1>
          <p>מעקב אחר תנועות כסף בפועל - מתי הכסף עזב או נכנס לחשבון</p>
        </header>

        {/* Month Selector */}
        {availableMonths.length > 0 && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div>
              <label htmlFor="month-select" style={{ marginLeft: '0.5rem', fontWeight: 500 }}>
                בחר חודש:
              </label>
              <select
                id="month-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  padding: '0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  minWidth: '200px',
                }}
              >
                {availableMonths.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthDisplay(month)}
                  </option>
                ))}
              </select>
            </div>
            {selectedMonth && (
              <button
                onClick={handleDownloadExcel}
                className="upload-another-btn"
                style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.875rem' }}
              >
                📥 ייצוא ל-Excel
              </button>
            )}
          </div>
        )}

        {availableMonths.length === 0 && (
          <div className="banner" style={{ marginTop: '1rem' }}>
            לא נמצאו עסקאות במאגר. עבור לעמוד "ייבוא קבצים" כדי להתחיל.
          </div>
        )}

        {selectedMonth && !loading && (
          <>
            {/* Summary Cards */}
            <section className="summary-grid" style={{ marginTop: '2rem' }}>
              <div className="summary-card income">
                <div className="summary-label">הכנסות</div>
                <div className="summary-amount">
                  {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                    bankTransactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
                  )}
                </div>
                <div className="summary-count">{bankTransactions.filter((t) => t.amount > 0).length} עסקאות</div>
              </div>
              <div className="summary-card expenses">
                <div className="summary-label">הוצאות</div>
                <div className="summary-amount">
                  {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                    Math.abs(
                      bankTransactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0) +
                        creditCharges.reduce((sum, c) => sum + c.totalAmount, 0)
                    )
                  )}
                </div>
                <div className="summary-count">
                  {bankTransactions.filter((t) => t.amount < 0).length + creditCharges.length} עסקאות
                </div>
              </div>
              <div className="summary-card net">
                <div className="summary-label">מאזן</div>
                <div
                  className={
                    'summary-amount ' +
                    (bankTransactions.reduce((sum, t) => sum + t.amount, 0) -
                      creditCharges.reduce((sum, c) => sum + c.totalAmount, 0) >
                    0
                      ? 'positive'
                      : 'negative')
                  }
                >
                  {new Intl.NumberFormat('he-IL', {
                    style: 'currency',
                    currency: 'ILS',
                    signDisplay: 'auto'
                  }).format(
                    bankTransactions.reduce((sum, t) => sum + t.amount, 0) -
                      creditCharges.reduce((sum, c) => sum + c.totalAmount, 0)
                  )}
                </div>
              </div>
            </section>

            {/* Bank Transactions */}
            <section style={{ marginTop: '2rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
                עסקאות בנק
              </h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>תאריך</th>
                      <th>תיאור</th>
                      <th>סכום</th>
                      <th>יתרה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening balance row */}
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <td style={{ fontStyle: 'italic', color: '#6b7280' }}>
                        {addMonths(selectedMonth, -1)}
                      </td>
                      <td style={{ fontStyle: 'italic', color: '#6b7280' }}>יתרת פתיחה</td>
                      <td></td>
                      <td style={{ fontWeight: 500 }}>
                        {new Intl.NumberFormat('he-IL', {
                          style: 'currency',
                          currency: 'ILS',
                        }).format(openingBalance)}
                      </td>
                    </tr>

                    {bankTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                          אין עסקאות בנק עבור חודש זה
                        </td>
                      </tr>
                    ) : (
                      bankTransactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td>{transaction.date}</td>
                          <td>{transaction.description}</td>
                          <td
                            style={{
                              color: transaction.amount > 0 ? '#10b981' : '#ef4444',
                              fontWeight: 500,
                            }}
                          >
                            {new Intl.NumberFormat('he-IL', {
                              style: 'currency',
                              currency: 'ILS',
                            }).format(transaction.amount)}
                          </td>
                          <td
                            style={{
                              fontWeight: 500,
                            }}
                          >
                          {new Intl.NumberFormat('he-IL', {
                            style: 'currency',
                            currency: 'ILS',
                          }).format(transaction.balance ?? 0)}
                        </td>
                      </tr>
                    ))
                  )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Future Forecast */}
            {(creditCharges.length > 0 || expectedFixed.length > 0) && (
              <section style={{ marginTop: '2rem' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
                  תחזית (תנועות שטרם בוצעו)
                </h2>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>תאריך</th>
                        <th>תיאור</th>
                        <th>סכום</th>
                        <th>יתרה צפויה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const lastBalance = bankTransactions.length > 0
                          ? bankTransactions[bankTransactions.length - 1].balance ?? openingBalance
                          : openingBalance
                        let runningBalance: number = lastBalance ?? 0

                        // Combine credit charges and expected fixed into single array
                        const allExpected = [
                          ...creditCharges.map(c => ({
                            date: c.chargingDate,
                            description: `💳 ${c.cardNumber}`,
                            amount: -(c.totalAmount ?? 0),
                          })),
                          ...expectedFixed.map(f => {
                            // Extract day from previous month's date (DD/MM/YYYY)
                            const day = f.date ? f.date.split('/')[0] : '01'
                            const fullDate = `${day}/${selectedMonth}` // DD/MM/YYYY
                            return {
                              date: fullDate,
                              description: `${f.business} (${f.category})`,
                              amount: f.amount,
                            }
                          }),
                        ]

                        // Sort by date (DD/MM/YYYY format)
                        allExpected.sort((a, b) => {
                          const [aDay, aMonth, aYear] = a.date.split('/').map(Number)
                          const [bDay, bMonth, bYear] = b.date.split('/').map(Number)

                          const aDate = new Date(aYear, aMonth - 1, aDay)
                          const bDate = new Date(bYear, bMonth - 1, bDay)

                          return aDate.getTime() - bDate.getTime()
                        })

                        return allExpected.map((item, index) => {
                          runningBalance += item.amount

                          return (
                            <tr key={index}>
                              <td>{item.date}</td>
                              <td>{item.description}</td>
                              <td
                                style={{
                                  color: item.amount > 0 ? '#10b981' : '#ef4444',
                                  fontWeight: 500,
                                }}
                              >
                                {new Intl.NumberFormat('he-IL', {
                                  style: 'currency',
                                  currency: 'ILS',
                                }).format(item.amount)}
                              </td>
                              <td style={{ fontWeight: 500 }}>
                                {new Intl.NumberFormat('he-IL', {
                                  style: 'currency',
                                  currency: 'ILS',
                                }).format(runningBalance)}
                              </td>
                            </tr>
                          )
                        })
                      })()}
                      {/* Expected closing balance */}
                      <tr style={{ backgroundColor: '#f9fafb', fontWeight: 600, borderTop: '2px solid #d1d5db' }}>
                        <td colSpan={3} style={{ textAlign: 'left' }}>יתרה צפויה לסגירת החודש</td>
                        <td style={{ fontWeight: 600 }}>
                          {new Intl.NumberFormat('he-IL', {
                            style: 'currency',
                            currency: 'ILS',
                          }).format(
                            (bankTransactions.length > 0
                              ? bankTransactions[bankTransactions.length - 1].balance ?? openingBalance
                              : openingBalance) -
                              creditCharges.reduce((sum, c) => sum + (c.totalAmount ?? 0), 0) +
                              expectedFixed.reduce((sum, f) => sum + (f.amount ?? 0), 0)
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
