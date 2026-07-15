'use client'

import React, { useState, useEffect } from 'react'
import type { Category, CategoryType } from '@/app/types/category'
import { generateDistinctColors } from '@/app/utils/colorGenerator'
import { db, type Business } from '@/app/db/financeDB'
import { BusinessType } from '@/app/types/business'
import { subjectStore } from '@/app/stores/subjectStore'
import { businessStore } from '@/app/stores/businessStore'
import { partnerStore, type Partner } from '@/app/stores/partnerStore'
import { getHouseholdInfo } from '@/app/services/householdService'
import YesNoModal from '../YesNoModal'
import Modal from '../Modal'
import CategoriesToolbarActions from './CategoriesToolbarActions'

type Scope =
  | { kind: 'household' }
  | { kind: 'business'; id: number }

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
  const [scope, setScope] = useState<Scope>({ kind: 'household' })
  const [householdMembers, setHouseholdMembers] = useState<{ uid: string; label: string }[]>([])
  const [settlementPartnerOptions, setSettlementPartnerOptions] = useState<Partner[]>([])

  useEffect(() => {
    loadCategories()
    loadCategoryUsage()
    loadBusinesses()
    loadHouseholdMembers()
  }, [])

  // Load business partners for the קיזוז "personally borne by" selector —
  // only relevant while editing a business-scoped category.
  useEffect(() => {
    const businessId = editingCategory?.businessId
    if (businessId === undefined) { setSettlementPartnerOptions([]); return }
    setSettlementPartnerOptions(partnerStore.getCachedByBusinessId(businessId))
    const business = businesses.find(b => b.id === businessId)
    if (!business?.syncId) return
    partnerStore.recordBusiness(businessId, business.syncId)
    const unsub = partnerStore.subscribe(() => {
      setSettlementPartnerOptions(partnerStore.getCachedByBusinessId(businessId))
    })
    void partnerStore.refresh(business.syncId)
    return unsub
  }, [editingCategory?.businessId, businesses])

  const loadBusinesses = async () => {
    const all = await businessStore.getAll()
    setBusinesses(all.filter(b => (b.type === BusinessType.Business || b.type === BusinessType.Teacher || b.type === BusinessType.Employee || b.type === BusinessType.Artist) && !b.sharedWithMe))
  }

  const loadHouseholdMembers = async () => {
    try {
      const info = await getHouseholdInfo()
      const list: { uid: string; label: string }[] = []
      if (info.household) {
        const hNames = (info.household as { memberNames?: Record<string, string> }).memberNames || {}
        const hEmails = (info.household as { memberEmails?: Record<string, string> }).memberEmails || {}
        for (const uid of info.household.members) {
          const label = hNames[uid] || (hEmails[uid] ? hEmails[uid].split('@')[0] : uid.slice(-6))
          list.push({ uid, label })
        }
      }
      setHouseholdMembers(list)
    } catch {
      setHouseholdMembers([])
    }
  }

  const loadCategories = async () => {
    try {
      const cats = await subjectStore.getAll()
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

  const moveCategoryToScope = (categoryId: string, target: Scope) => {
    const cat = categories.find(c => c.id === categoryId)
    if (!cat) return
    const targetBusinessId = target.kind === 'business' ? target.id : undefined
    if ((cat.businessId ?? undefined) === targetBusinessId && !cat.parentId) return

    const oldParentId = cat.parentId
    const subIds = new Set(cat.subCategories || [])
    const detachColor = oldParentId ? getNextColor(cat.type) : cat.color

    const updated = categories.map(c => {
      if (c.id === categoryId) {
        return { ...c, businessId: targetBusinessId, parentId: undefined, color: detachColor }
      }
      if (oldParentId && c.id === oldParentId) {
        return { ...c, subCategories: (c.subCategories || []).filter(id => id !== categoryId) }
      }
      if (subIds.has(c.id)) {
        return { ...c, businessId: targetBusinessId }
      }
      return c
    })
    setCategories(updated)
    saveCategories(updated)
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
      ...(scope.kind === 'business' ? { businessId: scope.id } : {}),
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
    const trimmedName = editingCategory.name.trim()

    const duplicate = categories.find((cat) =>
      cat.id !== editingCategory.id &&
      cat.name.trim() === trimmedName &&
      cat.type === editingCategory.type &&
      cat.businessId === editingCategory.businessId
    )
    if (duplicate) {
      setAlertModal({ isOpen: true, message: `כבר קיים נושא בשם "${trimmedName}" בהיקף הזה — לא ניתן ליצור כפילות.` })
      return
    }

    const savedCategory: Category = { ...editingCategory, name: trimmedName, updatedAt: new Date().toISOString() }

    let updatedCategories: Category[]
    if (isAddingNew) {
      updatedCategories = [...categories, savedCategory]
      if (savedCategory.parentId) {
        updatedCategories = updatedCategories.map((cat) => {
          if (cat.id === savedCategory.parentId) {
            return { ...cat, subCategories: [...(cat.subCategories || []), savedCategory.id] }
          }
          return cat
        })
      }
    } else {
      const original = categories.find((cat) => cat.id === savedCategory.id)
      updatedCategories = categories.map((cat) =>
        cat.id === savedCategory.id ? savedCategory : cat
      )
      if (original && original.parentId !== savedCategory.parentId) {
        updatedCategories = updatedCategories.map((cat) => {
          if (cat.id === original.parentId) {
            return { ...cat, subCategories: (cat.subCategories || []).filter((id) => id !== savedCategory.id) }
          }
          if (savedCategory.parentId && cat.id === savedCategory.parentId) {
            const existing = cat.subCategories || []
            return existing.includes(savedCategory.id) ? cat : { ...cat, subCategories: [...existing, savedCategory.id] }
          }
          return cat
        })
      }
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
      {(() => {
        const inScope = (cat: Category): boolean => {
          if (scope.kind === 'household') return !cat.businessId
          return cat.businessId === scope.id
        }

        const subTabs: { id: string; label: string; scope: Scope }[] = [
          { id: 'household', label: '🏠 משק בית', scope: { kind: 'household' } },
          ...businesses.map(b => ({ id: `b-${b.id}`, label: `🏢 ${b.name}`, scope: { kind: 'business' as const, id: b.id! } })),
        ]
        const activeId =
          scope.kind === 'household' ? 'household'
          : `b-${scope.id}`

        return (
          <>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.4rem',
              alignItems: 'center',
              marginBottom: '1.5rem',
              borderBottom: '1px solid #e2e8f0',
              paddingTop: '0.5rem',
              paddingBottom: '0.5rem',
              position: 'sticky',
              top: '56px', // page-header height
              background: '#fff',
              zIndex: 5,
            }}>
              {subTabs.map(t => {
                const active = activeId === t.id
                const isDropTarget = !!draggingId && !active
                const showDropHint = isDropTarget && dropTargetId === `scope-${t.id}`
                return (
                  <button
                    key={t.id}
                    onClick={() => setScope(t.scope)}
                    onDragOver={(e) => {
                      if (!draggingId) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDropTargetId(`scope-${t.id}`)
                    }}
                    onDragLeave={() => {
                      if (dropTargetId === `scope-${t.id}`) setDropTargetId(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggingId) moveCategoryToScope(draggingId, t.scope)
                      setDraggingId(null)
                      setDropTargetId(null)
                    }}
                    style={{
                      padding: '0.4rem 0.85rem',
                      fontSize: '0.85rem',
                      background: showDropHint ? '#e0f2fe' : active ? '#3b82f6' : '#f8fafc',
                      color: showDropHint ? '#0369a1' : active ? '#fff' : '#475569',
                      border: `${showDropHint ? '2px dashed #0ea5e9' : '1px solid ' + (active ? '#3b82f6' : '#e2e8f0')}`,
                      borderRadius: '0.375rem',
                      cursor: isDropTarget ? 'copy' : 'pointer',
                      fontWeight: active ? 600 : 400,
                    }}
                    title={isDropTarget ? 'שחרר כאן כדי להעביר את הנושא לתחום זה' : undefined}
                  >
                    {t.label}
                  </button>
                )
              })}
              <CategoriesToolbarActions onReorganizeColors={handleReorganizeColors} onExport={handleExport} onImport={handleImport} />
            </div>

            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#10b981' }}>נושאי הכנסה</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {categories
                    .filter((cat) => cat.type === 'income' && !cat.parentId && inScope(cat))
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
                    .filter((cat) => cat.type === 'expense' && !cat.parentId && inScope(cat))
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
          </>
        )
      })()}

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
                  <div style={{ padding: '0.75rem', background: '#f0f9ff', borderRadius: '0.5rem', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.875rem', color: '#075985' }}>
                      תת-נושא של: <strong>{categories.find((c) => c.id === editingCategory.parentId)?.name}</strong>
                    </span>
                    <button
                      onClick={() => setEditingCategory({ ...editingCategory, parentId: undefined })}
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.3rem 0.6rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #bfdbfe',
                        background: 'white',
                        color: '#075985',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ✕ הסר שיוך
                    </button>
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
                {editingCategory.type === 'expense' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="isDeductible"
                        checked={editingCategory.isDeductible || false}
                        onChange={(e) => {
                          const enabled = e.target.checked
                          if (enabled && !editingCategory.deductibleByMember && householdMembers.length > 0) {
                            const init: Record<string, number> = {}
                            for (const m of householdMembers) init[m.uid] = 100
                            setEditingCategory({ ...editingCategory, isDeductible: true, deductibleByMember: init })
                          } else {
                            setEditingCategory({ ...editingCategory, isDeductible: enabled })
                          }
                        }}
                        style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
                      />
                      <label htmlFor="isDeductible" style={{ fontWeight: 600, cursor: 'pointer' }}>הוצאה מוכרת</label>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>(נכלל בדיווח להוצאות מוכרות לצרכי מס)</span>
                    </div>
                    {editingCategory.isDeductible && (
                      <div style={{ paddingInlineStart: '1.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div style={{ fontSize: '0.85rem', color: '#475569' }}>אחוז ההכרה לכל בן בית (100% = ההוצאה כולה נכללת לאותו אדם):</div>
                        {(householdMembers.length > 0 ? householdMembers : [{ uid: '__self', label: 'אני' }]).map((m) => {
                          const cur = editingCategory.deductibleByMember?.[m.uid]
                          return (
                            <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <label htmlFor={`ded-${m.uid}`} style={{ fontSize: '0.9rem', minWidth: '6rem' }}>{m.label}:</label>
                              <input
                                type="number"
                                id={`ded-${m.uid}`}
                                min={0}
                                max={100}
                                step={1}
                                value={cur ?? ''}
                                placeholder="0"
                                onChange={(e) => {
                                  const raw = e.target.value
                                  const next = { ...(editingCategory.deductibleByMember || {}) }
                                  if (raw === '') {
                                    delete next[m.uid]
                                  } else {
                                    next[m.uid] = Math.max(0, Math.min(100, Math.round(Number(raw))))
                                  }
                                  setEditingCategory({ ...editingCategory, deductibleByMember: next })
                                }}
                                style={{
                                  width: '5rem',
                                  padding: '0.4rem 0.5rem',
                                  borderRadius: '0.4rem',
                                  border: '1px solid #e2e8f0',
                                  fontSize: '0.95rem',
                                  textAlign: 'center',
                                }}
                              />
                              <span style={{ fontSize: '0.9rem', color: '#475569' }}>%</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {editingCategory.businessId && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="checkbox"
                          id="excludeFromBusinessTotals"
                          checked={editingCategory.excludeFromBusinessTotals || false}
                          onChange={(e) => setEditingCategory({ ...editingCategory, excludeFromBusinessTotals: e.target.checked })}
                          style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
                        />
                        <label htmlFor="excludeFromBusinessTotals" style={{ fontWeight: 600, cursor: 'pointer' }}>קיזוז שותפים בלבד</label>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>(הוצאה תקפה אישית, לא נכללת בסיכומי/דוחות העסק — נשארת בקיזוז/התחשבנות שותפים)</span>
                      </div>
                    )}
                    {editingCategory.businessId && editingCategory.excludeFromBusinessTotals && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingRight: '1.6rem' }}>
                        <label htmlFor="settlementPartnerUid" style={{ fontSize: '0.85rem', color: '#475569' }}>
                          שולם לשותף:
                        </label>
                        <select
                          id="settlementPartnerUid"
                          value={editingCategory.settlementPartnerUid || ''}
                          onChange={(e) => setEditingCategory({
                            ...editingCategory,
                            settlementPartnerUid: e.target.value || undefined,
                          })}
                          style={{
                            padding: '0.3rem 0.5rem',
                            fontSize: '0.85rem',
                            border: '1px solid #e2e8f0',
                            borderRadius: '0.25rem',
                            direction: 'rtl',
                          }}
                        >
                          {settlementPartnerOptions.map((p) => (
                            <option key={p.uid} value={p.uid}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
                {editingCategory.businessId && (
                  <div style={{ fontSize: '0.8rem', color: '#64748b', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
                    שיוך: עסק — <strong>{businesses.find(b => b.id === editingCategory.businessId)?.name || editingCategory.businessId}</strong>
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
