'use client'

import React, { useState, useEffect } from 'react'
import type { Category, CategoryType } from '@/app/types/category'
import { generateDistinctColors } from '@/app/utils/colorGenerator'
import { db, type Business } from '@/app/db/financeDB'
import { BusinessType } from '@/app/types/business'
import { subjectStore } from '@/app/stores/subjectStore'
import { businessStore } from '@/app/stores/businessStore'
import YesNoModal from '../YesNoModal'
import Modal from '../Modal'

const DEFAULT_CATEGORIES: Category[] = []

export default function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([])
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [addingSubCategoryFor, setAddingSubCategoryFor] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; categoryId: string | null }>({ isOpen: false, categoryId: null })
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' })
  const [categoryUsage, setCategoryUsage] = useState<Record<string, { bank: number; credit: number }>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])

  useEffect(() => {
    loadCategories()
    loadCategoryUsage()
    loadBusinesses()
  }, [])

  const loadBusinesses = async () => {
    const all = await businessStore.getAll()
    setBusinesses(all.filter(b => b.type === BusinessType.Business || b.type === BusinessType.Teacher))
  }

  const loadCategories = () => {
    try {
      const cats = subjectStore.getAll()
      if (cats.length > 0) {
        const normalized = cats.map((cat: Category) => ({
          ...cat,
          isFixed: cat.isFixed ?? false,
        }))
        setCategories(normalized)
      } else {
        setCategories(DEFAULT_CATEGORIES)
        saveCategories(DEFAULT_CATEGORIES)
      }
    } catch (err) {
      console.error('Error loading categories:', err)
      setCategories(DEFAULT_CATEGORIES)
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

  const saveCategories = (cats: Category[]) => {
    subjectStore.saveAll(cats)
  }

  const getNextColor = (type: CategoryType): string => {
    const incomeColors = ['#10b981', '#3b82f6', '#8b5cf6', '#06b6d4', '#14b8a6', '#84cc16', '#22c55e', '#0ea5e9']
    const expenseColors = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#ec4899', '#a855f7', '#6366f1', '#f43f5e', '#fb923c', '#fbbf24', '#94a3b8', '#64748b']
    const colors = type === 'income' ? incomeColors : expenseColors
    const existingColors = categories.filter(c => c.type === type).map(c => c.color)
    const unusedColor = colors.find(c => !existingColors.includes(c))
    return unusedColor || colors[existingColors.length % colors.length]
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
    if (child.type !== parent.type) return
    if (isDescendant(parent.id, child.id)) return

    const updatedCategories = categories.map((cat) => {
      if (cat.subCategories?.includes(childId)) {
        return { ...cat, subCategories: cat.subCategories.filter((id) => id !== childId) }
      }
      return cat
    }).map((cat) => {
      if (cat.id === childId) {
        return { ...cat, parentId: newParentId, color: parent.color }
      }
      return cat
    }).map((cat) => {
      if (cat.id === newParentId) {
        return { ...cat, subCategories: [...(cat.subCategories || []), childId] }
      }
      return cat
    })

    setCategories(updatedCategories)
    saveCategories(updatedCategories)
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
      color: parent.color,
      createdAt: new Date().toISOString(),
      isFixed: false,
      parentId: parentId,
    }
    setEditingCategory(newSubCategory)
    setIsAddingNew(true)
    setAddingSubCategoryFor(parentId)
  }

  const handleSaveCategory = () => {
    if (!editingCategory || !editingCategory.name.trim()) return

    let updatedCategories: Category[]
    if (isAddingNew) {
      updatedCategories = [...categories, editingCategory]
      if (editingCategory.parentId) {
        updatedCategories = updatedCategories.map((cat) => {
          if (cat.id === editingCategory.parentId) {
            return { ...cat, subCategories: [...(cat.subCategories || []), editingCategory.id] }
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

    let updatedCategories = categories.filter((cat) => {
      if (cat.id === deleteConfirm.categoryId) return false
      return cat.parentId !== deleteConfirm.categoryId
    })

    if (categoryToDelete.parentId) {
      updatedCategories = updatedCategories.map((cat) => {
        if (cat.id === categoryToDelete.parentId) {
          return { ...cat, subCategories: (cat.subCategories || []).filter((id) => id !== deleteConfirm.categoryId) }
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

  const handleExport = async () => {
    try {
      const data = await subjectStore.export()
      if (!data) return
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
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
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content)
        await subjectStore.import(data)
        setCategories(data.categories || [])
      } catch (err) {
        console.error('Error importing:', err)
        setAlertModal({ isOpen: true, message: 'שגיאה בקריאת הקובץ' })
      }
    }
    reader.readAsText(file)
  }

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
            if (dropTargetId === category.id) setDropTargetId(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (draggingId) handleReparentCategory(draggingId, category.id)
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
            background: dropTargetId === category.id ? '#e0f2fe' : isSubCategory ? '#fafafa' : '#f8fafc',
            border: dropTargetId === category.id ? '2px dashed #0ea5e9' : isSubCategory ? '1px solid #e5e7eb' : '1px solid #e2e8f0',
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
              +
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
            ערוך
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
            מחק
          </button>
        </div>
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
    <>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button onClick={handleReorganizeColors} className="file-picker">
          צבעים ברורים
        </button>
        <button onClick={handleExport} className="upload-another-btn">
          ייצא הגדרות
        </button>
        <label className="upload-another-btn" style={{ cursor: 'pointer' }}>
          ייבא הגדרות
          <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </label>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#10b981' }}>נושאי הכנסה</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {categories
              .filter((cat) => cat.type === 'income' && !cat.parentId)
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
              .filter((cat) => cat.type === 'expense' && !cat.parentId)
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

      {/* Edit Category Modal */}
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
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>שם הנושא</label>
                  <input
                    type="text"
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
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
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>צבע</label>
                  <input
                    type="color"
                    value={editingCategory.color}
                    onChange={(e) => setEditingCategory({ ...editingCategory, color: e.target.value })}
                    style={{ width: '100%', height: '50px', cursor: 'pointer', border: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="isCapital"
                    checked={editingCategory.isCapital || false}
                    onChange={(e) => setEditingCategory({ ...editingCategory, isCapital: e.target.checked, isExternal: false })}
                    style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
                  />
                  <label htmlFor="isCapital" style={{ fontWeight: 600, cursor: 'pointer' }}>הון</label>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>(פנסיה, חסכונות, השקעות - יופרד מתזרים שוטף)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="isExternal"
                    checked={editingCategory.isExternal || false}
                    onChange={(e) => setEditingCategory({ ...editingCategory, isExternal: e.target.checked, isCapital: false })}
                    style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
                  />
                  <label htmlFor="isExternal" style={{ fontWeight: 600, cursor: 'pointer' }}>חיצוני</label>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>(מתנות, ירושה, העברות חד-פעמיות - לא יספר כהכנסה שוטפת)</span>
                </div>
                {businesses.length > 0 && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>עסק משויך</label>
                    <select
                      value={editingCategory.businessId ?? ''}
                      onChange={(e) => setEditingCategory({ ...editingCategory, businessId: e.target.value ? Number(e.target.value) : undefined })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e2e8f0',
                        fontSize: '1rem',
                        direction: 'rtl',
                        background: '#fff',
                      }}
                    >
                      <option value="">ללא שיוך</option>
                      {businesses.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {editingCategory.type === 'income' ? 'שייך נושא הכנסה זה לעסק ליצירת קבלות' : 'שייך נושא הוצאה זה לעסק למעקב הוצאות'}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditingCategory(null)} className="upload-another-btn">
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

      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({ isOpen: false, message: '' })} maxWidth="400px">
        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontSize: '1.125rem', margin: '0 0 1.5rem 0' }}>{alertModal.message}</p>
          <button onClick={() => setAlertModal({ isOpen: false, message: '' })} className="file-picker" autoFocus>
            אישור
          </button>
        </div>
      </Modal>
    </>
  )
}
