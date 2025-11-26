'use client'

import React, { useState, useEffect } from 'react'
import type { Category, CategoryType } from '@/app/types/category'
import {
  clearDirectoryHandle,
  getDirectoryMeta,
  loadDirectoryHandle,
  persistDirectoryHandle,
  requestDirectoryPermission,
} from '@/app/utils/directoryStorage'
import { generateDistinctColors } from '@/app/utils/colorGenerator'
import YesNoModal from './YesNoModal'
import Modal from './Modal'

const DEFAULT_CATEGORIES: Category[] = []

const STORAGE_KEY = 'finance-categories'

export default function Settings() {
  const [categories, setCategories] = useState<Category[]>([])
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [dirError, setDirError] = useState('')
  const [dirMeta, setDirMeta] = useState<{ name: string; savedAt: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; categoryId: string | null }>({ isOpen: false, categoryId: null })
  const [importConfirm, setImportConfirm] = useState<{ isOpen: boolean; file: File | null }>({ isOpen: false, file: null })
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' })

  useEffect(() => {
    loadCategories()
    initDirectoryHandle()
  }, [])

  const loadCategories = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        const normalized = (data.categories || []).map((cat: Category) => ({
          ...cat,
          isFixed: cat.isFixed ?? false,
        }))
        setCategories(normalized)
      } else {
        // First time - load defaults
        setCategories(DEFAULT_CATEGORIES)
        saveCategories(DEFAULT_CATEGORIES)
      }
    } catch (err) {
      console.error('Error loading categories:', err)
      setCategories(DEFAULT_CATEGORIES)
    }
  }

  const initDirectoryHandle = async () => {
    const meta = getDirectoryMeta()
    setDirMeta(meta)

    const handle = await loadDirectoryHandle()
    if (handle) {
      const hasPermission = await requestDirectoryPermission(handle, 'read')
      if (hasPermission) {
        setDirHandle(handle)
      } else {
        setDirHandle(null)
      }
    }
  }

  const handlePickDirectory = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        setDirError('הדפדפן שלך לא תומך בבחירת תיקיות. נסה Chrome או Edge.')
        return
      }

      setDirError('')
      const handle = await (window as any).showDirectoryPicker()
      const hasPermission = await requestDirectoryPermission(handle, 'read')
      if (!hasPermission) {
        setDirError('לא ניתנה הרשאה לתיקייה. אפשר גישה כדי להשתמש בהמשך.')
        return
      }

      await persistDirectoryHandle(handle)
      setDirHandle(handle)
      setDirMeta({ name: handle.name, savedAt: new Date().toISOString() })
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      console.error('Error picking directory:', err)
      setDirError('אירעה שגיאה בבחירת התיקייה.')
    }
  }

  const handleClearDirectory = async () => {
    await clearDirectoryHandle()
    setDirHandle(null)
    setDirMeta(null)
    setDirError('')
  }

  const handleRecheckPermission = async () => {
    if (!dirHandle) return
    const granted = await requestDirectoryPermission(dirHandle, 'read')
    if (!granted) {
      setDirError('הרשאה לתיקייה נדחתה. בחר תיקייה מחדש.')
      setDirHandle(null)
      setDirMeta(null)
      await clearDirectoryHandle()
    } else {
      setDirError('')
    }
  }

  const saveCategories = (cats: Category[]) => {
    try {
      const data = {
        version: '1.0',
        categories: cats,
        classifications: JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').classifications || [],
        lastUpdated: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      console.log('Saved categories to localStorage:', cats)
      console.log('Income categories:', cats.filter(c => c.type === 'income'))
      console.log('Expense categories:', cats.filter(c => c.type === 'expense'))
    } catch (err) {
      console.error('Error saving categories:', err)
    }
  }

  const getNextColor = (type: CategoryType): string => {
    const incomeColors = [
      '#10b981', // green
      '#3b82f6', // blue
      '#8b5cf6', // purple
      '#06b6d4', // cyan
      '#14b8a6', // teal
      '#84cc16', // lime
      '#22c55e', // green-light
      '#0ea5e9', // sky
    ]

    const expenseColors = [
      '#ef4444', // red
      '#f97316', // orange
      '#f59e0b', // amber
      '#eab308', // yellow
      '#ec4899', // pink
      '#a855f7', // purple
      '#6366f1', // indigo
      '#f43f5e', // rose
      '#fb923c', // orange-light
      '#fbbf24', // yellow-light
      '#94a3b8', // slate
      '#64748b', // gray
    ]

    const colors = type === 'income' ? incomeColors : expenseColors
    const existingColors = categories
      .filter(c => c.type === type)
      .map(c => c.color)

    // Find first unused color, or cycle back to start
    const unusedColor = colors.find(c => !existingColors.includes(c))
    return unusedColor || colors[existingColors.length % colors.length]
  }

  const handleAddCategory = (type: CategoryType) => {
    const newCategory: Category = {
      id: `custom-${Date.now()}`,
      name: '',
      type: type,
      color: getNextColor(type),
      createdAt: new Date().toISOString(),
      isFixed: false,
    }
    setEditingCategory(newCategory)
    setIsAddingNew(true)
  }

  const handleSaveCategory = () => {
    if (!editingCategory || !editingCategory.name.trim()) {
      return
    }

    let updatedCategories: Category[]
    if (isAddingNew) {
      updatedCategories = [...categories, editingCategory]
    } else {
      updatedCategories = categories.map((cat) =>
        cat.id === editingCategory.id ? editingCategory : cat
      )
    }

    setCategories(updatedCategories)
    saveCategories(updatedCategories)
    setEditingCategory(null)
    setIsAddingNew(false)
  }

  const handleDeleteCategory = (categoryId: string) => {
    setDeleteConfirm({ isOpen: true, categoryId })
  }

  const confirmDelete = () => {
    if (!deleteConfirm.categoryId) return

    const updatedCategories = categories.filter((cat) => cat.id !== deleteConfirm.categoryId)
    setCategories(updatedCategories)
    saveCategories(updatedCategories)
    setDeleteConfirm({ isOpen: false, categoryId: null })
  }

  const handleReorganizeColors = () => {
    const distinctColors = generateDistinctColors(categories.length)

    const updatedCategories = categories.map((cat, index) => ({
      ...cat,
      color: distinctColors[index],
    }))

    setCategories(updatedCategories)
    saveCategories(updatedCategories)
  }

  const handleExport = () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) return

      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-settings-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error exporting:', err)
    }
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content)
        localStorage.setItem(STORAGE_KEY, content)
        setCategories(data.categories || [])
      } catch (err) {
        console.error('Error importing:', err)
        setAlertModal({ isOpen: true, message: 'שגיאה בקריאת הקובץ' })
      }
    }
    reader.readAsText(file)
  }

  const handleExportAllData = () => {
    try {
      // Gather all data from localStorage
      const allData = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        transactions: localStorage.getItem('finance-transactions'),
        importedFiles: localStorage.getItem('finance-imported-files'),
        categories: localStorage.getItem('finance-categories'),
      }

      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      setAlertModal({ isOpen: true, message: 'הנתונים יוצאו בהצלחה!' })
    } catch (err) {
      console.error('Error exporting all data:', err)
      setAlertModal({ isOpen: true, message: 'שגיאה בייצוא הנתונים' })
    }
  }

  const handleImportAllData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportConfirm({ isOpen: true, file })
    event.target.value = '' // Reset file input
  }

  const confirmImport = () => {
    if (!importConfirm.file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content)

        // Validate version
        if (!data.version) {
          setAlertModal({ isOpen: true, message: 'פורמט קובץ לא תקין' })
          return
        }

        // Import all data
        if (data.transactions) {
          localStorage.setItem('finance-transactions', data.transactions)
        }
        if (data.importedFiles) {
          localStorage.setItem('finance-imported-files', data.importedFiles)
        }
        if (data.categories) {
          localStorage.setItem('finance-categories', data.categories)
          const categoriesData = JSON.parse(data.categories)
          setCategories(categoriesData.categories || [])
        }

        setImportConfirm({ isOpen: false, file: null })
        setAlertModal({ isOpen: true, message: 'הנתונים יובאו בהצלחה! הדף יטען מחדש.' })
        setTimeout(() => window.location.reload(), 1500)
      } catch (err) {
        console.error('Error importing all data:', err)
        setAlertModal({ isOpen: true, message: 'שגיאה בקריאת הקובץ' })
      }
    }
    reader.readAsText(importConfirm.file)
  }

  return (
    <div className="card">
      <header>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>הגדרות</h1>
            <p>ניהול נושאים וקטגוריות</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleReorganizeColors} className="file-picker">
              🎨 צבעים ברורים
            </button>
            <button onClick={handleExport} className="upload-another-btn">
              ייצא הגדרות
            </button>
            <label className="upload-another-btn" style={{ cursor: 'pointer' }}>
              ייבא הגדרות
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
      </header>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#fef3c7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>💾 גיבוי ושחזור נתונים</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#92400e', fontSize: '0.95rem' }}>
              ייצוא כל הנתונים לקובץ גיבוי או ייבוא מגיבוי קיים. הנתונים נשארים רק במכשיר שלך.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button onClick={handleExportAllData} className="file-picker" style={{ background: '#10b981', color: 'white' }}>
              📤 ייצא הכל
            </button>
            <label className="upload-another-btn" style={{ cursor: 'pointer', background: '#3b82f6', color: 'white' }}>
              📥 ייבא הכל
              <input
                type="file"
                accept=".json"
                onChange={handleImportAllData}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>תיקיית קבצים ברירת מחדל</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#475569', fontSize: '0.95rem' }}>
              בחר תיקייה פעם אחת במסך זה כדי שפתיחת קובץ תציג מיד את הקבצים מהתיקייה.
            </p>
            {dirMeta && (
              <p style={{ margin: '0.4rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                תיקייה נוכחית: <strong>{dirMeta.name}</strong> (נשמרה {new Date(dirMeta.savedAt).toLocaleString()})
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button onClick={handlePickDirectory} className="file-picker">
              {dirHandle ? 'בחר תיקייה אחרת' : 'בחר תיקייה'}
            </button>
            {dirHandle && (
              <>
                <button onClick={handleRecheckPermission} className="file-picker secondary">
                  אשר הרשאה
                </button>
                <button onClick={handleClearDirectory} className="upload-another-btn">
                  נקה תיקייה
                </button>
              </>
            )}
          </div>
        </div>
        {dirError && <div className="banner error" style={{ marginTop: '0.75rem' }}>{dirError}</div>}
        {!dirHandle && !dirError && (
          <p style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
            עדיין לא הוגדרה תיקייה. בחר תיקייה כדי לדלג על בחירת תיקייה בכל פעם שפותחים קובץ.
          </p>
        )}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#10b981' }}>נושאי הכנסה</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {categories
              .filter((cat) => cat.type === 'income')
              .sort((a, b) => a.name.localeCompare(b.name, 'he'))
              .map((category) => (
              <div
                key={category.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <input
                  type="color"
                  value={category.color}
                  onChange={(e) => {
                    const updated = categories.map((cat) =>
                      cat.id === category.id ? { ...cat, color: e.target.value } : cat
                    )
                    setCategories(updated)
                    saveCategories(updated)
                  }}
                  style={{ width: '32px', height: '32px', cursor: 'pointer', border: 'none', borderRadius: '4px' }}
                />
                <div style={{ flex: 1, fontWeight: 500, fontSize: '0.95rem' }}>{category.name}</div>
                <button
                  onClick={() => {
                    setEditingCategory({ ...category, isFixed: category.isFixed ?? false })
                    setIsAddingNew(false)
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.85rem',
                    background: 'transparent',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    color: '#475569',
                  }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.85rem',
                    background: 'transparent',
                    border: '1px solid #fecaca',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    color: '#dc2626',
                  }}
                >
                  🗑️
                </button>
              </div>
            ))}
            <button
              onClick={() => handleAddCategory('income')}
              style={{
                padding: '0.5rem',
                fontSize: '0.9rem',
                background: '#f0fdf4',
                border: '1px dashed #10b981',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                color: '#059669',
                fontWeight: 500,
                marginTop: '0.25rem',
              }}
            >
              + הוסף נושא הכנסה
            </button>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#ef4444' }}>נושאי הוצאה</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {categories
              .filter((cat) => cat.type === 'expense')
              .sort((a, b) => a.name.localeCompare(b.name, 'he'))
              .map((category) => (
              <div
                key={category.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <input
                  type="color"
                  value={category.color}
                  onChange={(e) => {
                    const updated = categories.map((cat) =>
                      cat.id === category.id ? { ...cat, color: e.target.value } : cat
                    )
                    setCategories(updated)
                    saveCategories(updated)
                  }}
                  style={{ width: '32px', height: '32px', cursor: 'pointer', border: 'none', borderRadius: '4px' }}
                />
                <div style={{ flex: 1, fontWeight: 500, fontSize: '0.95rem' }}>{category.name}</div>
                <button
                  onClick={() => {
                    setEditingCategory({ ...category, isFixed: category.isFixed ?? false })
                    setIsAddingNew(false)
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.85rem',
                    background: 'transparent',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    color: '#475569',
                  }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.85rem',
                    background: 'transparent',
                    border: '1px solid #fecaca',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    color: '#dc2626',
                  }}
                >
                  🗑️
                </button>
              </div>
            ))}
            <button
              onClick={() => handleAddCategory('expense')}
              style={{
                padding: '0.5rem',
                fontSize: '0.9rem',
                background: '#fef2f2',
                border: '1px dashed #ef4444',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                color: '#dc2626',
                fontWeight: 500,
                marginTop: '0.25rem',
              }}
            >
              + הוסף נושא הוצאה
            </button>
          </div>
        </div>
      </section>

      {editingCategory && (
        <div className="modal-overlay" onClick={() => setEditingCategory(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>{isAddingNew ? 'הוספת נושא חדש' : 'עריכת נושא'}</h2>
              <button className="modal-close" onClick={() => setEditingCategory(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                    שם הנושא
                  </label>
                  <input
                    type="text"
                    value={editingCategory.name}
                    onChange={(e) =>
                      setEditingCategory({ ...editingCategory, name: e.target.value })
                    }
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '1rem',
                      direction: 'rtl',
                    }}
                    placeholder="הזן שם נושא..."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                    צבע
                  </label>
                  <input
                    type="color"
                    value={editingCategory.color}
                    onChange={(e) =>
                      setEditingCategory({ ...editingCategory, color: e.target.value })
                    }
                    style={{ width: '100%', height: '50px', cursor: 'pointer', border: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setEditingCategory(null)}
                    className="upload-another-btn"
                  >
                    ביטול
                  </button>
                  <button onClick={handleSaveCategory} className="file-picker">
                    שמור
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <YesNoModal
        isOpen={deleteConfirm.isOpen}
        question="האם אתה בטוח שברצונך למחוק נושא זה?"
        onYes={confirmDelete}
        onNo={() => setDeleteConfirm({ isOpen: false, categoryId: null })}
      />

      <YesNoModal
        isOpen={importConfirm.isOpen}
        question="ייבוא נתונים ימחק את כל הנתונים הקיימים. האם להמשיך?"
        onYes={confirmImport}
        onNo={() => setImportConfirm({ isOpen: false, file: null })}
      />

      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({ isOpen: false, message: '' })} maxWidth="400px">
        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontSize: '1.125rem', margin: '0 0 1.5rem 0' }}>
            {alertModal.message}
          </p>
          <button
            onClick={() => setAlertModal({ isOpen: false, message: '' })}
            className="file-picker"
            autoFocus
          >
            אישור
          </button>
        </div>
      </Modal>
    </div>
  )
}
