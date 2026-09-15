'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import Modal from '@/app/components/Modal'
import { db, type Supplier } from '@/app/db/financeDB'
import { bindSupplierToExisting } from '@/app/services/supplierService'

type SupplierCardModalProps = {
  supplier: Supplier
  onClose: () => void
  onSaved: (updated: Supplier) => void
}

export type StringListEditorHandle = { flush: () => string[] }

function commitDraft(values: string[], draft: string): string[] {
  const trimmed = draft.trim()
  if (!trimmed || values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return values
  return [...values, trimmed]
}

/**
 * Editable string-list field: chips with a remove button + an add row.
 * Exposes flush() so the parent's Save button can commit whatever's still
 * sitting in the input box — without it, clicking "שמור" right after typing
 * (instead of clicking "+ הוסף" first) silently dropped the typed value.
 */
const StringListEditor = forwardRef<StringListEditorHandle, {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
}>(function StringListEditor({ values, onChange, placeholder }, ref) {
  const [draft, setDraft] = useState('')

  const add = () => {
    onChange(commitDraft(values, draft))
    setDraft('')
  }

  useImperativeHandle(ref, () => ({
    flush: () => commitDraft(values, draft),
  }))

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
})

export default function SupplierCardModal({ supplier, onClose, onSaved }: SupplierCardModalProps) {
  const [name, setName] = useState(supplier.name)
  const [bankCardAliases, setBankCardAliases] = useState(supplier.bankCardAliases)
  const [emailSenders, setEmailSenders] = useState(supplier.emailSenders)
  const [saving, setSaving] = useState(false)
  const aliasesRef = useRef<StringListEditorHandle>(null)
  const sendersRef = useRef<StringListEditorHandle>(null)
  const isUseful = supplier.emailSenders.length > 0

  // Agla, 2026-09-15: a supplier with no email sender yet is often really the
  // same vendor as one that already has a working sender (e.g. "סלקום" vs
  // "סלקום ישראל בע"מ") — let the user bind THIS transaction's vendor to the
  // existing one instead of hand-filling a sender that's already known.
  const [otherSuppliers, setOtherSuppliers] = useState<Supplier[]>([])
  const [bindQuery, setBindQuery] = useState('')
  const [bindTargetId, setBindTargetId] = useState<number | null>(null)
  const [binding, setBinding] = useState(false)

  useEffect(() => {
    if (isUseful) return
    db.suppliers.toArray().then((rows) => {
      setOtherSuppliers(rows.filter((s) => s.id !== supplier.id && s.emailSenders.length > 0))
    })
  }, [isUseful, supplier.id])

  const bindSuggestions = useMemo(() => {
    const q = bindQuery.trim().toLowerCase()
    if (!q) return []
    return otherSuppliers.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8)
  }, [otherSuppliers, bindQuery])

  const handleBind = async () => {
    if (!bindTargetId || !supplier.id) return
    setBinding(true)
    try {
      const merged = await bindSupplierToExisting(supplier.id, bindTargetId)
      onSaved(merged)
      onClose()
    } finally {
      setBinding(false)
    }
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName || !supplier.id) return
    const finalAliases = aliasesRef.current?.flush() ?? bankCardAliases
    const finalSenders = sendersRef.current?.flush() ?? emailSenders
    setSaving(true)
    try {
      await db.suppliers.update(supplier.id, {
        name: trimmedName,
        bankCardAliases: finalAliases,
        emailSenders: finalSenders,
      })
      onSaved({ ...supplier, name: trimmedName, bankCardAliases: finalAliases, emailSenders: finalSenders })
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
            <StringListEditor ref={aliasesRef} values={bankCardAliases} onChange={setBankCardAliases} placeholder="למשל: VERCEL INC." />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem' }}>
              כתובות מייל של שולח החשבונית
              {isUseful && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.1rem 0.5rem',
                  background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '999px',
                  fontSize: '0.7rem', fontWeight: 600,
                }}>
                  ✓ יעיל לחיפוש קבלות
                </span>
              )}
            </label>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 0, marginBottom: '0.4rem' }}>
              קביעת כתובת ידנית הופכת את חיפוש הקבלות לספק הזה למהיר וממוקד —
              חיפוש ישיר לפי שולח + תאריך, ללא צורך בניחוש.
            </p>
            <StringListEditor ref={sendersRef} values={emailSenders} onChange={setEmailSenders} placeholder="למשל: no-reply@ypay.co.il" />
          </div>

          {!isUseful && otherSuppliers.length > 0 && (
            <div style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem' }}>
                או קשר תנועה זו לספק קיים
              </label>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 0, marginBottom: '0.4rem' }}>
                אם זה בעצם אותו ספק שכבר מוגדר עם כתובת מייל פעילה, קשר במקום למלא ידנית.
              </p>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={bindQuery}
                  onChange={(e) => { setBindQuery(e.target.value); setBindTargetId(null) }}
                  placeholder="חפש ספק קיים לפי שם…"
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem', direction: 'rtl' }}
                />
                {bindSuggestions.length > 0 && bindTargetId === null && (
                  <div style={{
                    position: 'absolute', zIndex: 10, top: '100%', right: 0, left: 0, marginTop: '0.25rem',
                    background: '#fff', border: '1px solid #d1d5db', borderRadius: '0.375rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '160px', overflowY: 'auto',
                  }}>
                    {bindSuggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setBindTargetId(s.id!); setBindQuery(s.name) }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'right', padding: '0.5rem 0.75rem',
                          border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem',
                        }}
                      >
                        {s.name} <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>({s.emailSenders[0]})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleBind}
                disabled={!bindTargetId || binding}
                className="file-picker"
                style={{ marginTop: '0.5rem', padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
              >
                {binding ? 'מקשר…' : 'קשר'}
              </button>
            </div>
          )}
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
