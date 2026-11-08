/**
 * Backup size-limit text of the sync card, by uploader tier (aglamazo#461).
 * Mirrors maxBackupBytes(): tier 'owner' has no limit, so it sees no limit text.
 * `tier === null` means the tier claim is still loading — show no limit yet
 * rather than flash the free limit at an owner.
 */
import { maxBackupBytes } from '@/app/services/backupSizeLimit'

function limitMB(tier: string | undefined | null): string | null {
  if (tier === null) return null
  const max = maxBackupBytes(tier)
  if (!Number.isFinite(max)) return null
  return `${max / 1024 / 1024} MB`
}

/** ' / 2.5 MB' after the backup size, or '' when the tier has no limit. */
export function backupSizeLimitSuffix(tier: string | undefined | null): string {
  const mb = limitMB(tier)
  return mb ? ` / ${mb}` : ''
}

export function storageLimitNote(tier: string | undefined | null, isHousehold: boolean): string {
  const encryption = isHousehold
    ? 'הנתונים מוצפנים בסיסמה משותפת למשק הבית.'
    : 'הנתונים מוצפנים בסיסמה שרק אתה יודע.'
  const mb = limitMB(tier)
  return mb ? `מגבלת אחסון בחינם: ${mb}. ${encryption}` : encryption
}
