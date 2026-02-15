/**
 * Gmail Service
 * Handles Gmail OAuth and inbox operations (client-side only)
 */

import { getFirebaseAuth } from '@/app/lib/firebase'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
]
const GMAIL_API_BASE = 'https://www.googleapis.com/gmail/v1/users/me'
const GMAIL_TOKEN_KEY = 'google_gmail_token'

export type GmailMessage = {
  id: string
  threadId: string
  from: string
  subject: string
  date: string // ISO date string
  snippet: string
  unsubscribeUrl: string | null
}

// Store the access token in memory (loaded from storage on init)
let gmailAccessToken: string | null = null

function loadTokenFromStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const stored = sessionStorage.getItem(GMAIL_TOKEN_KEY)
    if (stored) {
      gmailAccessToken = stored
    }
  } catch {
    // Ignore storage errors
  }
}

function saveTokenToStorage(token: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(GMAIL_TOKEN_KEY, token)
  } catch {
    // Ignore storage errors
  }
}

function clearTokenFromStorage(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(GMAIL_TOKEN_KEY)
  } catch {
    // Ignore storage errors
  }
}

// Load token on module init
loadTokenFromStorage()

export function hasGmailAccess(): boolean {
  if (!gmailAccessToken) {
    loadTokenFromStorage()
  }
  return gmailAccessToken !== null
}

export function getGmailAccessToken(): string | null {
  return gmailAccessToken
}

export function clearGmailAccess(): void {
  gmailAccessToken = null
  clearTokenFromStorage()
}

/**
 * Request Gmail access via Google OAuth popup
 */
export async function requestGmailAccess(): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = getFirebaseAuth()
    const provider = new GoogleAuthProvider()

    for (const scope of GMAIL_SCOPES) {
      provider.addScope(scope)
    }
    provider.setCustomParameters({
      prompt: 'consent',
    })

    const result = await signInWithPopup(auth, provider)

    const credential = GoogleAuthProvider.credentialFromResult(result)
    if (credential?.accessToken) {
      gmailAccessToken = credential.accessToken
      saveTokenToStorage(credential.accessToken)
      return { success: true }
    }

    return { success: false, error: 'לא התקבל טוקן גישה ל-Gmail' }
  } catch (err: any) {
    console.error('[Gmail] Auth failed:', err.code, err.message)

    if (err.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'החלון נסגר לפני השלמת ההתחברות' }
    }
    if (err.code === 'auth/popup-blocked') {
      return { success: false, error: 'החלון נחסם. אפשר חלונות קופצים ונסה שוב' }
    }

    return { success: false, error: 'שגיאה בהתחברות ל-Gmail' }
  }
}

/**
 * Fetch inbox messages (most recent first) with pagination
 */
export async function fetchInboxMessages(
  maxResults = 25,
  pageToken?: string
): Promise<{ messages: GmailMessage[]; nextPageToken?: string; error?: string }> {
  if (!gmailAccessToken) {
    return { messages: [], error: 'לא מחובר ל-Gmail' }
  }

  try {
    // List message IDs from inbox
    const listParams = new URLSearchParams({
      labelIds: 'INBOX',
      maxResults: String(maxResults),
    })
    if (pageToken) {
      listParams.set('pageToken', pageToken)
    }

    const listResponse = await fetch(
      `${GMAIL_API_BASE}/messages?${listParams}`,
      { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
    )

    if (listResponse.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { messages: [], error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

    if (!listResponse.ok) {
      const errorBody = await listResponse.json().catch(() => ({}))
      console.error('[Gmail] List error:', listResponse.status, errorBody)

      if (listResponse.status === 403) {
        const reason = errorBody?.error?.errors?.[0]?.reason
        if (reason === 'accessNotConfigured' || reason === 'forbidden') {
          return { messages: [], error: 'Gmail API לא מופעל בפרויקט Google Cloud. הפעל אותו בקונסול ונסה שוב' }
        }
        // Scope not granted — re-auth needed
        gmailAccessToken = null
        clearTokenFromStorage()
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

    // Fetch each message's metadata in parallel
    const messages = await Promise.all(
      messageIds.map(async ({ id, threadId }): Promise<GmailMessage> => {
        const msgResponse = await fetch(
          `${GMAIL_API_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe`,
          { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
        )

        if (!msgResponse.ok) {
          return { id, threadId, from: '', subject: '(שגיאה בטעינה)', date: '', snippet: '', unsubscribeUrl: null }
        }

        const msgData = await msgResponse.json()
        const headers: { name: string; value: string }[] = msgData.payload?.headers || []

        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

        // Extract HTTP URL from List-Unsubscribe header (e.g. "<https://...>, <mailto:...>")
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
    return { messages: [], error: 'שגיאת רשת בטעינת Gmail' }
  }
}

/**
 * Trash a single message
 */
export async function trashMessage(messageId: string): Promise<{ success: boolean; error?: string }> {
  if (!gmailAccessToken) {
    return { success: false, error: 'לא מחובר ל-Gmail' }
  }

  try {
    const response = await fetch(
      `${GMAIL_API_BASE}/messages/${messageId}/trash`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${gmailAccessToken}` },
      }
    )

    if (response.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { success: false, error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

    if (!response.ok) {
      console.error('[Gmail] Trash error:', response.status)
      return { success: false, error: 'שגיאה במחיקת ההודעה' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Trash error:', err)
    return { success: false, error: 'שגיאת רשת במחיקת הודעה' }
  }
}

/**
 * Fetch the full body of a single message (HTML preferred, fallback to plain text)
 */
export async function fetchMessageBody(
  messageId: string
): Promise<{ body: string; contentType: 'html' | 'text'; error?: string }> {
  if (!gmailAccessToken) {
    return { body: '', contentType: 'text', error: 'לא מחובר ל-Gmail' }
  }

  try {
    const response = await fetch(
      `${GMAIL_API_BASE}/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
    )

    if (response.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { body: '', contentType: 'text', error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

    if (!response.ok) {
      return { body: '', contentType: 'text', error: 'שגיאה בטעינת ההודעה' }
    }

    const data = await response.json()
    const payload = data.payload

    // Decode URL-safe base64 to UTF-8 string
    function decodeBase64Utf8(b64: string): string {
      const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return new TextDecoder('utf-8').decode(bytes)
    }

    // Recursively find body parts
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

    // Prefer HTML, fallback to plain text
    const html = findPart(payload, 'text/html')
    if (html) return { body: html, contentType: 'html' }

    const plain = findPart(payload, 'text/plain')
    if (plain) return { body: plain, contentType: 'text' }

    // Single-part message with body directly on payload
    if (payload.body?.data) {
      const decoded = decodeBase64Utf8(payload.body.data)
      const isHtml = payload.mimeType === 'text/html'
      return { body: decoded, contentType: isHtml ? 'html' : 'text' }
    }

    return { body: data.snippet || '', contentType: 'text' }
  } catch (err: any) {
    console.error('[Gmail] Fetch body error:', err)
    return { body: '', contentType: 'text', error: 'שגיאת רשת בטעינת הודעה' }
  }
}

/**
 * Search inbox messages matching a query, return message IDs
 */
export async function searchMessages(query: string): Promise<{ messageIds: string[]; error?: string }> {
  if (!gmailAccessToken) {
    return { messageIds: [], error: 'לא מחובר ל-Gmail' }
  }

  try {
    const params = new URLSearchParams({
      q: `in:inbox ${query}`,
      maxResults: '500',
    })

    const response = await fetch(
      `${GMAIL_API_BASE}/messages?${params}`,
      { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
    )

    if (response.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { messageIds: [], error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

    if (!response.ok) {
      return { messageIds: [], error: 'שגיאה בחיפוש הודעות' }
    }

    const data = await response.json()
    const ids = (data.messages || []).map((m: { id: string }) => m.id)
    return { messageIds: ids }
  } catch (err: any) {
    console.error('[Gmail] Search error:', err)
    return { messageIds: [], error: 'שגיאת רשת בחיפוש הודעות' }
  }
}

/**
 * Batch archive messages (remove INBOX label), optionally adding a label
 */
export async function archiveMessages(messageIds: string[], addLabelIds?: string[]): Promise<{ success: boolean; error?: string }> {
  if (!gmailAccessToken) {
    return { success: false, error: 'לא מחובר ל-Gmail' }
  }

  if (messageIds.length === 0) {
    return { success: true }
  }

  try {
    const response = await fetch(
      `${GMAIL_API_BASE}/messages/batchModify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmailAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: messageIds,
          removeLabelIds: ['INBOX'],
          ...(addLabelIds && addLabelIds.length > 0 && { addLabelIds }),
        }),
      }
    )

    if (response.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { success: false, error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

    if (!response.ok) {
      console.error('[Gmail] Archive error:', response.status)
      return { success: false, error: 'שגיאה בארכוב הודעות' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Archive error:', err)
    return { success: false, error: 'שגיאת רשת בארכוב הודעות' }
  }
}

/**
 * Batch trash messages (add TRASH label, remove INBOX)
 */
export async function trashMessages(messageIds: string[]): Promise<{ success: boolean; error?: string }> {
  if (!gmailAccessToken) {
    return { success: false, error: 'לא מחובר ל-Gmail' }
  }

  if (messageIds.length === 0) {
    return { success: true }
  }

  try {
    const response = await fetch(
      `${GMAIL_API_BASE}/messages/batchModify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmailAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: messageIds,
          addLabelIds: ['TRASH'],
          removeLabelIds: ['INBOX'],
        }),
      }
    )

    if (response.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { success: false, error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

    if (!response.ok) {
      console.error('[Gmail] Batch trash error:', response.status)
      return { success: false, error: 'שגיאה במחיקת הודעות' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Batch trash error:', err)
    return { success: false, error: 'שגיאת רשת במחיקת הודעות' }
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
  if (!gmailAccessToken) {
    return { success: false, error: 'לא מחובר ל-Gmail' }
  }

  try {
    const response = await fetch(
      `${GMAIL_API_BASE}/settings/filters`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmailAccessToken}`,
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

    if (response.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { success: false, error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      // Filter already exists — treat as success, proceed to archive
      if (errorBody?.error?.status === 'FAILED_PRECONDITION') {
        return { success: true }
      }
      console.error('[Gmail] Filter error:', response.status, errorBody)
      return { success: false, error: 'שגיאה ביצירת פילטר' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Filter error:', err)
    return { success: false, error: 'שגיאת רשת ביצירת פילטר' }
  }
}

/**
 * List user labels
 */
export async function listLabels(): Promise<{ labels: GmailLabel[]; error?: string }> {
  if (!gmailAccessToken) {
    return { labels: [], error: 'לא מחובר ל-Gmail' }
  }

  try {
    const response = await fetch(
      `${GMAIL_API_BASE}/labels`,
      { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
    )

    if (response.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { labels: [], error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

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
    return { labels: [], error: 'שגיאת רשת בטעינת תוויות' }
  }
}

/**
 * List all Gmail filters
 */
export async function listFilters(): Promise<{ filters: GmailFilter[]; error?: string }> {
  if (!gmailAccessToken) {
    return { filters: [], error: 'לא מחובר ל-Gmail' }
  }

  try {
    const response = await fetch(
      `${GMAIL_API_BASE}/settings/filters`,
      { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
    )

    if (response.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { filters: [], error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

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
    return { filters: [], error: 'שגיאת רשת בטעינת פילטרים' }
  }
}

/**
 * Delete a Gmail filter by ID
 */
export async function deleteFilter(filterId: string): Promise<{ success: boolean; error?: string }> {
  if (!gmailAccessToken) {
    return { success: false, error: 'לא מחובר ל-Gmail' }
  }

  try {
    const response = await fetch(
      `${GMAIL_API_BASE}/settings/filters/${filterId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${gmailAccessToken}` },
      }
    )

    if (response.status === 401) {
      gmailAccessToken = null
      clearTokenFromStorage()
      return { success: false, error: 'פג תוקף ההרשאה. התחבר מחדש ל-Gmail' }
    }

    if (!response.ok) {
      return { success: false, error: 'שגיאה במחיקת פילטר' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gmail] Delete filter error:', err)
    return { success: false, error: 'שגיאת רשת במחיקת פילטר' }
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
