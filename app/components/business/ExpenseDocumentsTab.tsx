'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { db, type ExpenseDocument, type Transaction } from '@/app/db/financeDB'
import {
  requestGoogleAccess,
  uploadExpenseDocument,
  downloadDriveFile,
} from '@/app/services/googleDriveService'
import { getAccessToken } from '@/app/services/googleTokenService'
import {
  hasGmailAccess,
  requestGmailAccess,
  searchMessages,
  fetchInboxMessages,
} from '@/app/services/gmailService'
import YesNoModal from '@/app/components/YesNoModal'

type GmailSearchResult = {
  id: string
  from: string
  subject: string
  date: string
  snippet: string
}

type Props = {
  businessId: number
}

export default function ExpenseDocumentsTab({ businessId }: Props) {
  const [docs, setDocs] = useState<ExpenseDocument[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [driveConnected, setDriveConnected] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Gmail search state
  const [gmailSearchOpen, setGmailSearchOpen] = useState(false)
  const [gmailQuery, setGmailQuery] = useState('')
  const [gmailResults, setGmailResults] = useState<GmailSearchResult[]>([])
  const [gmailSearching, setGmailSearching] = useState(false)
  const [gmailAttaching, setGmailAttaching] = useState<string | null>(null)

  // Link-to-transaction state
  const [linkingDocId, setLinkingDocId] = useState<number | null>(null)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; doc: ExpenseDocument | null }>({ isOpen: false, doc: null })

  const loadDocs = useCallback(async () => {
    const all = (await db.expenseDocuments.toArray())
      .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))
    setDocs(all)
    setLoading(false)
  }, [])

  const loadTransactions = useCallback(async () => {
    // Load recent expense transactions for linking
    const currentMonth = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`
    const txs = await db.transactions
      .where('month').equals(currentMonth)
      .toArray()
    setTransactions(txs.filter(t => t.amount < 0)) // Expenses are negative
  }, [])

  useEffect(() => {
    loadDocs()
    loadTransactions()
    getAccessToken().then(token => setDriveConnected(!!token))
    setGmailConnected(hasGmailAccess())
    db.appSettings.where('key').equals('claudeApiKey').first().then(row => {
      if (row?.value) setClaudeApiKey(row.value as string)
    })
  }, [loadDocs, loadTransactions])

  // --- Drive connection ---
  const handleConnectDrive = async () => {
    setError(null)
    const result = await requestGoogleAccess()
    if (result.success) {
      setDriveConnected(true)
    } else {
      setError(result.error || 'Failed to connect Google Drive')
    }
  }

  // --- File upload ---
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setError(null)
    setUploading(true)

    try {
      let driveFileId: string | undefined
      let driveWebViewLink: string | undefined

      if (driveConnected) {
        const result = await uploadExpenseDocument(file)
        driveFileId = result.fileId
        driveWebViewLink = result.webViewLink
      }

      const now = new Date().toISOString()
      const id = await db.expenseDocuments.add({
        fileName: file.name,
        driveFileId,
        driveWebViewLink,
        sourceType: 'upload',
        uploadedAt: now,
        updatedAt: now,
      })

      await loadDocs()

      // Auto-extract if API key is set
      if (claudeApiKey) {
        const base64 = await fileToBase64(file)
        await extractData(id as number, base64, file.type)
      }
    } catch (err: any) {
      console.error('[ExpenseDocuments] Upload error:', err)
      setError(err.message || 'העלאה נכשלה')
    } finally {
      setUploading(false)
    }
  }

  // --- Data extraction ---
  const extractData = async (docId: number, base64: string, mimeType: string) => {
    if (!claudeApiKey) {
      setError('יש להגדיר Claude API Key בהגדרות (מפתחות API)')
      return
    }

    setExtracting(docId)
    setError(null)

    try {
      const res = await fetch('/api/extract-expense-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: claudeApiKey,
          fileBase64: base64,
          mimeType,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const detail = errData.details ? `\n${errData.details}` : ''
        throw new Error((errData.error || `חילוץ נכשל (${res.status})`) + detail)
      }

      const data = await res.json()

      const updates: Partial<ExpenseDocument> = {
        vendor: data.vendor,
        date: data.date,
        amount: data.amount,
        vatAmount: data.vatAmount,
        description: data.description,
        externalTxRef: typeof data.externalTxRef === 'string' ? data.externalTxRef : undefined,
        referenceNumber: typeof data.referenceNumber === 'string' ? data.referenceNumber : undefined,
        docType:
          data.docType === 'invoice' ||
          data.docType === 'receipt' ||
          data.docType === 'receipt-invoice' ||
          data.docType === 'unknown'
            ? data.docType
            : undefined,
        extractedData: data,
        updatedAt: new Date().toISOString(),
      }

      // Check for mismatch with linked transaction
      const doc = await db.expenseDocuments.get(docId)
      if (doc?.transactionId) {
        const tx = await db.transactions.get(doc.transactionId)
        if (tx && data.amount) {
          const txAmount = Math.abs(tx.amount)
          const docAmount = data.amount
          if (Math.abs(txAmount - docAmount) > 1) {
            updates.mismatch = true
            updates.mismatchDetails = `סכום במסמך: ${docAmount}₪, סכום בעסקה: ${txAmount}₪`
          } else {
            updates.mismatch = false
            updates.mismatchDetails = undefined
          }
        }
      }

      await db.expenseDocuments.update(docId, updates)
      await loadDocs()
    } catch (err: any) {
      console.error('[ExpenseDocuments] Extract error:', err)
      setError(err.message || 'חילוץ נתונים נכשל')
    } finally {
      setExtracting(null)
    }
  }

  const handleReExtract = async (doc: ExpenseDocument) => {
    if (!claudeApiKey) {
      setError('יש להגדיר Claude API Key בהגדרות (מפתחות API)')
      return
    }
    if (!doc.driveFileId || !doc.id) {
      setError('הקובץ לא נמצא ב-Google Drive')
      return
    }
    try {
      const { base64, mimeType } = await downloadDriveFile(doc.driveFileId)
      await extractData(doc.id, base64, mimeType)
    } catch (err: any) {
      setError(err.message || 'הורדה מ-Drive נכשלה')
    }
  }

  // --- Link to transaction ---
  const handleLinkTransaction = async (docId: number, transactionId: number) => {
    await db.expenseDocuments.update(docId, {
      transactionId,
      updatedAt: new Date().toISOString(),
    })
    setLinkingDocId(null)
    await loadDocs()
  }

  const handleUnlinkTransaction = async (docId: number) => {
    await db.expenseDocuments.update(docId, {
      transactionId: undefined,
      mismatch: undefined,
      mismatchDetails: undefined,
      updatedAt: new Date().toISOString(),
    })
    await loadDocs()
  }

  // --- Gmail search ---
  const handleConnectGmail = async () => {
    setError(null)
    const result = await requestGmailAccess()
    if (result.success) {
      setGmailConnected(true)
    } else {
      setError(result.error || 'Failed to connect Gmail')
    }
  }

  const handleGmailSearch = async () => {
    if (!gmailQuery.trim()) return
    setGmailSearching(true)
    setGmailResults([])
    setError(null)

    try {
      const query = `${gmailQuery} has:attachment`
      const { messageIds, error: searchErr } = await searchMessages(query)
      if (searchErr) {
        setError(searchErr)
        setGmailSearching(false)
        return
      }

      // Fetch metadata for top 10 results
      const top = messageIds.slice(0, 10)
      const results: GmailSearchResult[] = []

      for (const msgId of top) {
        try {
          const token = hasGmailAccess() ? undefined : null
          if (token === null) break

          const res = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${await getGmailToken()}` } }
          )
          if (!res.ok) continue

          const data = await res.json()
          const headers: { name: string; value: string }[] = data.payload?.headers || []
          const getHeader = (name: string) =>
            headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

          results.push({
            id: msgId,
            from: getHeader('From'),
            subject: getHeader('Subject') || '(ללא נושא)',
            date: getHeader('Date'),
            snippet: data.snippet || '',
          })
        } catch {
          // skip failed messages
        }
      }

      setGmailResults(results)
    } catch (err: any) {
      setError(err.message || 'חיפוש Gmail נכשל')
    } finally {
      setGmailSearching(false)
    }
  }

  const handleAttachFromGmail = async (messageId: string) => {
    setGmailAttaching(messageId)
    setError(null)

    try {
      // Fetch full message to get attachments
      const token = await getGmailToken()
      if (!token) throw new Error('לא מחובר ל-Gmail')

      const res = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error('שגיאה בטעינת ההודעה')

      const data = await res.json()

      // Find attachments recursively
      const attachments: { filename: string; mimeType: string; attachmentId: string }[] = []
      function findAttachments(part: any) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId,
          })
        }
        if (part.parts) {
          for (const sub of part.parts) findAttachments(sub)
        }
      }
      findAttachments(data.payload)

      if (attachments.length === 0) {
        setError('לא נמצאו קבצים מצורפים בהודעה')
        return
      }

      // Filter for supported types
      const supported = attachments.filter(a =>
        /\.(pdf|png|jpg|jpeg|webp)$/i.test(a.filename) ||
        ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(a.mimeType)
      )

      if (supported.length === 0) {
        setError('לא נמצאו קבצים מצורפים נתמכים (PDF, PNG, JPG, WEBP)')
        return
      }

      // Download first supported attachment
      const att = supported[0]
      const attRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${att.attachmentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!attRes.ok) throw new Error('שגיאה בהורדת הקובץ המצורף')

      const attData = await attRes.json()
      const base64Data = attData.data.replace(/-/g, '+').replace(/_/g, '/')

      // Upload to Drive
      let driveFileId: string | undefined
      let driveWebViewLink: string | undefined

      if (driveConnected) {
        const binary = atob(base64Data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

        const blob = new Blob([bytes], { type: att.mimeType })
        const file = new File([blob], att.filename, { type: att.mimeType })
        const result = await uploadExpenseDocument(file)
        driveFileId = result.fileId
        driveWebViewLink = result.webViewLink
      }

      const now = new Date().toISOString()
      const id = await db.expenseDocuments.add({
        fileName: att.filename,
        driveFileId,
        driveWebViewLink,
        sourceType: 'gmail',
        gmailMessageId: messageId,
        uploadedAt: now,
        updatedAt: now,
      })

      await loadDocs()

      // Auto-extract
      if (claudeApiKey) {
        await extractData(id as number, base64Data, att.mimeType)
      }

      setGmailSearchOpen(false)
      setGmailResults([])
      setGmailQuery('')
    } catch (err: any) {
      console.error('[ExpenseDocuments] Gmail attach error:', err)
      setError(err.message || 'צירוף מ-Gmail נכשל')
    } finally {
      setGmailAttaching(null)
    }
  }

  // --- Delete ---
  const handleDelete = (doc: ExpenseDocument) => {
    if (!doc.id) return
    setDeleteConfirm({ isOpen: true, doc })
  }

  const confirmDelete = async () => {
    const doc = deleteConfirm.doc
    setDeleteConfirm({ isOpen: false, doc: null })
    if (!doc?.id) return
    await db.expenseDocuments.delete(doc.id)
    await loadDocs()
  }

  // --- Render ---
  if (loading) return <p style={{ textAlign: 'center', color: '#94a3b8' }}>טוען...</p>

  return (
    <div>
      {/* Actions bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {!driveConnected && (
          <button
            onClick={handleConnectDrive}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              background: '#4285f4',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Google Drive חבר
          </button>
        )}
        {driveConnected && (
          <span style={{ fontSize: '0.8rem', color: '#16a34a' }}>Drive מחובר</span>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
            background: uploading ? '#94a3b8' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'מעלה...' : 'העלה קבלה'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {gmailConnected ? (
          <button
            onClick={() => setGmailSearchOpen(!gmailSearchOpen)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              background: gmailSearchOpen ? '#64748b' : '#ea4335',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            {gmailSearchOpen ? 'סגור חיפוש' : 'חפש ב-Gmail'}
          </button>
        ) : (
          <button
            onClick={handleConnectGmail}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              background: '#ea4335',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Gmail חבר
          </button>
        )}
      </div>

      {/* Gmail search panel */}
      {gmailSearchOpen && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          background: '#fef7f0',
          border: '1px solid #fed7aa',
          borderRadius: '0.5rem',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="text"
              value={gmailQuery}
              onChange={e => setGmailQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGmailSearch()}
              placeholder='חפש קבלות ב-Gmail (למשל: "סופר" או "חשבונית")'
              dir="rtl"
              style={{
                flex: 1,
                padding: '0.5rem',
                fontSize: '0.85rem',
                border: '1px solid #cbd5e1',
                borderRadius: '0.375rem',
              }}
            />
            <button
              onClick={handleGmailSearch}
              disabled={gmailSearching}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                background: gmailSearching ? '#94a3b8' : '#ea4335',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: gmailSearching ? 'not-allowed' : 'pointer',
              }}
            >
              {gmailSearching ? 'מחפש...' : 'חפש'}
            </button>
          </div>

          {gmailResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {gmailResults.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    padding: '0.5rem',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{msg.subject}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {msg.from} · {msg.date}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAttachFromGmail(msg.id)}
                    disabled={gmailAttaching === msg.id}
                    style={{
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.75rem',
                      background: gmailAttaching === msg.id ? '#94a3b8' : '#16a34a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: gmailAttaching === msg.id ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {gmailAttaching === msg.id ? 'מצרף...' : 'צרף'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.5rem 0.75rem',
          background: '#fef2f2',
          color: '#dc2626',
          borderRadius: '0.375rem',
          fontSize: '0.85rem',
          whiteSpace: 'pre-wrap',
        }}>
          {error}
        </div>
      )}

      {/* Documents list */}
      {docs.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
          אין מסמכי הוצאות עדיין. העלה קבלה או חפש ב-Gmail.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {docs.map(doc => {
            const linkedTx = doc.transactionId
              ? transactions.find(t => t.id === doc.transactionId)
              : undefined

            return (
              <div
                key={doc.id}
                style={{
                  padding: '0.75rem 1rem',
                  background: '#fff',
                  border: `1px solid ${doc.mismatch ? '#fecaca' : '#e2e8f0'}`,
                  borderRadius: '0.5rem',
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {/* Source icon */}
                <span style={{ fontSize: '1.2rem' }}>
                  {doc.sourceType === 'gmail' ? '\u2709' : '\uD83D\uDCCE'}
                </span>

                {/* File info */}
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                    {(() => {
                      // Prefer the Drive-hosted copy; fall back to externalUrl
                      // (e.g. YPAY hosted invoice with no PDF attachment).
                      const href = doc.driveWebViewLink || doc.externalUrl
                      return href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#2563eb', textDecoration: 'none' }}
                          title={doc.externalUrl && !doc.driveWebViewLink ? 'מסמך חיצוני (אין עותק ב-Drive)' : undefined}
                        >
                          {doc.fileName}
                        </a>
                      ) : doc.fileName
                    })()}
                  </div>
                  {doc.vendor && (
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {doc.vendor}
                      {doc.date && ` · ${doc.date}`}
                    </div>
                  )}
                  {linkedTx && (
                    <div style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                      מקושר: {linkedTx.description} ({Math.abs(linkedTx.amount).toLocaleString('he-IL')}₪)
                    </div>
                  )}
                </div>

                {/* Extracted data */}
                {doc.amount != null && (
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#475569' }}>
                    <div>
                      <span style={{ color: '#94a3b8' }}>סכום: </span>
                      {doc.amount?.toLocaleString('he-IL')}₪
                    </div>
                    {doc.vatAmount != null && (
                      <div>
                        <span style={{ color: '#94a3b8' }}>מע״מ: </span>
                        {doc.vatAmount?.toLocaleString('he-IL')}₪
                      </div>
                    )}
                  </div>
                )}

                {/* Mismatch warning */}
                {doc.mismatch && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#dc2626',
                    background: '#fef2f2',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                  }}>
                    {doc.mismatchDetails || 'אי התאמה'}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {extracting === doc.id ? (
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>מחלץ...</span>
                  ) : (
                    <>
                      {!doc.amount && doc.driveFileId && (
                        <button
                          onClick={() => handleReExtract(doc)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            color: '#475569',
                          }}
                        >
                          חלץ נתונים
                        </button>
                      )}

                      {linkingDocId === doc.id ? (
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          <select
                            onChange={e => {
                              if (e.target.value && doc.id) {
                                handleLinkTransaction(doc.id, Number(e.target.value))
                              }
                            }}
                            defaultValue=""
                            style={{
                              padding: '0.25rem',
                              fontSize: '0.75rem',
                              border: '1px solid #cbd5e1',
                              borderRadius: '0.25rem',
                              maxWidth: '200px',
                            }}
                          >
                            <option value="">בחר עסקה...</option>
                            {transactions.map(tx => (
                              <option key={tx.id} value={tx.id}>
                                {tx.description} ({Math.abs(tx.amount).toLocaleString('he-IL')}₪) {tx.date}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => setLinkingDocId(null)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '0.25rem',
                              cursor: 'pointer',
                              color: '#475569',
                            }}
                          >
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <>
                          {doc.transactionId ? (
                            <button
                              onClick={() => doc.id && handleUnlinkTransaction(doc.id)}
                              style={{
                                padding: '0.25rem 0.5rem',
                                fontSize: '0.75rem',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                color: '#2563eb',
                              }}
                            >
                              נתק עסקה
                            </button>
                          ) : (
                            <button
                              onClick={() => setLinkingDocId(doc.id ?? null)}
                              style={{
                                padding: '0.25rem 0.5rem',
                                fontSize: '0.75rem',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                color: '#2563eb',
                              }}
                            >
                              קשר לעסקה
                            </button>
                          )}
                        </>
                      )}

                      <button
                        onClick={() => handleDelete(doc)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          color: '#dc2626',
                        }}
                      >
                        מחק
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <YesNoModal
        isOpen={deleteConfirm.isOpen}
        question={`למחוק את ${deleteConfirm.doc?.fileName ?? ''}?`}
        onYes={confirmDelete}
        onNo={() => setDeleteConfirm({ isOpen: false, doc: null })}
      />
    </div>
  )
}

// --- Helpers ---

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function getGmailToken(): Promise<string | null> {
  // Re-use the token from gmailService - it stores in tokenStore
  const { tokenStore } = await import('@/app/stores/tokenStore')
  return tokenStore.load('google_gmail_token')
}
