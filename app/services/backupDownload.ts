import { exportAllStores } from './backupService'

/** Download every store as a local JSON backup file. Throws if the export fails. */
export async function downloadFullBackup(): Promise<void> {
  const backup = await exportAllStores()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `finance-backup-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}
