'use client'

import React, { useEffect, useState } from 'react'
import { db, type Transaction, type Business } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { businessStore } from '@/app/stores/businessStore'
import type { Category } from '@/app/types/category'

type ExpenseTabProps = {
  businessId: number
}

export default function ExpenseTab({ businessId }: ExpenseTabProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [filterMode, setFilterMode] = useState<'month' | 'year' | 'all'>('month')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBusiness()
  }, [businessId])

  useEffect(() => {
    if (business && (selectedMonth || filterMode !== 'month')) {
      loadTransactions()
    }
  }, [selectedMonth, selectedYear, filterMode, business])

  const loadBusiness = async () => {
    const b = await businessStore.getById(businessId)
    setBusiness(b || null)
    if (b) {
      await loadAvailableMonths()
    }
    setLoading(false)
  }

  const loadAvailableMonths = async () => {
    const categories = subjectStore.getAll().filter(
      (c: Category) => c.type === 'expense' && c.businessId === businessId
    )
    if (categories.length === 0) {
      setAvailableMonths([])
      return
    }

    const categoryNames = categories.map(c => c.name)

    const allTransactions = await db.transactions.toArray()
    const matchingTransactions = allTransactions.filter(
      t => t.category && categoryNames.includes(t.category) && t.amount < 0
    )

    const months = [...new Set(matchingTransactions.map(t => t.month))].sort((a, b) => {
      const [aMonth, aYear] = a.split('/')
      const [bMonth, bYear] = b.split('/')
      return Number(bYear) - Number(aYear) || Number(bMonth) - Number(aMonth)
    })

    setAvailableMonths(months)
    if (months.length > 0 && !selectedMonth) {
      setSelectedMonth(months[0])
    }
  }

  const loadTransactions = async () => {
    const categories = subjectStore.getAll().filter(
      (c: Category) => c.type === 'expense' && c.businessId === businessId
    )
    const categoryNames = categories.map(c => c.name)

    let filteredTransactions: Transaction[]

    if (filterMode === 'all') {
      const allTransactions = await db.transactions.toArray()
      filteredTransactions = allTransactions
    } else if (filterMode === 'year') {
      const allTransactions = await db.transactions.toArray()
      filteredTransactions = allTransactions.filter(t => t.month.endsWith('/' + selectedYear))
    } else {
      filteredTransactions = await db.transactions
        .where('month')
        .equals(selectedMonth)
        .toArray()
    }

    const expenseTransactions = filteredTransactions.filter(
      t => t.category && categoryNames.includes(t.category) && t.amount < 0
    )

    // Sort by date
    expenseTransactions.sort((a, b) => {
      const [aD, aM, aY] = a.date.split('/')
      const [bD, bM, bY] = b.date.split('/')
      return new Date(`${aY}-${aM}-${aD}`).getTime() - new Date(`${bY}-${bM}-${bD}`).getTime()
    })

    setTransactions(expenseTransactions)
  }

  const getMonthTotal = () => {
    return transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }

  if (loading) {
    return <p>טוען...</p>
  }

  if (!business) {
    return <p>עסק לא נמצא</p>
  }

  const categories = subjectStore.getAll().filter(
    (c: Category) => c.type === 'expense' && c.businessId === businessId
  )

  if (categories.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        <p>אין נושאי הוצאה משויכים לעסק זה.</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          ניתן לשייך נושאי הוצאה בהגדרות → נושאים
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filter selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 600 }}>תקופה:</label>
        <select
          value={filterMode}
          onChange={(e) => {
            const mode = e.target.value as 'month' | 'year' | 'all'
            setFilterMode(mode)
            if (mode === 'year' && !selectedYear) {
              const years = [...new Set(availableMonths.map(m => m.split('/')[1]))].sort((a, b) => Number(b) - Number(a))
              if (years.length > 0) setSelectedYear(years[0])
            }
          }}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: '1px solid #e2e8f0',
            fontSize: '1rem',
            direction: 'rtl',
          }}
        >
          <option value="month">חודש</option>
          <option value="year">שנה</option>
          <option value="all">הכל</option>
        </select>
        {filterMode === 'month' && (
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #e2e8f0',
              fontSize: '1rem',
              direction: 'rtl',
            }}
          >
            {availableMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        {filterMode === 'year' && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #e2e8f0',
              fontSize: '1rem',
              direction: 'rtl',
            }}
          >
            {[...new Set(availableMonths.map(m => m.split('/')[1]))].sort((a, b) => Number(b) - Number(a)).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
        {transactions.length > 0 && (
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
            סה"כ: ₪{getMonthTotal().toLocaleString()}
          </span>
        )}
      </div>

      {/* Transactions table */}
      {transactions.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
          אין הוצאות בתקופה זו
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>תאריך</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>תיאור</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>נושא</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>סכום</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{t.date}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{t.description}</td>
                  <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{t.category}</td>
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 500, color: '#dc2626' }}>
                    ₪{Math.abs(t.amount).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
