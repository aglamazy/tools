'use client'

import React from 'react'
import type { Category } from '@/app/types/category'
import type { Partner as Participant } from '@/app/stores/partnerStore'

type Props = {
  categories: Category[]
  participants: Participant[]
  cashCategory: string
  setCashCategory: (v: string) => void
  cashPaidByUid: string
  setCashPaidByUid: (v: string) => void
  cashFile: File | null
  setCashFile: (f: File | null) => void
  cashSaving: boolean
  onSubmit: () => void
}

export default function ExpenseCashForm({
  categories, participants, cashCategory, setCashCategory, cashPaidByUid, setCashPaidByUid,
  cashFile, setCashFile, cashSaving, onSubmit,
}: Props) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
      <div>
        <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>נושא</label>
        <select value={cashCategory} onChange={e => setCashCategory(e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', direction: 'rtl', background: '#fff' }}>
          <option value="">בחר</option>
          {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      {participants.length > 1 && (
        <div>
          <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>שולם על ידי</label>
          <select value={cashPaidByUid} onChange={e => setCashPaidByUid(e.target.value)}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', direction: 'rtl', background: '#fff' }}>
            {participants.map(p => <option key={p.uid} value={p.uid}>{p.label}</option>)}
          </select>
        </div>
      )}
      <div>
        <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>קובץ</label>
        <label className="file-picker" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', borderRadius: '0.375rem' }}>
          <span>{cashFile ? cashFile.name : 'בחר קובץ'}</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" onChange={e => setCashFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      <button
        onClick={onSubmit}
        disabled={cashSaving || !cashFile}
        style={{
          padding: '0.5rem 1.25rem',
          borderRadius: '0.375rem',
          border: 'none',
          background: cashSaving || !cashFile ? '#93c5fd' : '#3b82f6',
          color: '#fff',
          cursor: cashSaving ? 'wait' : 'pointer',
          fontSize: '0.85rem',
          fontWeight: 500,
        }}
      >
        {cashSaving ? 'מחלץ נתונים...' : 'הוסף'}
      </button>
    </div>
  )
}
