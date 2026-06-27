/**
 * Maps a thrown Firebase error into a stable sync errorCode + Hebrew user message.
 *
 * Firebase Storage signals a permission failure with `storage/unauthorized`;
 * Firestore uses `permission-denied`. Both mean the same thing to the user:
 * they've lost access (signed out, token expired, security rules changed) and
 * must re-authenticate. Previously these landed in the generic 'unknown' bucket
 * and were only console.error'd — invisible to the user. (#104)
 */
export type SyncErrorCode = 'permission-denied' | 'unknown'

export function classifySyncError(err: unknown): { error: string; errorCode: SyncErrorCode } {
  const code = (err as { code?: string } | null)?.code
  if (code === 'storage/unauthorized' || code === 'permission-denied') {
    return { error: 'אין הרשאה לסנכרון — התחבר מחדש', errorCode: 'permission-denied' }
  }
  return { error: 'שגיאה בסנכרון', errorCode: 'unknown' }
}
