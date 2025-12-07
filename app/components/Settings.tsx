'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
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
import { db } from '@/app/db/financeDB'

const DEFAULT_CATEGORIES: Category[] = []

const STORAGE_KEY = 'finance-categories'

export default function Settings() {
  const [categories, setCategories] = useState<Category[]>([])
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [addingSubCategoryFor, setAddingSubCategoryFor] = useState<string | null>(null)
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [dirError, setDirError] = useState('')
  const [dirMeta, setDirMeta] = useState<{ name: string; savedAt: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; categoryId: string | null }>({ isOpen: false, categoryId: null })
  const [importConfirm, setImportConfirm] = useState<{ isOpen: boolean; file: File | null }>({ isOpen: false, file: null })
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' })
  const [dbStats, setDbStats] = useState<{ transactions: number; importedFiles: number; businessCategories: number } | null>(null)
  const [categoryUsage, setCategoryUsage] = useState<Record<string, { bank: number; credit: number }>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  useEffect(() => {
    loadCategories()
    initDirectoryHandle()
    loadDatabaseStats()
    loadCategoryUsage()
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

  const loadDatabaseStats = async () => {
    try {
      const [transactionsCount, importedFilesCount, businessCategoriesCount] = await Promise.all([
        db.transactions.count(),
        db.importedFiles.count(),
        db.businessCategories.count(),
      ])
      setDbStats({
        transactions: transactionsCount,
        importedFiles: importedFilesCount,
        businessCategories: businessCategoriesCount,
      })
    } catch (err) {
      console.error('Error loading database stats:', err)
    }
  }

  const loadCategoryUsage = async () => {
    try {
      const transactions = await db.transactions.toArray()
      const usage: Record<string, { bank: number; credit: number }> = {}

      transactions.forEach((t) => {
        const name = t.category?.trim()
        if (!name) return
        const entry = usage[name] || { bank: 0, credit: 0 }
        if (t.type === 'bank') entry.bank += 1
        if (t.type === 'credit') entry.credit += 1
        usage[name] = entry
      })

      setCategoryUsage(usage)
    } catch (err) {
      console.error('Error loading category usage:', err)
    }
  }

  const isDescendant = (candidateId: string, targetAncestorId: string): boolean => {
    const candidate = categories.find((c) => c.id === candidateId)
    if (!candidate || !candidate.parentId) return false
    if (candidate.parentId === targetAncestorId) return true
    return isDescendant(candidate.parentId, targetAncestorId)
  }

  const handleReparentCategory = (childId: string, newParentId: string) => {
    if (childId === newParentId) return

    const child = categories.find((c) => c.id === childId)
    const parent = categories.find((c) => c.id === newParentId)
    if (!child || !parent) return

    // Only allow reparenting within the same type and avoid cycles
    if (child.type !== parent.type) return
    if (isDescendant(parent.id, child.id)) return

    const updatedCategories = categories.map((cat) => {
      // Remove child from any current parent's subCategories
      if (cat.subCategories?.includes(childId)) {
        return { ...cat, subCategories: cat.subCategories.filter((id) => id !== childId) }
      }
      return cat
    }).map((cat) => {
      // Update the child to point to the new parent
      if (cat.id === childId) {
        return { ...cat, parentId: newParentId, color: parent.color }
      }
      return cat
    }).map((cat) => {
      // Add child to new parent's subCategories
      if (cat.id === newParentId) {
        return { ...cat, subCategories: [...(cat.subCategories || []), childId] }
      }
      return cat
    })

    setCategories(updatedCategories)
    saveCategories(updatedCategories)
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
    setAddingSubCategoryFor(null)
  }

  const handleAddSubCategory = (parentId: string) => {
    const parent = categories.find((c) => c.id === parentId)
    if (!parent) return

    const newSubCategory: Category = {
      id: `custom-${Date.now()}`,
      name: '',
      type: parent.type,
      color: parent.color, // Inherit parent color
      createdAt: new Date().toISOString(),
      isFixed: false,
      parentId: parentId,
    }
    setEditingCategory(newSubCategory)
    setIsAddingNew(true)
    setAddingSubCategoryFor(parentId)
  }

  const handleSaveCategory = () => {
    if (!editingCategory || !editingCategory.name.trim()) {
      return
    }

    let updatedCategories: Category[]
    if (isAddingNew) {
      updatedCategories = [...categories, editingCategory]

      // If adding a sub-category, update parent's subCategories array
      if (editingCategory.parentId) {
        updatedCategories = updatedCategories.map((cat) => {
          if (cat.id === editingCategory.parentId) {
            return {
              ...cat,
              subCategories: [...(cat.subCategories || []), editingCategory.id],
            }
          }
          return cat
        })
      }
    } else {
      updatedCategories = categories.map((cat) =>
        cat.id === editingCategory.id ? editingCategory : cat
      )
    }

    setCategories(updatedCategories)
    saveCategories(updatedCategories)
    setEditingCategory(null)
    setIsAddingNew(false)
    setAddingSubCategoryFor(null)
  }

  const handleDeleteCategory = (categoryId: string) => {
    setDeleteConfirm({ isOpen: true, categoryId })
  }

  const confirmDelete = () => {
    if (!deleteConfirm.categoryId) return

    const categoryToDelete = categories.find((c) => c.id === deleteConfirm.categoryId)
    if (!categoryToDelete) return

    // Remove the category and all its sub-categories
    let updatedCategories = categories.filter((cat) => {
      // Remove the category itself
      if (cat.id === deleteConfirm.categoryId) return false
      // Remove sub-categories of this category
      if (cat.parentId === deleteConfirm.categoryId) return false
      return true
    })

    // If deleting a sub-category, remove it from parent's subCategories array
    if (categoryToDelete.parentId) {
      updatedCategories = updatedCategories.map((cat) => {
        if (cat.id === categoryToDelete.parentId) {
          return {
            ...cat,
            subCategories: (cat.subCategories || []).filter((id) => id !== deleteConfirm.categoryId),
          }
        }
        return cat
      })
    }

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

  // Helper to render a category row with its sub-categories
  const renderCategoryRow = (category: Category, isSubCategory: boolean = false) => {
    const isDropCandidate =
      draggingId &&
      draggingId !== category.id &&
      !isDescendant(category.id, draggingId) &&
      categories.find((c) => c.id === draggingId)?.type === category.type

    return (
      <React.Fragment key={category.id}>
        <div
          draggable
          onDragStart={(e) => {
            setDraggingId(category.id)
            setDropTargetId(null)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => {
            setDraggingId(null)
            setDropTargetId(null)
          }}
          onDragOver={(e) => {
            if (!isDropCandidate) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDropTargetId(category.id)
          }}
          onDragLeave={() => {
            if (dropTargetId === category.id) {
              setDropTargetId(null)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (draggingId) {
              handleReparentCategory(draggingId, category.id)
            }
            setDraggingId(null)
            setDropTargetId(null)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            paddingRight: isSubCategory ? '2rem' : '0.75rem',
            borderRadius: '0.5rem',
            background:
              dropTargetId === category.id ? '#e0f2fe' : isSubCategory ? '#fafafa' : '#f8fafc',
            border:
              dropTargetId === category.id
                ? '2px dashed #0ea5e9'
                : isSubCategory
                  ? '1px solid #e5e7eb'
                  : '1px solid #e2e8f0',
            marginRight: isSubCategory ? '1rem' : '0',
            cursor: 'grab',
          }}
          title="גרור כדי לשנות היררכיה"
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
          <div style={{ flex: 1, fontWeight: isSubCategory ? 400 : 500, fontSize: '0.95rem' }}>
            {isSubCategory && '┘─ '}
            {category.name}
            <span style={{ marginRight: '0.5rem', color: '#64748b', fontSize: '0.85rem' }}>
              ({categoryUsage[category.name]?.bank || 0} בנק / {categoryUsage[category.name]?.credit || 0} אשראי)
            </span>
          </div>
          {!isSubCategory && (
            <button
              onClick={() => handleAddSubCategory(category.id)}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.85rem',
                background: 'transparent',
                border: '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                color: '#475569',
              }}
              title="הוסף תת-נושא"
            >
              ➕
            </button>
          )}
          <button
            onClick={() => {
              setEditingCategory({ ...category, isFixed: category.isFixed ?? false })
              setIsAddingNew(false)
              setAddingSubCategoryFor(null)
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
        {/* Render sub-categories */}
        {category.subCategories && category.subCategories.length > 0 && (
          <div style={{ marginTop: '0.25rem', marginBottom: '0.25rem' }}>
            {category.subCategories.map((subId) => {
              const subCategory = categories.find((c) => c.id === subId)
              return subCategory ? renderCategoryRow(subCategory, true) : null
            })}
          </div>
        )}
      </React.Fragment>
    )
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

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#f0f9ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>📊 סטטיסטיקות מאגר נתונים</h2>
              <p style={{ margin: '0.25rem 0 0', color: '#075985', fontSize: '0.95rem' }}>
                מידע על כמות הרשומות במאגר הנתונים המקומי
              </p>
            {dbStats && (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.5rem', fontSize: '0.9rem' }}>
                <div>
                  <strong>עסקאות:</strong> {dbStats.transactions.toLocaleString('he-IL')}
                </div>
                <div>
                  <strong>קבצים מיובאים:</strong> {dbStats.importedFiles.toLocaleString('he-IL')}
                </div>
                <div>
                  <Link href="/tools/business-categories" style={{ fontWeight: 700, color: '#0ea5e9' }}>
                    מיפוי עסקים-נושאים
                  </Link>
                  : {dbStats.businessCategories.toLocaleString('he-IL')}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              loadDatabaseStats()
              loadCategoryUsage()
            }}
            className="file-picker secondary"
            style={{ flexShrink: 0 }}
          >
            🔄 רענן
          </button>
        </div>
      </section>

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
              .filter((cat) => cat.type === 'income' && !cat.parentId) // Only show parent categories
              .sort((a, b) => a.name.localeCompare(b.name, 'he'))
              .map((category) => renderCategoryRow(category))}
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
              .filter((cat) => cat.type === 'expense' && !cat.parentId) // Only show parent categories
              .sort((a, b) => a.name.localeCompare(b.name, 'he'))
              .map((category) => renderCategoryRow(category))}
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
              <h2>
                {isAddingNew
                  ? editingCategory.parentId
                    ? 'הוספת תת-נושא'
                    : 'הוספת נושא חדש'
                  : editingCategory.parentId
                  ? 'עריכת תת-נושא'
                  : 'עריכת נושא'}
              </h2>
              <button className="modal-close" onClick={() => setEditingCategory(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {editingCategory.parentId && (
                  <div style={{ padding: '0.75rem', background: '#f0f9ff', borderRadius: '0.5rem', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontSize: '0.875rem', color: '#075985' }}>
                      תת-נושא של: <strong>{categories.find((c) => c.id === editingCategory.parentId)?.name}</strong>
                    </span>
                  </div>
                )}
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
