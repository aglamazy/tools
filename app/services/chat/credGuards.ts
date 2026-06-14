/**
 * Tier-2/3 credential guard helpers for the chat action executor.
 *
 * Extracted from `actionExecutor.ts` to keep that file under the line cap and
 * to colocate the Saliko consent/credential safety logic:
 *
 *  - `assertConsentForTurn` — the C01 "same-turn defense": a server-side
 *    credential save (`set_credentials` / logged-in `set_otp_phone`) requires
 *    Tier-3 consent that existed BEFORE the current action batch. Throws
 *    `SameTurnConsentError` (caught by `executeActions`) when it didn't, which
 *    blocks an LLM reply that bundles `grant_server_creds_consent` + the save
 *    from self-authorizing in one turn.
 *  - `credActionErrorMessage` — maps a thrown action error to a user-facing
 *    Hebrew line: the same-turn block message, the C10 decryption-failure
 *    "re-enter the credential" line (instead of leaking `CREDS_CORRUPTED`), or
 *    a generic error for everything else.
 */

import { CredsCorruptedError } from '@/app/services/security/credEncryption'

/** Thrown by `assertConsentForTurn`; its message is already user-facing Hebrew. */
export class SameTurnConsentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SameTurnConsentError'
  }
}

/**
 * Abort a server-side credential save when consent didn't exist before this
 * turn. `allowed` should be `isAnon || consentExistedBeforeBatch` for the
 * Shufersal path, or `consentExistedBeforeBatch` for the logged-in OTP path.
 */
export function assertConsentForTurn(allowed: boolean, kind: 'shufersal' | 'otp', label?: string): void {
  if (allowed) return
  if (kind === 'shufersal') {
    throw new SameTurnConsentError('כדי לשמור פרטי שופרסל בשרת צריך אישור Tier 3 מפורש בהודעה נפרדת *לפני* שליחת הפרטים. תאמר קודם "אני מאשר Tier 3" / "אני מאשר שמירה בשרת", ובהודעה הבאה שלח את האימייל והסיסמה. לחלופין אפשר שמירה מקומית בלבד דרך הגדרות → חיבורים חיצוניים (Tier 2 — הסיסמה נשארת רק בדפדפן).')
  }
  throw new SameTurnConsentError(`כדי לחבר את ${label} בחשבון רשום צריך אישור Tier 3 מפורש בהודעה נפרדת *לפני* שליחת מספר הטלפון. תאמר קודם "אני מאשר Tier 3" / "אני מאשר שמירה בשרת", ובהודעה הבאה שלח את המספר. לחלופין, חיבור Tier 2 דרך הגדרות → חיבורים חיצוניים שומר את הטלפון רק בדפדפן.`)
}

/** Map a thrown action error to a user-facing chat string (C01 + C10 aware). */
export function credActionErrorMessage(err: unknown): string {
  if (err instanceof SameTurnConsentError) return err.message
  if (err instanceof CredsCorruptedError) {
    return 'לא הצלחתי לפענח את פרטי החיבור השמורים בשרת (ייתכן שהמפתח השתנה). תיכנס להגדרות → חיבורים חיצוניים ותכניס את הפרטים שוב; אם זה חיבור Tier 3, ייתכן שצריך גם לאשר שוב.'
  }
  return `error: ${err instanceof Error ? err.message : String(err)}`
}
