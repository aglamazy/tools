'use client'

import React, { useEffect, useState } from 'react'
import Modal from '../Modal'
import YesNoModal from '../YesNoModal'
import BusinessCard from './BusinessCard'
import BusinessForm from './BusinessForm'
import { BusinessType } from '@/app/types/business'
import type { BusinessUI } from '@/app/types/business'
import { businessStore } from '@/app/stores/businessStore'

export default function BusinessesTab() {
  const [businesses, setBusinesses] = useState<BusinessUI[]>([])
  const [editingBusiness, setEditingBusiness] = useState<BusinessUI | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: number | null }>({ isOpen: false, id: null })
  const [alertMessage, setAlertMessage] = useState('')

  useEffect(() => {
    void loadBusinesses()
  }, [])

  const sortBusinesses = (items: BusinessUI[]) =>
    [...items].sort((a, b) => a.name.localeCompare(b.name, 'he'))

  const loadBusinesses = async () => {
    try {
      const stored = await businessStore.getAll()
      const normalized = stored
        .map((b) => {
          if (typeof b.id !== 'number') return null
          return {
            id: b.id as number,
            name: b.name,
            type: b.type,
            vatType: b.vatType,
            isTaxFree: b.isTaxFree,
            pinnedToSidebar: b.pinnedToSidebar,
          } as BusinessUI
        })
        .filter((b): b is BusinessUI => Boolean(b))
      setBusinesses(sortBusinesses(normalized))
      setAlertMessage('')
    } catch (err) {
      console.error('Error loading businesses:', err)
      setAlertMessage('שגיאה בטעינת רשימת העסקים')
    }
  }

  const handleAdd = () => {
    setEditingBusiness({
      id: Date.now(),
      name: '',
      type: BusinessType.Business,
    })
    setIsAddingNew(true)
    setAlertMessage('')
  }

  const handleEdit = (business: BusinessUI) => {
    setEditingBusiness({
      ...business,
    })
    setIsAddingNew(false)
    setAlertMessage('')
  }

  const handleSave = async () => {
    if (!editingBusiness || !editingBusiness.name.trim()) {
      setAlertMessage('שם העסק נדרש')
      return
    }

    const trimmed: BusinessUI = {
      ...editingBusiness,
      name: editingBusiness.name.trim(),
    }

    try {
      if (isAddingNew) {
        const id = await businessStore.add({
          name: trimmed.name,
          type: trimmed.type,
          vatType: trimmed.vatType,
          isTaxFree: trimmed.isTaxFree,
          btlAdvancePayment: trimmed.btlAdvancePayment,
          taxOrder: trimmed.taxOrder,
          pinnedToSidebar: true,
        })
        if (id == null) {
          setAlertMessage('שמירת העסק נכשלה')
          return
        }
        setBusinesses(sortBusinesses([...businesses, { ...trimmed, id }]))
      } else {
        const updated = await businessStore.update(trimmed.id, {
          name: trimmed.name,
          type: trimmed.type,
          vatType: trimmed.vatType,
          isTaxFree: trimmed.isTaxFree,
          btlAdvancePayment: trimmed.btlAdvancePayment,
          taxOrder: trimmed.taxOrder,
        })
        if (!updated) {
          setAlertMessage('עדכון העסק נכשל')
          return
        }
        setBusinesses(sortBusinesses(businesses.map((b) => (b.id === trimmed.id ? trimmed : b))))
      }
      setEditingBusiness(null)
      setIsAddingNew(false)
      setAlertMessage('')
    } catch (err) {
      console.error('Error saving business:', err)
      setAlertMessage('שמירת העסק נכשלה')
    }
  }

  const handleDelete = (id: number) => {
    setDeleteConfirm({ isOpen: true, id })
    setAlertMessage('')
  }

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    try {
      const deleted = await businessStore.delete(deleteConfirm.id)
      if (deleted) {
        setBusinesses(businesses.filter((b) => b.id !== deleteConfirm.id))
      } else {
        setAlertMessage('מחיקת העסק נכשלה')
      }
    } catch (err) {
      console.error('Error deleting business:', err)
      setAlertMessage('מחיקת העסק נכשלה')
    }
    setDeleteConfirm({ isOpen: false, id: null })
  }

  const handleTogglePin = async (business: BusinessUI) => {
    try {
      const newPinned = !business.pinnedToSidebar
      const updated = await businessStore.update(business.id, { pinnedToSidebar: newPinned })
      if (!updated) {
        setAlertMessage('עדכון העסק נכשל')
        return
      }
      setBusinesses(sortBusinesses(businesses.map((b) =>
        b.id === business.id ? { ...b, pinnedToSidebar: newPinned } : b
      )))
      // Notify sidebar to refresh
      window.dispatchEvent(new CustomEvent('sidebar-refresh'))
    } catch (err) {
      console.error('Error toggling pin:', err)
      setAlertMessage('עדכון העסק נכשל')
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>עסקים</h2>
        <button onClick={handleAdd} className="file-picker">
          + הוסף עסק
        </button>
      </div>

      {alertMessage && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecdd3' }}>
          {alertMessage}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {businesses.map((business) => (
          <BusinessCard
            key={business.id}
            business={business}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
          />
        ))}

        {businesses.length === 0 && (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#64748b',
            background: '#f8fafc',
            borderRadius: '0.75rem',
            border: '1px dashed #cbd5e1',
          }}>
            <p>אין עסקים מוגדרים. הוסף עסק חדש כדי להתחיל.</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={!!editingBusiness}
        onClose={() => setEditingBusiness(null)}
        maxWidth="550px"
      >
        {editingBusiness && (
          <BusinessForm
            business={editingBusiness}
            onChange={setEditingBusiness}
            onSave={handleSave}
            onCancel={() => setEditingBusiness(null)}
            isNew={isAddingNew}
          />
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <YesNoModal
        isOpen={deleteConfirm.isOpen}
        question="האם אתה בטוח שברצונך למחוק את העסק?"
        yesText="מחק"
        noText="ביטול"
        onYes={confirmDelete}
        onNo={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </>
  )
}
