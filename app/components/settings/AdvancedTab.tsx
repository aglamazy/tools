'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { db } from '@/app/db/financeDB'
import {
  getCardTypeIndicators,
  setCardTypeIndicators,
} from '@/app/services/appSettingsService'
import {
  clearDirectoryHandle,
  getDirectoryMeta,
  loadDirectoryHandle,
  persistDirectoryHandle,
  requestDirectoryPermission,
} from '@/app/utils/directoryStorage'
import Modal from '../Modal'

export default function AdvancedTab() {
  const [dbStats, setDbStats] = useState<{
    transactions: number
    importedFiles: number
    categories: number
    businessCategories: number
    tasks: number
    appSettings: number
    businesses: number
    projects: number
    harvestTasks: number
    timeEntries: number
  } | null>(null)
  const [cardTypeIndicators, setCardTypeIndicatorsState] = useState<string[]>([])
  const [newIndicator, setNewIndicator] = useState('')
  const [editingIndicator, setEditingIndicator] = useState<{ index: number; value: string } | null>(null)
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [dirError, setDirError] = useState('')
  const [dirMeta, setDirMeta] = useState<{ name: string; savedAt: string } | null>(null)
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' })

  useEffect(() => {
    loadDatabaseStats()
    loadCardTypeIndicators()
    initDirectoryHandle()
  }, [])

  const loadDatabaseStats = async () => {
    try {
      const [
        transactionsCount,
        importedFilesCount,
        categoriesCount,
        businessCategoriesCount,
        tasksCount,
        appSettingsCount,
        businessesCount,
        projectsCount,
        harvestTasksCount,
        timeEntriesCount,
      ] = await Promise.all([
        db.transactions.count(),
        db.importedFiles.count(),
        db.categories.count(),
        db.businessCategories.count(),
        db.tasks.count(),
        db.appSettings.count(),
        db.businesses.count(),
        db.projects.count(),
        db.harvestTasks.count(),
        db.timeEntries.count(),
      ])
      setDbStats({
        transactions: transactionsCount,
        importedFiles: importedFilesCount,
        categories: categoriesCount,
        businessCategories: businessCategoriesCount,
        tasks: tasksCount,
        appSettings: appSettingsCount,
        businesses: businessesCount,
        projects: projectsCount,
        harvestTasks: harvestTasksCount,
        timeEntries: timeEntriesCount,
      })
    } catch (err) {
      console.error('Error loading database stats:', err)
    }
  }

  const loadCardTypeIndicators = async () => {
    try {
      const indicators = await getCardTypeIndicators()
      setCardTypeIndicatorsState(indicators)
    } catch (err) {
      console.error('Error loading card type indicators:', err)
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

  const handleAddIndicator = async () => {
    if (!newIndicator.trim()) return
    const updated = [...cardTypeIndicators, newIndicator.trim()]
    setCardTypeIndicatorsState(updated)
    await setCardTypeIndicators(updated)
    setNewIndicator('')
    setAlertModal({ isOpen: true, message: 'הוסף סוג כרטיס חדש בהצלחה!' })
  }

  const handleRemoveIndicator = async (index: number) => {
    const updated = cardTypeIndicators.filter((_, i) => i !== index)
    setCardTypeIndicatorsState(updated)
    await setCardTypeIndicators(updated)
  }

  const handleEditIndicator = async () => {
    if (!editingIndicator || !editingIndicator.value.trim()) return
    const updated = cardTypeIndicators.map((ind, i) =>
      i === editingIndicator.index ? editingIndicator.value.trim() : ind
    )
    setCardTypeIndicatorsState(updated)
    await setCardTypeIndicators(updated)
    setEditingIndicator(null)
    setAlertModal({ isOpen: true, message: 'עודכן בהצלחה!' })
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

  return (
    <>
      {/* Database Stats */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#f0f9ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>סטטיסטיקות מאגר נתונים</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#075985', fontSize: '0.95rem' }}>
              מידע על כמות הרשומות במאגר הנתונים המקומי
            </p>
            {dbStats && (
              <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem 1rem', fontSize: '0.9rem' }}>
                <div><strong>עסקאות:</strong> {dbStats.transactions.toLocaleString('he-IL')}</div>
                <div><strong>קבצים מיובאים:</strong> {dbStats.importedFiles.toLocaleString('he-IL')}</div>
                <div><strong>קטגוריות:</strong> {dbStats.categories.toLocaleString('he-IL')}</div>
                <div>
                  <Link href="/tools/business-categories" style={{ fontWeight: 700, color: '#0ea5e9' }}>
                    מיפוי עסקים-נושאים
                  </Link>
                  : {dbStats.businessCategories.toLocaleString('he-IL')}
                </div>
                <div><strong>משימות:</strong> {dbStats.tasks.toLocaleString('he-IL')}</div>
                <div><strong>הגדרות:</strong> {dbStats.appSettings.toLocaleString('he-IL')}</div>
                <div><strong>עסקים:</strong> {dbStats.businesses.toLocaleString('he-IL')}</div>
                <div><strong>פרויקטים:</strong> {dbStats.projects.toLocaleString('he-IL')}</div>
                <div><strong>משימות זמן:</strong> {dbStats.harvestTasks.toLocaleString('he-IL')}</div>
                <div><strong>רישומי זמן:</strong> {dbStats.timeEntries.toLocaleString('he-IL')}</div>
              </div>
            )}
          </div>
          <button onClick={loadDatabaseStats} className="file-picker secondary" style={{ flexShrink: 0 }}>
            רענן
          </button>
        </div>
      </section>

      {/* Credit Card Types */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>סוגי כרטיסי אשראי</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#4b5563', fontSize: '0.95rem' }}>
              ניהול טקסטים לזיהוי תשלומי כרטיסי אשראי בחשבון הבנק
            </p>
            <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              כרטיסי אשראי שתמצא במשפחת המערכת: {cardTypeIndicators.join(', ') || 'אין'}
            </p>
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {cardTypeIndicators.map((indicator, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
              }}
            >
              {editingIndicator?.index === index ? (
                <>
                  <input
                    type="text"
                    value={editingIndicator.value}
                    onChange={(e) => setEditingIndicator({ ...editingIndicator, value: e.target.value })}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.95rem',
                      direction: 'rtl',
                    }}
                    placeholder="הזן טקסט לזיהוי..."
                    autoFocus
                  />
                  <button
                    onClick={handleEditIndicator}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.85rem',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setEditingIndicator(null)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.85rem',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: '0.95rem' }}>{indicator}</span>
                  <button
                    onClick={() => setEditingIndicator({ index, value: indicator })}
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
                    onClick={() => handleRemoveIndicator(index)}
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
                </>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem' }}>
            <input
              type="text"
              value={newIndicator}
              onChange={(e) => setNewIndicator(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddIndicator() }}
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: '1px dashed #cbd5e1',
                fontSize: '0.95rem',
                direction: 'rtl',
              }}
              placeholder="הזן סוג כרטיס חדש..."
            />
            <button onClick={handleAddIndicator} className="file-picker" style={{ flexShrink: 0 }}>
              + הוסף
            </button>
          </div>
        </div>
      </section>

      {/* Default Directory */}
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
