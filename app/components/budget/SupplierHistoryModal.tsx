'use client'

import { useEffect, useMemo, useState } from 'react'
import Modal from '@/app/components/Modal'
import SubjectSelect from '@/app/components/budget/SubjectSelect'
import { transactionStore } from '@/app/stores/transactionStore'
import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'

type HouseholdMember = { uid: string; label: string }

type SupplierHistoryModalProps = {
  business: string
  categories: Category[]
  householdMembers: HouseholdMember[]
  onClose: () => void
  /** Fired after a category edit so the caller can refresh its own transaction list. */
  onCategoryChanged: () => void
}

export default function SupplierHistoryModal({
  business, categories, householdMembers, onClose, onCategoryChanged,
}: SupplierHistoryModalProps) {
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState<string>(String(new Date().getFullYear()))

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    transactionStore.getTransactionsByBusiness(business).then((rows) => {
      if (!cancelled) {
        setTransactions(rows)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [business])

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map((t) => (t.date || '').slice(0, 4)).filter(Boolean))
    years.add(String(new Date().getFullYear()))
    return Array.from(years).sort((a, b) => b.localeCompare(a))
  }, [transactions])

  const filtered = useMemo(
    () => (year === 'all' ? transactions : transactions.filter((t) => (t.date || '').startsWith(year))),
    [transactions, year]
  )

  const total = filtered.reduce((sum, t) => sum + t.amount, 0)

  const handleCategoryChange = async (transaction: BudgetTransaction, newCategory: string) => {
    setTransactions((prev) => prev.map((t) => (t.id === transaction.id ? { ...t, category: newCategory } : t)))
    await transactionStore.updateAny(transaction.id, { category: newCategory })
    await transactionStore.saveBusinessCategory(business, newCategory)
    onCategoryChanged()
  }

  return (
    <Modal isOpen onClose={onClose} maxWidth="900px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>{business}</h3>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
            }}
          >
            <option value="all">כל השנים</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>טוען...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>אין עסקאות בתקופה זו</p>
        ) : (
          <>
            <div style={{ maxHeight: '55vh', overflowY: 'auto' }} className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>תאריך</th>
                    <th>סכום</th>
                    <th>אמצעי תשלום</th>
                    <th>נושא</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td style={{ color: t.amount > 0 ? '#10b981' : '#ef4444', fontWeight: 500 }}>
                        {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(t.amount)}
                      </td>
                      <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>{t.paymentMethod}</td>
                      <td>
                        <SubjectSelect
                          value={t.category}
                          amount={t.amount}
                          categories={categories}
                          householdMembers={householdMembers}
                          onChange={(newCategory) => handleCategoryChange(t, newCategory)}
                          style={{
                            padding: '0.25rem',
                            borderRadius: '0.25rem',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem',
                            width: '100%',
                            direction: 'rtl',
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#374151' }}>
              <span>{filtered.length} עסקאות</span>
              <span style={{ fontWeight: 600 }}>
                סה"כ: {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(total)}
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
