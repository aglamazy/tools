/**
 * Maps a thrown Firebase error into a stable sync errorCode + Hebrew user message.
 *
 * Firebase Storage signals a rules refusal with `storage/unauthorized` (HTTP
 * 403); Firestore uses `permission-denied`. That is the SERVER refusing access,
 * not a signed-out user — telling the user to re-login is wrong, and the
 * encryption password is untouched (aglamazo#461). Only a missing/expired auth
 * token (`storage/unauthenticated`, Firestore `unauthenticated`) means
 * "sign in again". Previously all of these landed in 'unknown' and were only
 * console.error'd — invisible to the user. (#104)
 */
export type SyncErrorCode = 'permission-denied' | 'not-authenticated' | 'unknown'

/** Shown whenever the server refuses a read/write of the backup (403). */
export const BACKUP_ACCESS_DENIED_MESSAGE =
  'השרת סירב לגישה לגיבוי. הסיסמה שלך לא השתנתה; נסה שוב מאוחר יותר.'

/** Shown when the backup could not be reached for any other reason (network, quota, retries). */
export const BACKUP_UNREACHABLE_MESSAGE =
  'לא ניתן להגיע לגיבוי בענן. הסיסמה שלך לא השתנתה; נסה שוב מאוחר יותר.'

export const RELOGIN_MESSAGE = 'פג תוקף ההתחברות — התחבר מחדש'

export function classifySyncError(err: unknown): { error: string; errorCode: SyncErrorCode } {
  const code = (err as { code?: string } | null)?.code
  if (code === 'storage/unauthorized' || code === 'permission-denied') {
    return { error: BACKUP_ACCESS_DENIED_MESSAGE, errorCode: 'permission-denied' }
  }
  if (code === 'storage/unauthenticated' || code === 'unauthenticated') {
    return { error: RELOGIN_MESSAGE, errorCode: 'not-authenticated' }
  }
  return { error: 'שגיאה בסנכרון', errorCode: 'unknown' }
}

/**
 * Same as classifySyncError, but for reads of the backup/verification files:
 * an unclassified failure is "could not reach the backup", never a generic error
 * the UI might mistake for "no password set up" or "wrong password".
 */
export function classifyBackupReadError(err: unknown): { error: string; errorCode: SyncErrorCode } {
  const classified = classifySyncError(err)
  if (classified.errorCode === 'unknown') {
    return { error: BACKUP_UNREACHABLE_MESSAGE, errorCode: 'unknown' }
  }
  return classified
}
