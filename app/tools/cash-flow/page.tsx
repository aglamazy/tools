'use client'

import { useState, useEffect } from 'react'
import { formatMonthDisplay } from '@/app/utils/formatters'
import { transactionStore } from '@/app/stores/transactionStore'
import type { Transaction } from '@/app/types/transactions'

type CreditCardCharge = {
  cardNumber: string
  chargingDate: string
  totalAmount: number
}

export default function CashFlowPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [bankTransactions, setBankTransactions] = useState<Transaction[]>([])
  const [creditCharges, setCreditCharges] = useState<CreditCardCharge[]>([])
  const [loading, setLoading] = useState(true)

  // Load available months from imported files
  useEffect(() => {
    const filesData = transactionStore.getImportedFiles()
    if (filesData) {
      const months = Array.from(
        new Set<string>(
          filesData.files
            .map((f: any) => f.processingMonth)
            .filter((m: string | undefined): m is string => !!m)
        )
      ).sort((a, b) => {
        const [aMonth, aYear] = a.split('/').map(Number)
        const [bMonth, bYear] = b.split('/').map(Number)
        return bYear * 12 + bMonth - (aYear * 12 + aMonth)
      })

      setAvailableMonths(months)
      if (months.length > 0 && !selectedMonth) {
        setSelectedMonth(months[0] as string) // Select newest month by default
      }
    }
    setLoading(false)
  }, [selectedMonth])

  // Load transactions data from old storage (temporary - will move to import-based loading)
  useEffect(() => {
    if (!selectedMonth) return

    const data = transactionStore.getData()
    if (data) {

      // Filter bank transactions for selected month
      const monthTransactions = data.transactions.filter((t: Transaction) => {
        const transactionMonth = t.date.substring(3) // Extract MM/YYYY from DD/MM/YYYY
        return transactionMonth === selectedMonth
      })

      setBankTransactions(monthTransactions)

      // Calculate credit card charges for the selected month
      // Only show charges that haven't appeared in bank transactions yet
      const creditData = data.creditCardData || []

      console.log('=== Cash Flow Debug ===')
      console.log('Selected month:', selectedMonth)
      console.log('Month transactions:', monthTransactions)

      // Create a set of card numbers that have been paid (appear in bank transactions)
      const paidCardNumbers = new Set<string>()
      monthTransactions.forEach((t: Transaction) => {
        console.log('Checking transaction:', t.description, 'isCreditCardCharge:', t.isCreditCardCharge)
        if (t.isCreditCardCharge) {
          // Extract card number from description (e.g., "1473 - ישראכרט בע"מ")
          const match = t.description.match(/^(\d+) -/)
          console.log('Card number match:', match)
          if (match) {
            paidCardNumbers.add(match[1])
            console.log('Added paid card number:', match[1])
          }
        }
      })

      console.log('Paid card numbers:', Array.from(paidCardNumbers))
      console.log('Credit card data:', creditData)

      const chargesByCard = new Map<string, { totalAmount: number; chargingDate: string }>()

      creditData.forEach((cc: any) => {
        console.log('Processing card:', cc.cardNumber)
        cc.payments.forEach((payment: any) => {
          if (!payment.chargingDate) return

          const chargingMonth = payment.chargingDate.substring(3) // Extract MM/YYYY

          // Include charges that are scheduled for the selected month
          if (chargingMonth === selectedMonth) {
            console.log('Card', cc.cardNumber, 'has charging date in', selectedMonth)
            // Calculate total amount for this card
            const cardTotal = cc.payments
              .filter((p: any) => p.chargingDate?.substring(3) === selectedMonth)
              .reduce((sum: number, p: any) => sum + p.amount, 0)

            console.log('Card', cc.cardNumber, 'total amount:', cardTotal, 'isPaid:', paidCardNumbers.has(cc.cardNumber))

            // Only include if this card hasn't been paid yet (not in bank transactions)
            if (!paidCardNumbers.has(cc.cardNumber)) {
              const key = cc.cardNumber
              if (!chargesByCard.has(key)) {
                chargesByCard.set(key, {
                  totalAmount: cardTotal,
                  chargingDate: payment.chargingDate.substring(0, 10) // Keep full date DD/MM/YYYY
                })
                console.log('Added to credit charges:', cc.cardNumber)
              }
            }
          }
        })
      })

      console.log('Final credit charges:', Array.from(chargesByCard.entries()))

      const charges: CreditCardCharge[] = Array.from(chargesByCard.entries()).map(
        ([cardNumber, { totalAmount, chargingDate }]) => ({
          cardNumber,
          chargingDate,
          totalAmount,
        })
      )

      setCreditCharges(charges)
    }
  }, [selectedMonth])

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header>
          <h1>ניתוח תזרים מזומנים</h1>
          <p>מעקב אחר תנועות כסף בפועל - מתי הכסף עזב או נכנס לחשבון</p>
        </header>

        {/* Month Selector */}
        {availableMonths.length > 0 && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
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
        )}

        {availableMonths.length === 0 && (
          <div className="banner" style={{ marginTop: '1rem' }}>
            לא נמצאו קבצים מיובאים. עבור לעמוד "ייבוא קבצים" כדי להתחיל.
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
                    (bankTransactions.reduce((sum, t) => sum + t.amount, 0) +
                      creditCharges.reduce((sum, c) => sum + c.totalAmount, 0) >
                    0
                      ? 'positive'
                      : 'negative')
                  }
                >
                  {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
                    bankTransactions.reduce((sum, t) => sum + t.amount, 0) +
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
                    </tr>
                  </thead>
                  <tbody>
                    {bankTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
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
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Credit Card Charges */}
            {creditCharges.length > 0 && (
              <section style={{ marginTop: '2rem' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
                  חיובי כרטיסי אשראי
                </h2>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                  חיובים שמתוכננים לחודש זה (ייתכן שטרם חויבו בפועל)
                </p>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>כרטיס</th>
                        <th>תאריך חיוב</th>
                        <th>סכום</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditCharges.map((charge, index) => (
                        <tr key={index}>
                          <td>💳 {charge.cardNumber}</td>
                          <td>{charge.chargingDate}</td>
                          <td
                            style={{
                              color: '#ef4444',
                              fontWeight: 500,
                            }}
                          >
                            {new Intl.NumberFormat('he-IL', {
                              style: 'currency',
                              currency: 'ILS',
                            }).format(charge.totalAmount)}
                          </td>
                        </tr>
                      ))}
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
