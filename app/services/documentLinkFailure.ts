/**
 * aglamazo#489: why a mail's document link gave no PDF, in words that say
 * what to do. Measured on Agla's XPlace mail: the one URL tried
 * (https://www.xplace.com/invoice/pdf/256484) redirected to /signin and
 * ended on 200 text/html — a login page, not a missing file. "Needs a login"
 * and "not a PDF" are different instructions, so they get different messages.
 */
export type LinkAttempt = {
  url: string
  finalUrl?: string
  status: number
  contentType: string
}

export type LinkFailure = {
  code: 'needs-login' | 'not-pdf' | 'http-error'
  message: string
}

const LOGIN_PATH = /\/(sign-?in|log-?in|auth|account\/login|users\/sign_in)\b/i

function hostOf(u: string): string {
  try { return new URL(u).host.replace(/^www\./, '') } catch { return u }
}

export function classifyDocumentLinkFailure(attempts: LinkAttempt[]): LinkFailure {
  const host = hostOf(attempts[0]?.url || '')
  const toLogin = attempts.find(a => {
    if (!a.finalUrl || a.finalUrl === a.url) return false
    try { return LOGIN_PATH.test(new URL(a.finalUrl).pathname) } catch { return false }
  })
  if (toLogin) {
    return {
      code: 'needs-login',
      message: `הקישור למסמך דורש התחברות לאתר ${host} — יש להוריד את הקובץ מהאתר ולהעלות אותו לשורה (העלה קובץ)`,
    }
  }
  if (attempts.some(a => a.status >= 200 && a.status < 300)) {
    return {
      code: 'not-pdf',
      message: `הקישור למסמך מוביל לדף באתר ${host} ולא לקובץ PDF — יש לפתוח את הקישור, להוריד את ה-PDF ולהעלות אותו לשורה (העלה קובץ)`,
    }
  }
  const statuses = attempts.map(a => a.status).join(', ')
  return {
    code: 'http-error',
    message: `הורדת המסמך מ-${host} נכשלה (HTTP ${statuses}) — יש להוריד את הקובץ ולהעלות אותו לשורה (העלה קובץ)`,
  }
}
