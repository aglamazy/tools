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
import {
  getCardTypeIndicators,
  setCardTypeIndicators,
  initializeAppSettings,
  getDriveSyncSettings,
  setDriveSyncSettings,
  type DriveSyncSettings,
} from '@/app/services/appSettingsService'
import { exportAllStores, importAllStores, type BackupData } from '@/app/services/backupService'
import {
  exportBackupToDrive,
  interactiveConnectAndExport,
  clearDriveAuth,
  fetchBackupFromDrive,
  getDriveBackupMetadata,
} from '@/app/services/driveSyncService'
import { config } from '@/app/config'

const DEFAULT_CATEGORIES: Category[] = []

type DriveBackupInfo = {
  fileId?: string
  modifiedTime?: string
  fetchedAt?: string
  error?: string
  loading?: boolean
  storeCounts?: {
    transactions: number
    importedFiles: number
    categories: number
    businessCategories: number
    tasks: number
    appSettings: number
  }
  totalSizeBytes?: number
  backupVersion?: string
  backupTimestamp?: string
}

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
  const [cardTypeIndicators, setCardTypeIndicatorsState] = useState<string[]>([])
  const [newIndicator, setNewIndicator] = useState('')
  const [editingIndicator, setEditingIndicator] = useState<{ index: number; value: string } | null>(null)
  const [driveSyncSettings, setDriveSyncSettingsState] = useState<DriveSyncSettings | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'connecting' | 'saving' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [driveBackupInfo, setDriveBackupInfo] = useState<DriveBackupInfo | null>(null)

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

  const formatTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('he-IL') : '—')

  useEffect(() => {
    loadCategories()
    initDirectoryHandle()
    loadDatabaseStats()
    loadCategoryUsage()
    loadCardTypeIndicators()
    loadDriveSyncSettings()
    initializeAppSettings()
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

  const loadCardTypeIndicators = async () => {
    try {
      const indicators = await getCardTypeIndicators()
      setCardTypeIndicatorsState(indicators)
    } catch (err) {
      console.error('Error loading card type indicators:', err)
    }
  }

  const loadDriveSyncSettings = async () => {
    try {
      const settings = await getDriveSyncSettings()
      setDriveSyncSettingsState(settings)
    } catch (err) {
      console.error('Error loading Drive sync settings:', err)
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

  const persistDriveSyncSettingsSafe = async (settings: DriveSyncSettings) => {
    try {
      setDriveSyncSettingsState(settings)
      await setDriveSyncSettings(settings)
    } catch (err) {
      console.error('Error saving Drive sync settings:', err)
      setAlertModal({ isOpen: true, message: 'שגיאה בשמירת הגדרות הסנכרון' })
    }
  }

  const handleDriveFrequencyChange = async (value: number) => {
    if (!driveSyncSettings) return
    const minMinutes = config.syncIntervalSeconds / 60
    await persistDriveSyncSettingsSafe({
      ...driveSyncSettings,
      frequencyMinutes: minMinutes,
    })
  }

  const handleToggleAutoSync = async () => {
    if (!driveSyncSettings) return
    await persistDriveSyncSettingsSafe({
      ...driveSyncSettings,
      autoSyncEnabled: !driveSyncSettings.autoSyncEnabled,
    })
  }

  const handleConnectDrive = async () => {
    if (!googleClientId) {
      setAlertModal({ isOpen: true, message: 'חסר GOOGLE CLIENT ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID)' })
      return
    }
    if (!driveSyncSettings) return

    setSyncStatus('connecting')
    setSyncMessage('')
    try {
      const result = await interactiveConnectAndExport({
        clientId: googleClientId,
        existingFileId: driveSyncSettings.driveFileId,
        useAppData: true,
        fileName: 'finance-backup.json',
      })

      if (result.success) {
        const updated: DriveSyncSettings = {
          ...driveSyncSettings,
          driveFileId: result.fileId || driveSyncSettings.driveFileId,
          lastSyncAt: new Date().toISOString(),
          remoteModifiedAt: new Date().toISOString(),
          lastSyncError: undefined,
        }
        await persistDriveSyncSettingsSafe(updated)
        setAlertModal({ isOpen: true, message: 'החיבור ל-Google Drive הצליח והגיבוי נשמר!' })
      } else {
        const msg = result.error === 'empty-backup'
          ? 'הגיבוי ריק (אין עסקאות/קבצים). שמירה בוטלה.'
          : 'חיבור ל-Google Drive נכשל. נסה שוב.'
        setSyncStatus('error')
        setSyncMessage(result.error || 'שגיאה לא ידועה')
        setAlertModal({ isOpen: true, message: msg })
      }
    } catch (err: any) {
      console.error('Drive connect failed:', err)
      setSyncStatus('error')
      setSyncMessage(err?.message || 'שגיאה לא ידועה')
      setAlertModal({ isOpen: true, message: 'חיבור ל-Google Drive נכשל. בדוק הרשאות ונסה שוב.' })
    } finally {
      setSyncStatus('idle')
    }
  }

  const handleManualDriveSync = async () => {
    if (!googleClientId) {
      setAlertModal({ isOpen: true, message: 'חסר GOOGLE CLIENT ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID)' })
      return
    }
    if (!driveSyncSettings) return

    setSyncStatus('saving')
    setSyncMessage('')

    // Pull if remote is newer
    const meta = await getDriveBackupMetadata({ clientId: googleClientId, fileId: driveSyncSettings.driveFileId, fileName: 'finance-backup.json' })
    if (meta.success && meta.fileId && meta.modifiedTime) {
      const remoteNewer = !driveSyncSettings.lastSyncAt || new Date(meta.modifiedTime) > new Date(driveSyncSettings.lastSyncAt)
      if (remoteNewer) {
        const pull = await fetchBackupFromDrive({ clientId: googleClientId, fileId: meta.fileId, fileName: 'finance-backup.json' })
        if (pull.success && pull.data) {
          await importAllStores(pull.data as BackupData)
          await persistDriveSyncSettingsSafe({
            ...driveSyncSettings,
            driveFileId: meta.fileId,
            lastSyncAt: new Date().toISOString(),
            remoteModifiedAt: meta.modifiedTime,
            lastSyncError: undefined,
          })
        } else if (pull.error === 'no-token') {
          setAlertModal({ isOpen: true, message: 'נדרש חיבור ל-Google Drive. לחץ על התחברות.' })
          setSyncStatus('idle')
          return
        } else {
          setSyncStatus('error')
          setSyncMessage(pull.error || '')
          setAlertModal({ isOpen: true, message: 'שגיאה בהורדת הגיבוי לפני שמירה.' })
          setSyncStatus('idle')
          return
        }
      }
    }

    const result = await exportBackupToDrive({
      clientId: googleClientId,
      fileId: driveSyncSettings.driveFileId,
      useAppData: true,
      fileName: 'finance-backup.json',
    })

    if (result.success) {
      const updated: DriveSyncSettings = {
        ...driveSyncSettings,
        driveFileId: result.fileId || driveSyncSettings.driveFileId,
        lastSyncAt: new Date().toISOString(),
        remoteModifiedAt: new Date().toISOString(),
        lastSyncError: undefined,
      }
      await persistDriveSyncSettingsSafe(updated)
      setAlertModal({ isOpen: true, message: 'הגיבוי נשמר ל-Google Drive בהצלחה!' })
    } else {
      const msg = result.error === 'no-token'
        ? 'נדרש חיבור ל-Google Drive. לחץ על התחברות.'
        : result.error === 'empty-backup'
          ? 'הגיבוי ריק (אין עסקאות/קבצים). שמירה בוטלה.'
          : 'שגיאה בשמירת הגיבוי ל-Drive.'
      setSyncStatus('error')
      setSyncMessage(result.error || 'unknown-error')
      setAlertModal({ isOpen: true, message: msg })
    }

    setSyncStatus('idle')
  }

  const handleRestoreFromDrive = async () => {
    if (!googleClientId) {
      setAlertModal({ isOpen: true, message: 'חסר GOOGLE CLIENT ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID)' })
      return
    }
    if (!driveSyncSettings) {
      setAlertModal({ isOpen: true, message: 'חסר חיבור ל-Drive או הגדרות סנכרון.' })
      return
    }
    console.log('[DriveRestore] starting restore from Drive', {
      driveFileId: driveSyncSettings?.driveFileId,
      hasClientId: Boolean(googleClientId),
    })
    setSyncStatus('saving')
    setSyncMessage('')
    const result = await fetchBackupFromDrive({
      clientId: googleClientId,
      fileId: driveSyncSettings?.driveFileId,
      fileName: 'finance-backup.json',
    })
    const storeCounts =
      result.data?.stores
        ? {
            transactions: result.data.stores.transactions?.length ?? 0,
            importedFiles: result.data.stores.importedFiles?.length ?? 0,
            categories: result.data.stores.categories?.length ?? 0,
            businessCategories: result.data.stores.businessCategories?.length ?? 0,
            tasks: result.data.stores.tasks?.length ?? 0,
            appSettings: result.data.stores.appSettings?.length ?? 0,
          }
        : null
    const totalIndexedRecords =
      storeCounts == null
        ? 0
        : Object.values(storeCounts).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)
    const hasStoreSnapshots =
      Boolean(result.data?.stores?.subjectStore) || Boolean(result.data?.stores?.historyStore)
    console.log('[DriveRestore] fetch result', {
      success: result.success,
      error: result.error,
      fileId: result.fileId || driveSyncSettings?.driveFileId,
      storeCounts,
      hasData: Boolean(result.data),
      totalIndexedRecords,
      hasStoreSnapshots,
    })

    if (result.success && result.data) {
      try {
        if (totalIndexedRecords === 0 && !hasStoreSnapshots) {
          console.warn('[DriveRestore] backup appears empty; aborting import')
          setSyncStatus('error')
          setSyncMessage('empty-backup')
          setAlertModal({ isOpen: true, message: 'הגיבוי מ-Drive ריק או פגום. שחזור בוטל.' })
          setSyncStatus('idle')
          return
        }
        if ((storeCounts?.transactions ?? 0) === 0 || (storeCounts?.importedFiles ?? 0) === 0) {
          console.warn('[DriveRestore] missing core data (transactions/importedFiles); aborting import')
          setSyncStatus('error')
          setSyncMessage('missing-core-data')
          setAlertModal({
            isOpen: true,
            message: 'קובץ הגיבוי חסר עסקאות או קבצים מיובאים. שחזור בוטל.',
          })
          setSyncStatus('idle')
          return
        }
        await importAllStores(result.data as BackupData)
        await persistDriveSyncSettingsSafe({
          ...driveSyncSettings,
          driveFileId: result.fileId || driveSyncSettings?.driveFileId,
          lastSyncAt: new Date().toISOString(),
          remoteModifiedAt: new Date().toISOString(),
          lastSyncError: undefined,
        })
        console.log('[DriveRestore] import finished', {
          fileId: result.fileId || driveSyncSettings?.driveFileId,
          storeCounts,
        })
        setAlertModal({ isOpen: true, message: 'שוחזר בהצלחה מ-Google Drive!' })
      } catch (err) {
        console.error('Error importing backup from Drive:', err)
        setAlertModal({ isOpen: true, message: 'שגיאה בייבוא הגיבוי מה-Drive.' })
      }
    } else {
      const msg = result.error === 'no-token'
        ? 'נדרש חיבור ל-Google Drive (התחברות + שמירה) לפני שחזור.'
        : result.error === 'no-file'
          ? 'לא נמצא קובץ גיבוי ב-Drive. בצע שמירה פעם אחת ואז נסה שוב.'
          : 'שגיאה בטעינת הגיבוי מה-Drive.'
      setSyncStatus('error')
      setSyncMessage(result.error || 'unknown-error')
      setAlertModal({ isOpen: true, message: msg })
    }

    setSyncStatus('idle')
  }

  const handleDisconnectDrive = async () => {
    if (!driveSyncSettings) return
    clearDriveAuth()
    const updated: DriveSyncSettings = {
      ...driveSyncSettings,
      autoSyncEnabled: false,
      driveFileId: driveSyncSettings.driveFileId,
    }
    await persistDriveSyncSettingsSafe(updated)
    setAlertModal({ isOpen: true, message: 'החיבור נותק. תידרש התחברות מחדש לגיבוי.' })
  }

  const handleCheckDriveBackupInfo = async () => {
    if (!googleClientId) {
      setAlertModal({ isOpen: true, message: 'חסר GOOGLE CLIENT ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID)' })
      return
    }
    if (!driveSyncSettings) {
      setAlertModal({ isOpen: true, message: 'חסר חיבור ל-Drive או הגדרות סנכרון.' })
      return
    }
    setDriveBackupInfo((prev) => ({ ...prev, loading: true, error: undefined }))
    try {
      const meta = await getDriveBackupMetadata({
        clientId: googleClientId,
        fileId: driveSyncSettings.driveFileId,
        fileName: 'finance-backup.json',
      })
      if (meta.success && meta.fileId) {
        // Fetch actual backup content to get store counts
        const backupResult = await fetchBackupFromDrive({
          clientId: googleClientId,
          fileId: meta.fileId,
          fileName: 'finance-backup.json',
        })

        if (backupResult.success && backupResult.data) {
          const backup = backupResult.data as BackupData
          const storeCounts = {
            transactions: backup.stores?.transactions?.length ?? 0,
            importedFiles: backup.stores?.importedFiles?.length ?? 0,
            categories: backup.stores?.categories?.length ?? 0,
            businessCategories: backup.stores?.businessCategories?.length ?? 0,
            tasks: backup.stores?.tasks?.length ?? 0,
            appSettings: backup.stores?.appSettings?.length ?? 0,
          }
          setDriveBackupInfo({
            fileId: meta.fileId,
            modifiedTime: meta.modifiedTime,
            fetchedAt: new Date().toISOString(),
            loading: false,
            storeCounts,
            totalSizeBytes: JSON.stringify(backup).length,
            backupVersion: backup.version,
            backupTimestamp: backup.timestamp,
          })
          console.log('[DriveSync] backup info', { meta, storeCounts, version: backup.version })
        } else {
          setDriveBackupInfo({
            fileId: meta.fileId,
            modifiedTime: meta.modifiedTime,
            fetchedAt: new Date().toISOString(),
            loading: false,
            error: backupResult.error || 'failed-to-fetch-content',
          })
        }
      } else {
        setDriveBackupInfo({
          error: meta.error || 'unknown-error',
          fetchedAt: new Date().toISOString(),
          loading: false,
        })
        setAlertModal({ isOpen: true, message: 'שגיאה באחזור פרטי הגיבוי מ-Drive.' })
      }
    } catch (err: any) {
      console.error('Error checking Drive backup metadata:', err)
      setDriveBackupInfo({
        error: err?.message || 'unknown-error',
        fetchedAt: new Date().toISOString(),
        loading: false,
      })
      setAlertModal({ isOpen: true, message: 'שגיאה באחזור פרטי הגיבוי מ-Drive.' })
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
      return cat.parentId !== deleteConfirm.categoryId;

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

  const handleExportAllData = async () => {
    try {
      const backup = await exportAllStores()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
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
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string
        const backup = JSON.parse(content) as BackupData

        // Validate version
        if (!backup.version || !backup.stores) {
          setAlertModal({ isOpen: true, message: 'פורמט קובץ לא תקין' })
          return
        }

        const storeCounts = {
          transactions: backup.stores.transactions?.length ?? 0,
          importedFiles: backup.stores.importedFiles?.length ?? 0,
          categories: backup.stores.categories?.length ?? 0,
          businessCategories: backup.stores.businessCategories?.length ?? 0,
          tasks: backup.stores.tasks?.length ?? 0,
          appSettings: backup.stores.appSettings?.length ?? 0,
        }
        console.log('[BackupRestore] local import candidate', storeCounts)
        if (storeCounts.transactions === 0 || storeCounts.importedFiles === 0) {
          setAlertModal({
            isOpen: true,
            message: 'קובץ הגיבוי חסר עסקאות או קבצים מיובאים. שחזור בוטל.',
          })
          return
        }

        // Import all data
        await importAllStores(backup)

        // Update categories in UI
        if (backup.stores.subjectStore?.categories) {
          setCategories(backup.stores.subjectStore.categories)
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

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#ecfdf3' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>☁️ סנכרון ל-Google Drive</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#166534', fontSize: '0.95rem' }}>
              גיבוי שקט לתיקיית appData בחשבון Google Drive שלך. הנתונים לא יוצאים מהדפדפן חוץ מהעברה המאובטחת ל-Drive.
            </p>
            {!googleClientId && (
              <p style={{ margin: '0.35rem 0 0', color: '#b91c1c', fontSize: '0.9rem' }}>
                חסר NEXT_PUBLIC_GOOGLE_CLIENT_ID בקובץ הסביבה. הוסף Client ID כדי להתחבר.
              </p>
            )}
            {driveSyncSettings?.lastSyncAt && (
              <p style={{ margin: '0.35rem 0 0', color: '#065f46', fontSize: '0.9rem' }}>
                סנכרון אחרון: {new Date(driveSyncSettings.lastSyncAt).toLocaleString('he-IL')}
              </p>
            )}
            {driveSyncSettings?.lastSyncError && (
              <p style={{ margin: '0.35rem 0 0', color: '#b91c1c', fontSize: '0.9rem' }}>
                שגיאה אחרונה: {driveSyncSettings.lastSyncError}
              </p>
            )}
            {syncMessage && (
              <p style={{ margin: '0.35rem 0 0', color: '#b91c1c', fontSize: '0.9rem' }}>
                {syncMessage}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              onClick={handleConnectDrive}
              className="file-picker"
              style={{ background: '#0ea5e9', color: 'white' }}
              disabled={syncStatus !== 'idle'}
            >
              🔐 התחברות + שמירה
            </button>
            <button
              onClick={handleManualDriveSync}
              className="file-picker"
              style={{ background: '#10b981', color: 'white' }}
              disabled={syncStatus !== 'idle'}
            >
              💾 שמור עכשיו
            </button>
            <button
              onClick={handleRestoreFromDrive}
              className="file-picker"
              style={{ background: '#f97316', color: 'white' }}
              disabled={syncStatus !== 'idle'}
            >
              ♻️ שחזר מגיבוי
            </button>
            <button
              onClick={handleDisconnectDrive}
              className="file-picker secondary"
              style={{ background: '#e5e7eb', color: '#111827' }}
            >
              ⏏️ נתק חיבור
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
            <input
              type="checkbox"
              checked={driveSyncSettings?.autoSyncEnabled ?? false}
              onChange={handleToggleAutoSync}
            />
            הפעל סנכרון אוטומטי (ברירת מחדל {config.syncIntervalSeconds / 60} דק')
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.95rem' }}>תדירות (דקות):</span>
            <input
              type="number"
              min={config.syncIntervalSeconds / 60}
              value={driveSyncSettings?.frequencyMinutes ?? config.syncIntervalSeconds / 60}
              onChange={(e) => handleDriveFrequencyChange(Number(e.target.value))}
              style={{ width: '90px', padding: '0.35rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', direction: 'ltr' }}
            />
          </div>
          {driveSyncSettings?.driveFileId && (
            <span style={{ fontSize: '0.85rem', color: '#475569' }}>
              מזהה קובץ: {driveSyncSettings.driveFileId}
            </span>
          )}
          <span style={{ fontSize: '0.9rem', color: '#111827' }}>
            מקומי: {formatTime(driveSyncSettings?.lastSyncAt)} | Drive: {formatTime(driveSyncSettings?.remoteModifiedAt)}
          </span>
          {syncStatus !== 'idle' && (
            <span style={{ fontSize: '0.9rem', color: '#2563eb' }}>
              מצב: {syncStatus === 'connecting' ? 'מתחבר...' : syncStatus === 'saving' ? 'שומר...' : 'שגיאה'}
            </span>
          )}
        </div>

        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.95rem', color: '#0f172a' }}>
              מידע על קובץ הגיבוי ב-Drive
            </div>
            <button
              onClick={handleCheckDriveBackupInfo}
              className="file-picker secondary"
              style={{ flexShrink: 0 }}
              disabled={syncStatus !== 'idle'}
            >
              🔍 בדוק קובץ ב-Drive
            </button>
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#111827' }}>
            <div>מזהה קובץ: {driveBackupInfo?.fileId || driveSyncSettings?.driveFileId || '—'}</div>
            <div>עודכן ב-Drive: {formatTime(driveBackupInfo?.modifiedTime || driveSyncSettings?.remoteModifiedAt)}</div>
            <div>בדיקה אחרונה: {formatTime(driveBackupInfo?.fetchedAt)}</div>
            {driveBackupInfo?.backupVersion && (
              <div>גרסת גיבוי: {driveBackupInfo.backupVersion} | נוצר: {formatTime(driveBackupInfo.backupTimestamp)}</div>
            )}
            {driveBackupInfo?.totalSizeBytes && (
              <div>גודל: {(driveBackupInfo.totalSizeBytes / 1024).toFixed(1)} KB</div>
            )}
            {driveBackupInfo?.storeCounts && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#e0f2fe', borderRadius: '0.375rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>תוכן הגיבוי:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem' }}>
                  <span>עסקאות: {driveBackupInfo.storeCounts.transactions.toLocaleString('he-IL')}</span>
                  <span>קבצים: {driveBackupInfo.storeCounts.importedFiles.toLocaleString('he-IL')}</span>
                  <span>קטגוריות: {driveBackupInfo.storeCounts.categories.toLocaleString('he-IL')}</span>
                  <span>מיפוי עסקים: {driveBackupInfo.storeCounts.businessCategories.toLocaleString('he-IL')}</span>
                  <span>משימות: {driveBackupInfo.storeCounts.tasks.toLocaleString('he-IL')}</span>
                  <span>הגדרות: {driveBackupInfo.storeCounts.appSettings.toLocaleString('he-IL')}</span>
                </div>
              </div>
            )}
            {driveBackupInfo?.loading && <div style={{ color: '#2563eb' }}>טוען פרטי גיבוי...</div>}
            {driveBackupInfo?.error && <div style={{ color: '#b91c1c' }}>שגיאה: {driveBackupInfo.error}</div>}
          </div>
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

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>🏦 סוגי כרטיסי אשראי</h2>
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
                    onChange={(e) =>
                      setEditingIndicator({ ...editingIndicator, value: e.target.value })
                    }
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
                    ✏️
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
                    🗑️
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddIndicator()
                }
              }}
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
            <button
              onClick={handleAddIndicator}
              className="file-picker"
              style={{ flexShrink: 0 }}
            >
              + הוסף
            </button>
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
