'use client'

import { useState } from 'react'
import Modal from '@/app/components/Modal'
import { db, type Supplier } from '@/app/db/financeDB'

type SupplierCardModalProps = {
  supplier: Supplier
  onClose: () => void
  onSaved: (updated: Supplier) => void
}

/** Editable string-list field: chips with a remove button + an add row. */
function StringListEditor({
  values, onChange, placeholder,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const trimmed = draft.trim()
    if (!trimmed || values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, trimmed])
    setDraft('')
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
        {values.length === 0 && <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>אין עדיין</span>}
        {values.map((v) => (
          <div
            key={v}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.35rem 0.6rem', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: '0.375rem', fontSize: '0.8rem', direction: 'ltr', textAlign: 'right',
            }}
          >
            <span>{v}</span>
            <button
              onClick={() => onChange(values.filter((x) => x !== v))}
              style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem', padding: '0 0.3rem' }}
              title="הסר"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.8rem', direction: 'ltr', textAlign: 'right' }}
        />
        <button onClick={add} className="file-picker" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
          + הוסף
        </button>
      </div>
    </div>
  )
}

export default function SupplierCardModal({ supplier, onClose, onSaved }: SupplierCardModalProps) {
  const [name, setName] = useState(supplier.name)
  const [bankCardAliases, setBankCardAliases] = useState(supplier.bankCardAliases)
  const [emailSenders, setEmailSenders] = useState(supplier.emailSenders)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName || !supplier.id) return
    setSaving(true)
    try {
      await db.suppliers.update(supplier.id, {
        name: trimmedName,
        bankCardAliases,
        emailSenders,
      })
      onSaved({ ...supplier, name: trimmedName, bankCardAliases, emailSenders })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} maxWidth="500px">
      <div className="modal-header">
        <h2>עריכת ספק</h2>
      </div>
      <div className="modal-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem' }}>שם הספק</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem', direction: 'rtl' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem' }}>כינויים בבנק/כרטיס</label>
            <StringListEditor values={bankCardAliases} onChange={setBankCardAliases} placeholder="למשל: VERCEL INC." />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem' }}>כתובות מייל של שולח החשבונית</label>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 0, marginBottom: '0.4rem' }}>
              קביעת כתובת ידנית הופכת את חיפוש הקבלות לספק הזה למהיר וממוקד —
              חיפוש ישיר לפי שולח + תאריך, ללא צורך בניחוש.
            </p>
            <StringListEditor values={emailSenders} onChange={setEmailSenders} placeholder="למשל: no-reply@ypay.co.il" />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button onClick={onClose} className="upload-another-btn">ביטול</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} className="file-picker">
            {saving ? 'שומר…' : 'שמור'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
