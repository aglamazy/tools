'use client'

import React, { useState } from 'react'
import { exportAllStores, importAllStores, type BackupData } from '@/app/services/backupService'
import { applyCloudBackup } from '@/app/services/applyMergedBackupService'
import YesNoModal from '../YesNoModal'
import Modal from '../Modal'
import CloudSyncSection from './sync/CloudSyncSection'
import LocalBackup from './sync/LocalBackup'

export default function SyncTab() {
  const [importConfirm, setImportConfirm] = useState<{ isOpen: boolean; file: File | null }>({ isOpen: false, file: null })
  const [mergeConfirm, setMergeConfirm] = useState<{ isOpen: boolean; file: File | null }>({ isOpen: false, file: null })
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' })

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
    event.target.value = ''
  }

  const confirmImport = () => {
    if (!importConfirm.file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string
        const backup = JSON.parse(content) as BackupData

        if (!backup.version || !backup.stores) {
          setAlertModal({ isOpen: true, message: 'פורמט קובץ לא תקין' })
          return
        }

        const storeCounts = {
          transactions: backup.stores.transactions?.length ?? 0,
          importedFiles: backup.stores.importedFiles?.length ?? 0,
        }
        console.log('[BackupRestore] local import candidate', storeCounts)

        if (storeCounts.transactions === 0 || storeCounts.importedFiles === 0) {
          setAlertModal({ isOpen: true, message: 'קובץ הגיבוי חסר עסקאות או קבצים מיובאים. שחזור בוטל.' })
          return
        }

        await importAllStores(backup)
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

  const handleMergeImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMergeConfirm({ isOpen: true, file })
    event.target.value = ''
  }

  const confirmMergeImport = () => {
    if (!mergeConfirm.file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string
        const backup = JSON.parse(content) as BackupData

        if (!backup.version || !backup.stores) {
          setAlertModal({ isOpen: true, message: 'פורמט קובץ לא תקין' })
          return
        }

        await applyCloudBackup(backup)
        setMergeConfirm({ isOpen: false, file: null })
        setAlertModal({ isOpen: true, message: 'הנתונים מוזגו בהצלחה! הדף יטען מחדש.' })
        setTimeout(() => window.location.reload(), 1500)
      } catch (err) {
        console.error('Error merging backup file:', err)
        setAlertModal({ isOpen: true, message: 'שגיאה במיזוג הקובץ' })
      }
    }
    reader.readAsText(mergeConfirm.file)
  }

  return (
    <>
      <CloudSyncSection />

      <LocalBackup onExport={handleExportAllData} onImport={handleImportAllData} onMergeImport={handleMergeImportData} />

      <YesNoModal
        isOpen={importConfirm.isOpen}
        question="ייבוא נתונים ימחק את כל הנתונים הקיימים. האם להמשיך?"
        onYes={confirmImport}
        onNo={() => setImportConfirm({ isOpen: false, file: null })}
      />

      <YesNoModal
        isOpen={mergeConfirm.isOpen}
        question="מיזוג הקובץ יוסיף/יעדכן נתונים מהקובץ בלי למחוק נתונים קיימים. האם להמשיך?"
        onYes={confirmMergeImport}
        onNo={() => setMergeConfirm({ isOpen: false, file: null })}
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
