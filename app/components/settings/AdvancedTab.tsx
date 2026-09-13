'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { routes } from '@/app/config'
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
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { ALL_PAGES } from '@/app/lib/pageRegistry'
import Modal from '../Modal'
import {
  mergeDuplicateSuppliers,
  mergeSupplierEmptyEmailDuplicates,
  deleteCategoryById,
  deleteTransactionById,
  deleteConfirmedDuplicateTransaction,
  type SupplierMergeResult,
  type SupplierEmailSubsetMergeResult,
} from '@/app/services/duplicateCleanupService'

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
  const [defaultPage, setDefaultPage] = useState<string>('home')
  // aglamazo#364/#365 supplier merge + stray-transaction delete — uncontested,
  // covered by Agla's "go" (oct_message #44942).
  const [mergeArmed, setMergeArmed] = useState(false)
  const [mergeRunning, setMergeRunning] = useState(false)
  const [mergeResult, setMergeResult] = useState<{
    suppliers: SupplierMergeResult
    transactionDeleted: boolean
  } | null>(null)
  // general#48 תשתיות duplicate delete — kept as its own separate confirm,
  // deliberately NOT bundled with the merge above: general#48 was still
  // stalled awaiting Agla's own explicit confirm (Sheli, 2026-09-11) even
  // though her recommendation matches this action. A shared button would
  // hide that this specific delete is its own decision.
  const [categoryArmed, setCategoryArmed] = useState(false)
  const [categoryRunning, setCategoryRunning] = useState(false)
  const [categoryResult, setCategoryResult] = useState<boolean | null>(null)
  // aglamazo#364 second pass — the 16 groups/31 rows the strict-match merge
  // above deliberately left behind (Sheli, 2026-09-11): one populated
  // emailSenders copy + empty duplicates, strict-subset only.
  const [emailMergeArmed, setEmailMergeArmed] = useState(false)
  const [emailMergeRunning, setEmailMergeRunning] = useState(false)
  const [emailMergeResult, setEmailMergeResult] = useState<SupplierEmailSubsetMergeResult | null>(null)
  // aglamazo#370 — duplicate Anthropic charge (bank export itemized a
  // card-level line the card statement PDF also carries). Sheli/Agla
  // decided: keep tx 1859 (card statement), delete tx 1473 (bank export).
  const [dupTxArmed, setDupTxArmed] = useState(false)
  const [dupTxRunning, setDupTxRunning] = useState(false)
  const [dupTxResult, setDupTxResult] = useState<{ deleted: boolean; reason?: string } | null>(null)

  useEffect(() => {
    loadDatabaseStats()
    loadCardTypeIndicators()
    initDirectoryHandle()
    appSettingsStore.getDefaultPage().then(p => setDefaultPage(p || 'home'))
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

  // aglamazo#364/#365 — one-time cleanup authorized by Agla (oct_message
  // #44942 "go"), backup taken first (~/finance/aglamazo-backup-20260911-092518):
  // merge the 1,176 duplicate Supplier rows from the 2026-07-13/14 seed
  // race, and remove the one stray transaction (id 2081) re-created this
  // morning by #362's false import-gap bug. Not a generic sweep — these are
  // the exact targets Sheli and Agla agreed on.
  const runSupplierMerge = async () => {
    setMergeRunning(true)
    try {
      const suppliers = await mergeDuplicateSuppliers()
      const transactionDeleted = await deleteTransactionById(2081)
      setMergeResult({ suppliers, transactionDeleted })
      setMergeArmed(false)
      await loadDatabaseStats()
    } catch (err) {
      console.error('Error running supplier merge cleanup:', err)
      setAlertModal({ isOpen: true, message: 'הניקוי נכשל, ראה קונסולה לפרטים.' })
    } finally {
      setMergeRunning(false)
    }
  }

  // general#48 — kept as its own separate action (see state comment above).
  const runCategoryDuplicateDelete = async () => {
    setCategoryRunning(true)
    try {
      const deleted = await deleteCategoryById('custom-1783667477656')
      setCategoryResult(deleted)
      setCategoryArmed(false)
      await loadDatabaseStats()
    } catch (err) {
      console.error('Error deleting duplicate תשתיות category:', err)
      setAlertModal({ isOpen: true, message: 'המחיקה נכשלה, ראה קונסולה לפרטים.' })
    } finally {
      setCategoryRunning(false)
    }
  }

  const runSupplierEmailSubsetMerge = async () => {
    setEmailMergeRunning(true)
    try {
      const result = await mergeSupplierEmptyEmailDuplicates()
      setEmailMergeResult(result)
      setEmailMergeArmed(false)
      await loadDatabaseStats()
    } catch (err) {
      console.error('Error running supplier email-subset merge:', err)
      setAlertModal({ isOpen: true, message: 'הניקוי נכשל, ראה קונסולה לפרטים.' })
    } finally {
      setEmailMergeRunning(false)
    }
  }

  const runDuplicateTransactionDelete = async () => {
    setDupTxRunning(true)
    try {
      const result = await deleteConfirmedDuplicateTransaction(1473, {
        merchantContains: 'ANTHROPIC* CLAUDE SU',
        amount: -517.69,
        fileId: '1783794855524-FibiSave1783794113095.xls',
      })
      setDupTxResult(result)
      setDupTxArmed(false)
      await loadDatabaseStats()
    } catch (err) {
      console.error('Error deleting duplicate Anthropic transaction:', err)
      setAlertModal({ isOpen: true, message: 'המחיקה נכשלה, ראה קונסולה לפרטים.' })
    } finally {
      setDupTxRunning(false)
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

  const handleDefaultPageChange = async (pageId: string) => {
    setDefaultPage(pageId)
    await appSettingsStore.setDefaultPage(pageId === 'home' ? null : pageId)
  }

  return (
    <>
      {/* Default Page */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#f0fdf4' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>עמוד ברירת מחדל</h2>
        <p style={{ margin: '0.25rem 0 0.75rem', color: '#166534', fontSize: '0.95rem' }}>
          בחר את העמוד שייפתח כשנכנסים לאפליקציה
        </p>
        <select
          value={defaultPage}
          onChange={e => handleDefaultPageChange(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.95rem', minWidth: '200px' }}
        >
          {ALL_PAGES.map(page => (
            <option key={page.id} value={page.id}>
              {page.icon} {page.label}
            </option>
          ))}
        </select>
      </section>

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
                  <Link href={routes.businessCategories} style={{ fontWeight: 700, color: '#0ea5e9' }}>
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

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #fca5a5', borderRadius: '0.75rem', background: '#fef2f2' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>מיזוג ספקים כפולים (#364/#365)</h2>
        <p style={{ margin: '0.25rem 0 0', color: '#7f1d1d', fontSize: '0.9rem' }}>
          מאחד כפילויות ספקים שנוצרו במרוץ מקבילי ב-13-14/7 (רק שורות זהות לחלוטין; שורות שנבדלות
          בפרט כלשהו מדווחות ולא נמזגות), ומוחק את עסקת ה-16.22 הכפולה שנוצרה הבוקר. פעולה מאושרת
          ומגובה מראש; מריצים פעם אחת בלבד.
        </p>
        {!mergeResult && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!mergeArmed ? (
              <button onClick={() => setMergeArmed(true)} className="file-picker secondary">
                הכן ניקוי
              </button>
            ) : (
              <>
                <span style={{ color: '#7f1d1d', fontSize: '0.9rem' }}>בטוח? הפעולה בלתי הפיכה.</span>
                <button onClick={runSupplierMerge} disabled={mergeRunning} className="upload-another-btn">
                  {mergeRunning ? 'מריץ...' : 'אשר והרץ ניקוי'}
                </button>
                <button onClick={() => setMergeArmed(false)} className="file-picker secondary">
                  ביטול
                </button>
              </>
            )}
          </div>
        )}
        {mergeResult && (
          <div style={{ marginTop: '0.75rem', color: '#166534', fontSize: '0.9rem' }}>
            <p style={{ margin: 0 }}>
              ספקים: נבדקו {mergeResult.suppliers.groupsExamined} קבוצות, אוחדו {mergeResult.suppliers.groupsMerged},
              נמחקו {mergeResult.suppliers.rowsDeleted} שורות כפולות.
            </p>
            {mergeResult.suppliers.skippedNonIdentical.length > 0 && (
              <div style={{ margin: '0.5rem 0 0', color: '#92400e' }}>
                <p style={{ margin: 0 }}>
                  דילוג ({mergeResult.suppliers.skippedNonIdentical.length} ספקים לא זהים לחלוטין — טעונים בדיקה ידנית):
                </p>
                <ul style={{ margin: '0.25rem 0 0', paddingInlineStart: '1.25rem' }}>
                  {mergeResult.suppliers.skippedNonIdentical.map((g) => (
                    <li key={g.variants.map((v) => v.id).join('-')}>
                      {g.name} — שורות {g.variants.map((v) => v.id).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p style={{ margin: '0.25rem 0 0' }}>
              עסקת 2081 כפולה: {mergeResult.transactionDeleted ? 'נמחקה' : 'לא נמצאה (כבר טופלה?)'}.
            </p>
          </div>
        )}
      </section>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #fca5a5', borderRadius: '0.75rem', background: '#fef2f2' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>מחיקת קטגוריית &quot;תשתיות&quot; כפולה (general#48)</h2>
        <p style={{ margin: '0.25rem 0 0', color: '#7f1d1d', fontSize: '0.9rem' }}>
          מוחק את שורת הקטגוריה הכפולה שאינה מוכרת (custom-1783667477656), ומשאיר את השורה המוכרת
          (custom-1783794975843) כשורה היחידה. פעולה נפרדת מכוונת: general#48 ממתין עדיין לאישור
          מפורש שלך על מחיקה זו ספציפית — אל תריץ עד שאתה בטוח שזו ההחלטה.
        </p>
        {categoryResult === null && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!categoryArmed ? (
              <button onClick={() => setCategoryArmed(true)} className="file-picker secondary">
                הכן מחיקה
              </button>
            ) : (
              <>
                <span style={{ color: '#7f1d1d', fontSize: '0.9rem' }}>בטוח? הפעולה בלתי הפיכה.</span>
                <button onClick={runCategoryDuplicateDelete} disabled={categoryRunning} className="upload-another-btn">
                  {categoryRunning ? 'מוחק...' : 'אשר ומחק'}
                </button>
                <button onClick={() => setCategoryArmed(false)} className="file-picker secondary">
                  ביטול
                </button>
              </>
            )}
          </div>
        )}
        {categoryResult !== null && (
          <p style={{ marginTop: '0.75rem', color: '#166534', fontSize: '0.9rem' }}>
            קטגוריית תשתיות כפולה: {categoryResult ? 'נמחקה' : 'לא נמצאה (כבר טופלה?)'}.
          </p>
        )}
      </section>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #fca5a5', borderRadius: '0.75rem', background: '#fef2f2' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>מיזוג ספקים עם emailSenders חלקי (#364 המשך)</h2>
        <p style={{ margin: '0.25rem 0 0', color: '#7f1d1d', fontSize: '0.9rem' }}>
          16 קבוצות/31 שורות שהמיזוג הראשי דילג עליהן: עותק אחד עם emailSenders מלא, השאר ריקים.
          שומר את העותק המלא, מוחק את הריקים בלבד. אם יש שני עותקים מלאים עם ערכים שונים — מדלג
          ומדווח, לא מנחש. כולל את קבוצת ה-AgentsHead/Bubble Labs (ANTHROPIC, VERCEL וכו&apos;) שסהלי
          צריכה תקינה לשלב 3 בטופס.
        </p>
        {!emailMergeResult && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!emailMergeArmed ? (
              <button onClick={() => setEmailMergeArmed(true)} className="file-picker secondary">
                הכן ניקוי
              </button>
            ) : (
              <>
                <span style={{ color: '#7f1d1d', fontSize: '0.9rem' }}>בטוח? הפעולה בלתי הפיכה.</span>
                <button onClick={runSupplierEmailSubsetMerge} disabled={emailMergeRunning} className="upload-another-btn">
                  {emailMergeRunning ? 'מריץ...' : 'אשר והרץ ניקוי'}
                </button>
                <button onClick={() => setEmailMergeArmed(false)} className="file-picker secondary">
                  ביטול
                </button>
              </>
            )}
          </div>
        )}
        {emailMergeResult && (
          <div style={{ marginTop: '0.75rem', color: '#166534', fontSize: '0.9rem' }}>
            <p style={{ margin: 0 }}>
              נבדקו {emailMergeResult.groupsExamined} קבוצות, אוחדו {emailMergeResult.groupsMerged}, נמחקו{' '}
              {emailMergeResult.rowsDeleted} שורות כפולות.
            </p>
            {emailMergeResult.skippedAmbiguous.length > 0 && (
              <div style={{ margin: '0.5rem 0 0', color: '#92400e' }}>
                <p style={{ margin: 0 }}>
                  דילוג ({emailMergeResult.skippedAmbiguous.length} ספקים עם שני עותקים מלאים שונים — לבדיקה ידנית):
                </p>
                <ul style={{ margin: '0.25rem 0 0', paddingInlineStart: '1.25rem' }}>
                  {emailMergeResult.skippedAmbiguous.map((g) => (
                    <li key={g.variants.map((v) => v.id).join('-')}>
                      {g.name} — שורות {g.variants.map((v) => v.id).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #fca5a5', borderRadius: '0.75rem', background: '#fef2f2' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>מחיקת עסקת Anthropic כפולה (aglamazo#370)</h2>
        <p style={{ margin: '0.25rem 0 0', color: '#7f1d1d', fontSize: '0.9rem' }}>
          אותה חיוב בדיוק (517.69, 10/06/2026) מופיע פעמיים: פעם אחת מייבוא הבנק (שורה 1473,
          נתפס כפריט ברמת הכרטיס) ופעם מייבוא דוח האשראי עצמו (שורה 1859, המחרוזת המלאה). מוחק
          את 1473 בלבד, לאחר בדיקה שהספק/סכום/קובץ המקור עדיין תואמים למה שאומת — אם השורה
          השתנתה מאז, המחיקה מסרבת ומסבירה למה במקום למחוק בטעות.
        </p>
        {!dupTxResult && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!dupTxArmed ? (
              <button onClick={() => setDupTxArmed(true)} className="file-picker secondary">
                הכן מחיקה
              </button>
            ) : (
              <>
                <span style={{ color: '#7f1d1d', fontSize: '0.9rem' }}>בטוח? הפעולה בלתי הפיכה.</span>
                <button onClick={runDuplicateTransactionDelete} disabled={dupTxRunning} className="upload-another-btn">
                  {dupTxRunning ? 'מוחק...' : 'אשר ומחק'}
                </button>
                <button onClick={() => setDupTxArmed(false)} className="file-picker secondary">
                  ביטול
                </button>
              </>
            )}
          </div>
        )}
        {dupTxResult && (
          <p style={{ marginTop: '0.75rem', color: dupTxResult.deleted ? '#166534' : '#92400e', fontSize: '0.9rem' }}>
            {dupTxResult.deleted
              ? 'עסקה 1473 נמחקה.'
              : `לא נמחקה: ${dupTxResult.reason}`}
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
