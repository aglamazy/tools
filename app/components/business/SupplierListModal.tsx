'use client'

import { useEffect, useMemo, useState } from 'react'
import Modal from '@/app/components/Modal'
import { db, type Supplier } from '@/app/db/financeDB'

type SupplierListModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function SupplierListModal({ isOpen, onClose }: SupplierListModalProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    db.suppliers.toArray().then((rows) => {
      setSuppliers(rows.sort((a, b) => a.name.localeCompare(b.name, 'he')))
      setLoading(false)
    })
  }, [isOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.bankCardAliases.some((a) => a.toLowerCase().includes(q)) ||
      s.emailSenders.some((e) => e.toLowerCase().includes(q))
    )
  }, [suppliers, query])

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="900px">
      <div className="modal-header">
        <h2>ספקים ({suppliers.length})</h2>
      </div>
      <div className="modal-body">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם, כינוי בבנק/כרטיס, או כתובת מייל…"
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            marginBottom: '1rem',
            direction: 'rtl',
          }}
        />

        {loading ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>טוען…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>לא נמצאו ספקים</p>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }} className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>שם</th>
                  <th>כינויים בבנק/כרטיס</th>
                  <th>שולחי מייל</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ fontSize: '0.8rem', color: '#475569' }}>{s.bankCardAliases.join(', ')}</td>
                    <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                      {s.emailSenders.length > 0 ? s.emailSenders.join(' · ') : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.75rem' }}>
          {filtered.length} מתוך {suppliers.length}
        </p>
      </div>
    </Modal>
  )
}
