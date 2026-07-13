'use client'

import { useState, type CSSProperties } from 'react'
import Modal from '@/app/components/Modal'
import { db, type Transaction } from '@/app/db/financeDB'
import { normalizeDate } from '@/app/utils/parsers/shared'
import type { Participant } from '@/app/stores/partnerStore'

type TransactionEditModalProps = {
  transaction: Transaction
  categoryOptions: string[]
  participants: Participant[]
  onClose: () => void
  onSaved: (updated: Transaction) => void
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.375rem',
  border: '1px solid #d1d5db', fontSize: '0.875rem', direction: 'rtl',
}
const labelStyle: CSSProperties = {
  display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem',
}

export default function TransactionEditModal({ transaction, categoryOptions, participants, onClose, onSaved }: TransactionEditModalProps) {
  const [description, setDescription] = useState(transaction.description || '')
  const [merchant, setMerchant] = useState(transaction.merchant || '')
  const [amount, setAmount] = useState(String(transaction.amount))
  const [date, setDate] = useState(normalizeDate(transaction.date) || transaction.date)
  const [category, setCategory] = useState(transaction.category || '')
  const [paidByUid, setPaidByUid] = useState(transaction.paidByUid || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!transaction.id) return
    const parsedAmount = parseFloat(amount)
    setSaving(true)
    try {
      const updates: Partial<Transaction> = {
        description: description.trim(),
        merchant: merchant.trim() || undefined,
        amount: isNaN(parsedAmount) ? transaction.amount : parsedAmount,
        date,
        category: category || undefined,
        paidByUid: paidByUid || undefined,
        updatedAt: new Date().toISOString(),
      }
      await db.transactions.update(transaction.id, updates)
      onSaved({ ...transaction, ...updates })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} maxWidth="480px">
      <div className="modal-header">
        <h2>עריכת תנועה</h2>
      </div>
      <div className="modal-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>תיאור</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ספק / בית עסק</label>
            <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>סכום</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>תאריך</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>נושא</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {participants.length > 0 && (
            <div>
              <label style={labelStyle}>שולם על ידי</label>
              <select value={paidByUid} onChange={(e) => setPaidByUid(e.target.value)} style={inputStyle}>
                <option value="">אוטומטי (לפי שיוך חשבון/כרטיס בהגדרות)</option>
                {participants.map((p) => <option key={p.uid} value={p.uid}>{p.label}</option>)}
              </select>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                קביעה מפורשת כאן גוברת על שיוך אוטומטי לפי מספר חשבון/כרטיס — משמש כשתנועה משויכת בטעות לאדם הלא נכון.
              </p>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button onClick={onClose} className="upload-another-btn">ביטול</button>
          <button onClick={handleSave} disabled={saving || !description.trim()} className="file-picker">
            {saving ? 'שומר…' : 'שמור'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
