'use client'

import { useEffect, useState } from 'react'
import Modal from '@/app/components/Modal'
import YesNoModal from '@/app/components/YesNoModal'
import { useToast } from '@/app/components/ToastContainer'
import { transactionStore } from '@/app/stores/transactionStore'
import type { DuplicateGroup } from '@/app/utils/findDuplicateTransactions'
import { formatMonthDisplay } from '@/app/utils/formatters'

type Props = {
  isOpen: boolean
  month: string
  onClose: () => void
  onDeleted?: () => void
}

export default function DuplicateTransactionsModal({ isOpen, month, onClose, onDeleted }: Props) {
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    transactionStore.findDuplicates(month).then((found) => {
      setGroups(found)
      setSelectedKeys(new Set(found.filter((g) => !g.needsReview).map((g) => g.key)))
      setLoading(false)
    })
  }, [isOpen, month])

  const safeGroups = groups.filter((g) => !g.needsReview)
  const reviewGroups = groups.filter((g) => g.needsReview)
  const selectedGroups = safeGroups.filter((g) => selectedKeys.has(g.key))
  const totalToRemove = selectedGroups.reduce((sum, g) => sum + g.remove.length, 0)

  const toggle = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedKeys(selectedKeys.size === safeGroups.length ? new Set() : new Set(safeGroups.map((g) => g.key)))
  }

  const handleDelete = async () => {
    setConfirming(false)
    setDeleting(true)
    const ids = selectedGroups.flatMap((g) => g.remove.map((t) => t.id).filter((id): id is number => id != null))
    const ok = await transactionStore.deleteTransactions(ids)
    setDeleting(false)
    if (ok) {
      showToast('success', `${ids.length} כפילויות נמחקו`)
      onDeleted?.()
      onClose()
    } else {
      showToast('error', 'מחיקת הכפילויות נכשלה')
    }
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} maxWidth="700px">
        <div className="modal-body" style={{ padding: '1.5rem', direction: 'rtl' }}>
          <h2 style={{ marginTop: 0 }}>כפילויות בתנועות — {formatMonthDisplay(month)}</h2>

          {loading ? (
            <p style={{ color: '#64748b' }}>סורק תנועות...</p>
          ) : groups.length === 0 ? (
            <p style={{ color: '#64748b' }}>לא נמצאו כפילויות 🎉</p>
          ) : (
            <>
              {safeGroups.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                    <span>{safeGroups.length} קבוצות כפילויות · {totalToRemove} שורות נבחרות למחיקה</span>
                    <button
                      onClick={toggleAll}
                      style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                    >
                      {selectedKeys.size === safeGroups.length ? 'בטל בחירת הכל' : 'בחר הכל'}
                    </button>
                  </div>
                  <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff' }}>
                          <th style={{ padding: '0.5rem' }}></th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>תאריך</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>תיאור (נשמר)</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>סכום</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>כפילויות</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>זוהה לפי</th>
                        </tr>
                      </thead>
                      <tbody>
                        {safeGroups.map((g) => (
                          <tr key={g.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                              <input type="checkbox" checked={selectedKeys.has(g.key)} onChange={() => toggle(g.key)} />
                            </td>
                            <td style={{ padding: '0.5rem' }}>{g.keep.date}</td>
                            <td style={{ padding: '0.5rem' }}>{g.keep.description}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'left' }}>₪{Math.abs(g.keep.amount).toLocaleString()}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>{g.remove.length}</td>
                            <td
                              style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.75rem', color: g.keep.reference ? '#10b981' : '#94a3b8' }}
                              title={g.keep.reference ? 'זוהה לפי אסמכתא בנקאית — התאמה מדויקת' : 'זוהה לפי דמיון טקסט (אין אסמכתא לתנועה זו)'}
                            >
                              {g.keep.reference ? '🔗 אסמכתא' : '≈ טקסט'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {reviewGroups.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fffbeb', borderRadius: '0.5rem', fontSize: '0.85rem', color: '#92400e' }}>
                  <strong>{reviewGroups.length} קבוצות דורשות בדיקה ידנית</strong> (מסמכים מקושרים למספר כפילויות שונות) — לא נכללות במחיקה האוטומטית.
                  <ul style={{ margin: '0.5rem 0 0', paddingRight: '1.2rem' }}>
                    {reviewGroups.map((g) => (
                      <li key={g.key}>{g.keep.date} · {g.keep.description} · ₪{Math.abs(g.keep.amount).toLocaleString()}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              onClick={() => setConfirming(true)}
              disabled={totalToRemove === 0 || deleting}
              className="file-picker"
              style={{ flex: 1, opacity: totalToRemove === 0 ? 0.5 : 1 }}
            >
              {deleting ? 'מוחק...' : `מחק ${totalToRemove} כפילויות`}
            </button>
            <button onClick={onClose} className="upload-another-btn" style={{ flex: 1 }}>
              סגור
            </button>
          </div>
        </div>
      </Modal>

      <YesNoModal
        isOpen={confirming}
        question={`למחוק ${totalToRemove} תנועות כפולות? הפעולה בלתי הפיכה.`}
        yesText="מחק"
        noText="בטל"
        onYes={handleDelete}
        onNo={() => setConfirming(false)}
      />
    </>
  )
}
