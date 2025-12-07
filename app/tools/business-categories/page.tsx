'use client'

import { useState, useEffect } from 'react'
import { db } from '@/app/db/financeDB'
import type { BusinessCategory } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import type { Category } from '@/app/types/category'
import { useToast } from '@/app/components/ToastContainer'

export default function BusinessCategoriesPage() {
  const { showToast } = useToast()
  const [mappings, setMappings] = useState<BusinessCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')

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

  const handleClearAll = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את כל המיפויים?')) {
      return
    }

    try {
      await db.businessCategories.clear()
      setMappings([])
      showToast('success', 'כל המיפויים נמחקו בהצלחה', '🗑️')
    } catch (error) {
      console.error('Error clearing mappings:', error)
      showToast('error', 'שגיאה במחיקת המיפויים', '❌')
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
                        <td style={{ fontWeight: 500 }}>{mapping.business}</td>
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
      </div>
    </main>
  )
}
