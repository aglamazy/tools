/**
 * Gmail Service
 * Handles Gmail API operations using the shared Google OAuth token (with refresh).
 */

import { getAccessToken, hasGoogleAccess, requestGoogleAccess } from '@/app/services/googleTokenService'

const GMAIL_API_BASE = 'https://www.googleapis.com/gmail/v1/users/me'

export type GmailMessage = {
  id: string
  threadId: string
  from: string
  subject: string
  date: string // ISO date string
  snippet: string
  unsubscribeUrl: string | null
}

// Re-export Google token functions under Gmail names for backward compat
export function hasGmailAccess(): boolean {
  // hasGoogleAccess is async but callers use this synchronously.
  // We check synchronously by looking at localStorage — the token service
  // stores tokens in IndexedDB but we can do a quick check.
  // For a proper check, callers should use ensureGmailAccess().
  return true // optimistic — getToken() will refresh if needed
}

export { requestGoogleAccess as requestGmailAccess }

export function clearGmailAccess(): void {
  // Clearing is handled by googleTokenService.clearGoogleAccess
}

export function getGmailAccessToken(): string | null {
  // Callers should use getAccessToken() instead
  return null
}

async function getToken(): Promise<string> {
  const token = await getAccessToken()
  if (!token) {
    // No token at all — trigger re-auth
    const result = await requestGoogleAccess()
    if (!result.success) throw new Error(result.error || 'לא מחובר ל-Google')
    const newToken = await getAccessToken()
    if (!newToken) throw new Error('לא מחובר ל-Google')
    return newToken
  }
  return token
}

async function handleScopeError(): Promise<string> {
  const { clearGoogleAccess } = await import('@/app/services/googleTokenService')
  await clearGoogleAccess()
  const result = await requestGoogleAccess()
  if (!result.success) throw new Error(result.error || 'לא מחובר ל-Google')
  const token = await getAccessToken()
  if (!token) throw new Error('לא מחובר ל-Google')
  return token
}

/**
 * Fetch inbox messages (most recent first) with pagination
 */
export async function fetchInboxMessages(
  maxResults = 25,
  pageToken?: string
): Promise<{ messages: GmailMessage[]; nextPageToken?: string; error?: string }> {
  try {
    const token = await getToken()

    const listParams = new URLSearchParams({
      labelIds: 'INBOX',
      maxResults: String(maxResults),
    })
    if (pageToken) {
      listParams.set('pageToken', pageToken)
    }

    const listResponse = await fetch(
      `${GMAIL_API_BASE}/messages?${listParams}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!listResponse.ok) {
      const errorBody = await listResponse.json().catch(() => ({}))
      console.error('[Gmail] List error:', listResponse.status, errorBody)

      if (listResponse.status === 403) {
        const reason = errorBody?.error?.errors?.[0]?.reason
        if (reason === 'accessNotConfigured' || reason === 'forbidden') {
          return { messages: [], error: 'Gmail API לא מופעל בפרויקט Google Cloud. הפעל אותו בקונסול ונסה שוב' }
        }
        return { messages: [], error: 'חסרות הרשאות Gmail. התחבר מחדש כדי לאשר גישה' }
      }

      return { messages: [], error: 'שגיאה בטעינת הודעות' }
    }

    const listData = await listResponse.json()
    const messageIds: { id: string; threadId: string }[] = listData.messages || []
    const nextPageToken: string | undefined = listData.nextPageToken || undefined

    if (messageIds.length === 0) {
      return { messages: [] }
    }

    const messages = await Promise.all(
      messageIds.map(async ({ id, threadId }): Promise<GmailMessage> => {
        const msgResponse = await fetch(
          `${GMAIL_API_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe`,
          { headers: { Authorization: `Bearer ${token}` } }
        )

        if (!msgResponse.ok) {
          return { id, threadId, from: '', subject: '(שגיאה בטעינה)', date: '', snippet: '', unsubscribeUrl: null }
        }

        const msgData = await msgResponse.json()
        const headers: { name: string; value: string }[] = msgData.payload?.headers || []

        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

        const unsubRaw = getHeader('List-Unsubscribe')
        const httpMatch = unsubRaw.match(/<(https?:\/\/[^>]+)>/)
        const unsubscribeUrl = httpMatch ? httpMatch[1] : null

        return {
          id,
          threadId,
          from: getHeader('From'),
          subject: getHeader('Subject') || '(ללא נושא)',
          date: getHeader('Date'),
          snippet: msgData.snippet || '',
          unsubscribeUrl,
        }
      })
    )

    return { messages, nextPageToken }
  } catch (err: any) {
    console.error('[Gmail] Fetch error:', err)
    return { messages: [], error: err.message || 'שגיאת רשת בטעינת Gmail' }
  }
}

/**
 * Trash a single message
 */
export async function trashMessage(messageId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getToken()

    const response = await fetch(
      `${GMAIL_API_BASE}/messages/${messageId}/trash`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    if (!response.ok) {
      console.error('[Gmail] Trash error:', response.status)
      return { success: false, error: 'שגיאה במחיקת ההודעה' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Trash error:', err)
    return { success: false, error: err.message || 'שגיאת רשת במחיקת הודעה' }
  }
}

/**
 * Fetch the full body of a single message (HTML preferred, fallback to plain text)
 */
export async function fetchMessageBody(
  messageId: string
): Promise<{ body: string; contentType: 'html' | 'text'; error?: string }> {
  try {
    const token = await getToken()

    const response = await fetch(
      `${GMAIL_API_BASE}/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!response.ok) {
      return { body: '', contentType: 'text', error: 'שגיאה בטעינת ההודעה' }
    }

    const data = await response.json()
    const payload = data.payload

    function decodeBase64Utf8(b64: string): string {
      const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return new TextDecoder('utf-8').decode(bytes)
    }

    function findPart(part: any, mimeType: string): string | null {
      if (part.mimeType === mimeType && part.body?.data) {
        return decodeBase64Utf8(part.body.data)
      }
      if (part.parts) {
        for (const sub of part.parts) {
          const found = findPart(sub, mimeType)
          if (found) return found
        }
      }
      return null
    }

    const html = findPart(payload, 'text/html')
    if (html) return { body: html, contentType: 'html' }

    const plain = findPart(payload, 'text/plain')
    if (plain) return { body: plain, contentType: 'text' }

    if (payload.body?.data) {
      const decoded = decodeBase64Utf8(payload.body.data)
      const isHtml = payload.mimeType === 'text/html'
      return { body: decoded, contentType: isHtml ? 'html' : 'text' }
    }

    return { body: data.snippet || '', contentType: 'text' }
  } catch (err: any) {
    console.error('[Gmail] Fetch body error:', err)
    return { body: '', contentType: 'text', error: err.message || 'שגיאת רשת בטעינת הודעה' }
  }
}

/**
 * Search inbox messages matching a query, return message IDs
 */
export async function searchMessages(
  query: string,
  options?: { searchAllMail?: boolean; maxResults?: number }
): Promise<{ messageIds: string[]; error?: string }> {
  try {
    const token = await getToken()
    const q = options?.searchAllMail ? query : `in:inbox ${query}`
    const params = new URLSearchParams({
      q,
      maxResults: String(options?.maxResults ?? 500),
    })

    const response = await fetch(
      `${GMAIL_API_BASE}/messages?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error('[Gmail] Search error:', response.status, errorBody)
      if (response.status === 403 && errorBody.includes('SCOPE_INSUFFICIENT')) {
        const newToken = await handleScopeError()
        const retry = await fetch(
          `${GMAIL_API_BASE}/messages?${params}`,
          { headers: { Authorization: `Bearer ${newToken}` } }
        )
        if (!retry.ok) throw new Error(`Gmail API ${retry.status}`)
        const retryData = await retry.json()
        return { messageIds: (retryData.messages || []).map((m: { id: string }) => m.id) }
      }
      throw new Error(`Gmail API ${response.status}`)
    }

    const data = await response.json()
    const ids = (data.messages || []).map((m: { id: string }) => m.id)
    return { messageIds: ids }
  } catch (err: any) {
    console.error('[Gmail] Search error:', err)
    return { messageIds: [], error: err.message || 'שגיאת רשת בחיפוש הודעות' }
  }
}

/**
 * Fetch metadata (from, subject, date, snippet) for a list of message IDs
 */
export async function fetchMessagesMetadata(
  messageIds: string[]
): Promise<{ messages: Pick<GmailMessage, 'id' | 'from' | 'subject' | 'date' | 'snippet'>[]; error?: string }> {
  try {
    const token = await getToken()

    const messages = await Promise.all(
      messageIds.map(async (id) => {
        const res = await fetch(
          `${GMAIL_API_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok) return { id, from: '', subject: '', date: '', snippet: '' }
        const data = await res.json()
        const headers: { name: string; value: string }[] = data.payload?.headers || []
        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
        return {
          id,
          from: getHeader('From'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          snippet: data.snippet || '',
        }
      })
    )
    return { messages }
  } catch (err: any) {
    console.error('[Gmail] Fetch metadata error:', err)
    return { messages: [], error: err.message || 'שגיאת רשת בטעינת מטא-דאטה' }
  }
}

/**
 * Batch archive messages (remove INBOX label), optionally adding a label
 */
export async function archiveMessages(messageIds: string[], addLabelIds?: string[]): Promise<{ success: boolean; error?: string }> {
  if (messageIds.length === 0) {
    return { success: true }
  }

  try {
    const token = await getToken()

    const response = await fetch(
      `${GMAIL_API_BASE}/messages/batchModify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: messageIds,
          removeLabelIds: ['INBOX'],
          ...(addLabelIds && addLabelIds.length > 0 && { addLabelIds }),
        }),
      }
    )

    if (!response.ok) {
      console.error('[Gmail] Archive error:', response.status)
      return { success: false, error: 'שגיאה בארכוב הודעות' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Archive error:', err)
    return { success: false, error: err.message || 'שגיאת רשת בארכוב הודעות' }
  }
}

/**
 * Batch trash messages (add TRASH label, remove INBOX)
 */
export async function trashMessages(messageIds: string[]): Promise<{ success: boolean; error?: string }> {
  if (messageIds.length === 0) {
    return { success: true }
  }

  try {
    const token = await getToken()

    const response = await fetch(
      `${GMAIL_API_BASE}/messages/batchModify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: messageIds,
          addLabelIds: ['TRASH'],
          removeLabelIds: ['INBOX'],
        }),
      }
    )

    if (!response.ok) {
      console.error('[Gmail] Batch trash error:', response.status)
      return { success: false, error: 'שגיאה במחיקת הודעות' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Batch trash error:', err)
    return { success: false, error: err.message || 'שגיאת רשת במחיקת הודעות' }
  }
}

export type GmailLabel = {
  id: string
  name: string
  type: 'system' | 'user'
}

export type GmailFilter = {
  id: string
  criteria: { from?: string; subject?: string; query?: string }
  action: { removeLabelIds?: string[]; addLabelIds?: string[] }
}

export type GmailFilterCriteria = {
  from?: string
  subject?: string
  query?: string
}

/**
 * Create a Gmail filter that auto-archives matching messages, optionally adding a label
 */
export async function createFilter(
  criteria: GmailFilterCriteria,
  addLabelIds?: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getToken()

    const response = await fetch(
      `${GMAIL_API_BASE}/settings/filters`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          criteria: {
            ...(criteria.from && { from: criteria.from }),
            ...(criteria.subject && { subject: criteria.subject }),
            ...(criteria.query && { query: criteria.query }),
          },
          action: {
            removeLabelIds: ['INBOX'],
            ...(addLabelIds && addLabelIds.length > 0 && { addLabelIds }),
          },
        }),
      }
    )

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      if (errorBody?.error?.status === 'FAILED_PRECONDITION') {
        return { success: true }
      }
      console.error('[Gmail] Filter error:', response.status, errorBody)
      return { success: false, error: 'שגיאה ביצירת פילטר' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Filter error:', err)
    return { success: false, error: err.message || 'שגיאת רשת ביצירת פילטר' }
  }
}

/**
 * List user labels
 */
export async function listLabels(): Promise<{ labels: GmailLabel[]; error?: string }> {
  try {
    const token = await getToken()

    const response = await fetch(
      `${GMAIL_API_BASE}/labels`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!response.ok) {
      return { labels: [], error: 'שגיאה בטעינת תוויות' }
    }

    const data = await response.json()
    const labels: GmailLabel[] = (data.labels || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      type: l.type === 'user' ? 'user' : 'system',
    }))

    return { labels }
  } catch (err: any) {
    console.error('[Gmail] Labels error:', err)
    return { labels: [], error: err.message || 'שגיאת רשת בטעינת תוויות' }
  }
}

/**
 * List all Gmail filters
 */
export async function listFilters(): Promise<{ filters: GmailFilter[]; error?: string }> {
  try {
    const token = await getToken()

    const response = await fetch(
      `${GMAIL_API_BASE}/settings/filters`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!response.ok) {
      return { filters: [], error: 'שגיאה בטעינת פילטרים' }
    }

    const data = await response.json()
    const filters: GmailFilter[] = (data.filter || []).map((f: any) => ({
      id: f.id,
      criteria: f.criteria || {},
      action: f.action || {},
    }))

    return { filters }
  } catch (err: any) {
    console.error('[Gmail] Filters error:', err)
    return { filters: [], error: err.message || 'שגיאת רשת בטעינת פילטרים' }
  }
}

/**
 * Delete a Gmail filter by ID
 */
export async function deleteFilter(filterId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getToken()

    const response = await fetch(
      `${GMAIL_API_BASE}/settings/filters/${filterId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    if (!response.ok) {
      return { success: false, error: 'שגיאה במחיקת פילטר' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Delete filter error:', err)
    return { success: false, error: err.message || 'שגיאת רשת במחיקת פילטר' }
  }
}

export type EmailAttachment = {
  filename: string
  mimeType: string
  /** Base64-encoded content */
  base64: string
}

/**
 * Send an email via Gmail API, optionally with attachments
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  attachments?: EmailAttachment[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getToken()

    const boundary = `bndry_${Math.random().toString(36).slice(2)}`
    const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`

    let rawEmail: string
    if (attachments && attachments.length > 0) {
      const parts = [
        `To: ${to}`,
        `Subject: ${encodedSubject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        '',
        htmlBody,
      ]
      for (const att of attachments) {
        parts.push(
          `--${boundary}`,
          `Content-Type: ${att.mimeType}; name="${att.filename}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${att.filename}"`,
          '',
          att.base64,
        )
      }
      parts.push(`--${boundary}--`, '')
      rawEmail = parts.join('\r\n')
    } else {
      rawEmail = [
        `To: ${to}`,
        `Subject: ${encodedSubject}`,
        'Content-Type: text/html; charset=UTF-8',
        '',
        htmlBody,
      ].join('\r\n')
    }

    const encoded = btoa(unescape(encodeURIComponent(rawEmail)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const response = await fetch(
      `${GMAIL_API_BASE}/messages/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      }
    )

    if (!response.ok) {
      console.error('[Gmail] Send error:', response.status)
      return { success: false, error: 'שגיאה בשליחת מייל' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Send error:', err)
    return { success: false, error: err.message || 'שגיאת רשת בשליחת מייל' }
  }
}

/**
 * Build a Gmail search query from filter criteria
 */
export function buildQueryFromCriteria(criteria: GmailFilterCriteria): string {
  const parts: string[] = []
  if (criteria.from) parts.push(`from:(${criteria.from})`)
  if (criteria.subject) parts.push(`subject:(${criteria.subject})`)
  if (criteria.query) parts.push(criteria.query)
  return parts.join(' ')
}
