'use client'

import { useState, useEffect } from 'react'
import { db } from '@/app/db/financeDB'
import type { BusinessCategory } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import type { Category } from '@/app/types/category'
import { useToast } from '@/app/components/ToastContainer'
import YesNoModal from '@/app/components/YesNoModal'

export default function BusinessCategoriesPage() {
  const { showToast } = useToast()
  const [mappings, setMappings] = useState<BusinessCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [clearAllModal, setClearAllModal] = useState<{ isOpen: boolean }>({ isOpen: false })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [duplicatesModal, setDuplicatesModal] = useState<{
    isOpen: boolean
    savedName: string
    duplicates: BusinessCategory[]
  }>({ isOpen: false, savedName: '', duplicates: [] })

  // Load mappings and categories
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [businessCategories, availableCategories] = await Promise.all([
      db.businessCategories.toArray(),
      Promise.resolve(subjectStore.getAll()),
    ])

    // Sort by business name
    businessCategories.sort((a, b) => a.business.localeCompare(b.business, 'he'))

    setMappings(businessCategories)
    setCategories(availableCategories)
    setLoading(false)
  }

  const handleDelete = async (id: number) => {
    try {
      await db.businessCategories.delete(id)
      setMappings(mappings.filter((m) => m.id !== id))
      showToast('success', 'המיפוי נמחק בהצלחה', '🗑️')
    } catch (error) {
      console.error('Error deleting mapping:', error)
      showToast('error', 'שגיאה במחיקת המיפוי', '❌')
    }
  }

  const handleUpdateCategory = async (id: number, business: string, newCategory: string) => {
    try {
      await db.businessCategories.put({
        id,
        business,
        category: newCategory,
        lastUpdated: new Date().toISOString(),
      })
      setMappings(
        mappings.map((m) => (m.id === id ? { ...m, category: newCategory, lastUpdated: new Date().toISOString() } : m))
      )
      showToast('success', 'הנושא עודכן בהצלחה', '✅')
    } catch (error) {
      console.error('Error updating mapping:', error)
      showToast('error', 'שגיאה בעדכון הנושא', '❌')
    }
  }

  const handleEditBusiness = (mapping: BusinessCategory) => {
    setEditingId(mapping.id!)
    setEditValue(mapping.business)
  }

  const handleSaveBusiness = async (mapping: BusinessCategory) => {
    const newName = editValue.trim()
    if (!newName) {
      showToast('error', 'שם עסק לא יכול להיות ריק', '❌')
      return
    }
    if (newName === mapping.business) {
      setEditingId(null)
      return
    }

    // Check for duplicate
    const duplicate = mappings.find((m) => m.id !== mapping.id && m.business === newName)
    if (duplicate) {
      showToast('error', `כבר קיים מיפוי עבור "${newName}"`, '❌')
      return
    }

    try {
      await db.businessCategories.put({
        id: mapping.id,
        business: newName,
        category: mapping.category,
        lastUpdated: new Date().toISOString(),
      })
      const updatedMappings = mappings.map((m) =>
        m.id === mapping.id ? { ...m, business: newName, lastUpdated: new Date().toISOString() } : m
      )
      setMappings(updatedMappings)
      setEditingId(null)
      showToast('success', 'שם העסק עודכן בהצלחה', '✅')

      // Detect redundant mappings: other entries whose business contains the new name (substring match)
      // Longest match wins at classify time, so these are truly redundant
      const nameLower = newName.toLowerCase()
      const redundant = updatedMappings.filter(
        (m) => m.id !== mapping.id && m.business.toLowerCase().includes(nameLower) && m.category === mapping.category
      )
      if (redundant.length > 0) {
        setDuplicatesModal({ isOpen: true, savedName: newName, duplicates: redundant })
      }
    } catch (error) {
      console.error('Error updating business name:', error)
      showToast('error', 'שגיאה בעדכון שם העסק', '❌')
    }
  }

  const handleDeleteDuplicates = async () => {
    const ids = duplicatesModal.duplicates.map((m) => m.id!)
    try {
      await db.businessCategories.bulkDelete(ids)
      setMappings((prev) => prev.filter((m) => !ids.includes(m.id!)))
      showToast('success', `${ids.length} מיפויים כפולים נמחקו`, '🗑️')
    } catch (error) {
      console.error('Error deleting duplicates:', error)
      showToast('error', 'שגיאה במחיקת כפולים', '❌')
    } finally {
      setDuplicatesModal({ isOpen: false, savedName: '', duplicates: [] })
    }
  }

  const handleClearAll = async () => {
    setClearAllModal({ isOpen: true })
  }

  const confirmClearAll = async () => {
    try {
      await db.businessCategories.clear()
      setMappings([])
      showToast('success', 'כל המיפויים נמחקו בהצלחה', '🗑️')
    } catch (error) {
      console.error('Error clearing mappings:', error)
      showToast('error', 'שגיאה במחיקת המיפויים', '❌')
    } finally {
      setClearAllModal({ isOpen: false })
    }
  }

  // Filter mappings
  const filteredMappings = mappings.filter((mapping) => {
    const matchesSearch = mapping.business.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !filterCategory || mapping.category === filterCategory
    return matchesSearch && matchesCategory
  })

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header>
          <h1>מיפוי עסקים לנושאים</h1>
          <p>ניהול המיפוי האוטומטי של שמות עסקים לנושאי תקציב</p>
        </header>

        {/* Controls */}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 250px' }}>
            <input
              type="text"
              placeholder="חיפוש לפי שם עסק..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
              }}
            />
          </div>
          <div style={{ flex: '0 0 200px' }}>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
              }}
            >
              <option value="">כל הנושאים</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => loadData()}
            className="upload-another-btn"
            style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            🔄 רענן
          </button>
          {mappings.length > 0 && (
            <button
              onClick={handleClearAll}
              className="upload-another-btn"
              style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.875rem', background: '#ef4444', color: 'white' }}
            >
              🗑️ מחק הכל
            </button>
          )}
        </div>

        {/* Stats */}
        {!loading && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem' }}>
              <div>
                <strong>סה"כ מיפויים:</strong> {mappings.length}
              </div>
              <div>
                <strong>מוצגים:</strong> {filteredMappings.length}
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && (
          <section style={{ marginTop: '2rem' }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>שם עסק</th>
                    <th>נושא</th>
                    <th>עודכן לאחרונה</th>
                    <th>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMappings.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                        {searchTerm || filterCategory
                          ? 'לא נמצאו תוצאות לחיפוש'
                          : 'אין מיפויים במאגר. המיפויים נוצרים אוטומטית כשאתה מסווג עסקאות בעמוד התקציב.'}
                      </td>
                    </tr>
                  ) : (
                    filteredMappings.map((mapping) => (
                      <tr key={mapping.id}>
                        <td style={{ fontWeight: 500 }}>
                          {editingId === mapping.id ? (
                            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveBusiness(mapping)
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                                autoFocus
                                style={{
                                  flex: 1,
                                  padding: '0.25rem',
                                  borderRadius: '0.25rem',
                                  border: '1px solid #3b82f6',
                                  fontSize: '0.875rem',
                                }}
                              />
                              <button
                                onClick={() => handleSaveBusiness(mapping)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '0.25rem',
                                  border: '1px solid #22c55e',
                                  background: '#22c55e',
                                  color: 'white',
                                  cursor: 'pointer',
                                }}
                              >
                                שמור
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '0.25rem',
                                  border: '1px solid #d1d5db',
                                  background: 'white',
                                  cursor: 'pointer',
                                }}
                              >
                                ביטול
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => handleEditBusiness(mapping)}
                              style={{ cursor: 'pointer' }}
                              title="לחץ לעריכה"
                            >
                              {mapping.business}
                            </span>
                          )}
                        </td>
                        <td>
                          <select
                            value={mapping.category}
                            onChange={(e) => handleUpdateCategory(mapping.id!, mapping.business, e.target.value)}
                            style={{
                              padding: '0.25rem',
                              borderRadius: '0.25rem',
                              border: '1px solid #d1d5db',
                              fontSize: '0.875rem',
                              width: '100%',
                            }}
                          >
                            <option value="">בחר נושא</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.name}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {new Date(mapping.lastUpdated).toLocaleString('he-IL')}
                        </td>
                        <td>
                          <button
                            onClick={() => handleDelete(mapping.id!)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.875rem',
                              borderRadius: '0.25rem',
                              border: '1px solid #ef4444',
                              background: 'white',
                              color: '#ef4444',
                              cursor: 'pointer',
                            }}
                          >
                            מחק
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>טוען...</div>
      )}

      <YesNoModal
        isOpen={clearAllModal.isOpen}
        question="האם אתה בטוח שברצונך למחוק את כל המיפויים?"
        onYes={confirmClearAll}
        onNo={() => setClearAllModal({ isOpen: false })}
      />

      <YesNoModal
        isOpen={duplicatesModal.isOpen}
        question={`נמצאו ${duplicatesModal.duplicates.length} מיפויים שמכילים "${duplicatesModal.savedName}" עם אותו נושא. למחוק אותם?`}
        onYes={handleDeleteDuplicates}
        onNo={() => setDuplicatesModal({ isOpen: false, savedName: '', duplicates: [] })}
      />
    </div>
  </main>
)
}
