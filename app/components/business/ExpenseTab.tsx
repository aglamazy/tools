'use client'

import React, { useEffect, useState } from 'react'
import JSZip from 'jszip'
import { db, type Transaction, type Business, type ExpenseDocument } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { businessStore } from '@/app/stores/businessStore'
import { hasGmailAccess, requestGmailAccess, searchMessages, fetchMessagesMetadata, fetchMessageBody } from '@/app/services/gmailService'
import { hasGoogleAccess, requestGoogleAccess, uploadExpenseDocument, downloadDriveFile } from '@/app/services/googleDriveService'
import type { Category } from '@/app/types/category'

type ExpenseTabProps = {
  businessId: number
}

type MatchStatus = 'idle' | 'searching' | 'matched' | 'no-match' | 'error'

export default function ExpenseTab({ businessId }: ExpenseTabProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [filterMode, setFilterMode] = useState<'month' | 'year' | 'all'>('month')
  const [loading, setLoading] = useState(true)
  const [matchStatus, setMatchStatus] = useState<Record<number, MatchStatus>>({})
  const [matchedDocs, setMatchedDocs] = useState<Record<number, ExpenseDocument>>({})
  const [claudeApiKey, setClaudeApiKey] = useState<string>('')

  useEffect(() => {
    loadBusiness()
    loadClaudeKey()
  }, [businessId])

  useEffect(() => {
    if (business && (selectedMonth || filterMode !== 'month')) {
      loadTransactions()
    }
  }, [selectedMonth, selectedYear, filterMode, business])

  const loadClaudeKey = async () => {
    const setting = await db.appSettings.where('key').equals('claudeApiKey').first()
    if (setting?.value) setClaudeApiKey(setting.value)
  }

  const loadBusiness = async () => {
    const b = await businessStore.getById(businessId)
    setBusiness(b || null)
    if (b) {
      await loadAvailableMonths()
    }
    setLoading(false)
  }

  const loadAvailableMonths = async () => {
    const categories = subjectStore.getAll().filter(
      (c: Category) => c.type === 'expense' && c.businessId === businessId
    )
    if (categories.length === 0) {
      setAvailableMonths([])
      return
    }

    const categoryNames = categories.map(c => c.name)

    const allTransactions = await db.transactions.toArray()
    const matchingTransactions = allTransactions.filter(
      t => t.category && categoryNames.includes(t.category) && t.amount < 0
    )

    const months = [...new Set(matchingTransactions.map(t => t.month))].sort((a, b) => {
      const [aMonth, aYear] = a.split('/')
      const [bMonth, bYear] = b.split('/')
      return Number(bYear) - Number(aYear) || Number(bMonth) - Number(aMonth)
    })

    setAvailableMonths(months)
    if (months.length > 0 && !selectedMonth) {
      setSelectedMonth(months[0])
    }
  }

  const loadTransactions = async () => {
    const categories = subjectStore.getAll().filter(
      (c: Category) => c.type === 'expense' && c.businessId === businessId
    )
    const categoryNames = categories.map(c => c.name)

    let filteredTransactions: Transaction[]

    if (filterMode === 'all') {
      const allTransactions = await db.transactions.toArray()
      filteredTransactions = allTransactions
    } else if (filterMode === 'year') {
      const allTransactions = await db.transactions.toArray()
      filteredTransactions = allTransactions.filter(t => t.month.endsWith('/' + selectedYear))
    } else {
      filteredTransactions = await db.transactions
        .where('month')
        .equals(selectedMonth)
        .toArray()
    }

    const expenseTransactions = filteredTransactions
      .filter(t => t.category && categoryNames.includes(t.category) && t.amount < 0)
      // Skip later installments — only show first (currentStep === 1 or no installments)
      .filter(t => !t.currentStep || t.currentStep === 1)
      .map(t => {
        // Use full purchase amount for installments
        if (t.totalSteps && t.totalSteps > 1) {
          const fullAmount = t.totalAmount || (t.totalSteps * Math.abs(t.amount))
          return { ...t, amount: -fullAmount }
        }
        return t
      })

    // Sort by date
    expenseTransactions.sort((a, b) => {
      const [aD, aM, aY] = a.date.split('/')
      const [bD, bM, bY] = b.date.split('/')
      return new Date(`${aY}-${aM}-${aD}`).getTime() - new Date(`${bY}-${bM}-${bD}`).getTime()
    })

    setTransactions(expenseTransactions)

    // Load existing matched docs
    const txIds = expenseTransactions.map(t => t.id).filter((id): id is number => id != null)
    const docs = await db.expenseDocuments.where('transactionId').anyOf(txIds).toArray()
    const docMap: Record<number, ExpenseDocument> = {}
    const statusMap: Record<number, MatchStatus> = {}
    for (const doc of docs) {
      if (doc.transactionId) {
        docMap[doc.transactionId] = doc
        statusMap[doc.transactionId] = 'matched'
      }
    }
    setMatchedDocs(docMap)
    setMatchStatus(statusMap)
  }

  const buildDateRange = (dateStr: string) => {
    const parts = dateStr.split(/[/.]/)
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    const year = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10)
    const txDate = new Date(year, month - 1, day)
    const after = new Date(txDate)
    after.setDate(after.getDate() - 3)
    const before = new Date(txDate)
    before.setDate(before.getDate() + 14)
    const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
    return `after:${fmt(after)} before:${fmt(before)}`
  }

  // Load merchant name cache: { "וואי-פיי": "YPAY", ... }
  const getMerchantCache = async (): Promise<Record<string, string>> => {
    const setting = await db.appSettings.where('key').equals('merchantNameCache').first()
    return setting?.value ? JSON.parse(setting.value) : {}
  }

  const saveMerchantCache = async (cache: Record<string, string>) => {
    const existing = await db.appSettings.where('key').equals('merchantNameCache').first()
    if (existing) {
      await db.appSettings.update(existing.id!, { value: JSON.stringify(cache) })
    } else {
      await db.appSettings.add({ key: 'merchantNameCache', value: JSON.stringify(cache), updatedAt: new Date().toISOString() })
    }
  }

  const handleMatchReceipt = async (t: Transaction) => {
    if (!t.id) return
    setMatchStatus(s => ({ ...s, [t.id!]: 'searching' }))

    if (!hasGmailAccess()) {
      const result = await requestGmailAccess()
      if (!result.success) {
        setMatchStatus(s => ({ ...s, [t.id!]: 'error' }))
        return
      }
    }

    try {
      const desc = (t.merchant || t.description || '').trim()
      const dateRange = buildDateRange(t.date)
      const cache = await getMerchantCache()

      let matchedMessageId: string | undefined
      let matchedFrom: string | undefined

      // Check cache first: do we already know the email sender for this merchant?
      const cachedName = cache[desc]
      if (cachedName) {
        console.log('[ExpenseTab] Cache hit:', desc, '→', cachedName)
        const query = `from:${cachedName} (חשבונית OR קבלה OR receipt OR invoice)`
        console.log('[ExpenseTab] Cached search query:', query)
        const result = await searchMessages(query, { searchAllMail: true, maxResults: 5 })
        if (result.messageIds.length > 0) {
          matchedMessageId = result.messageIds[0]
          matchedFrom = cachedName
          console.log('[ExpenseTab] Found via cache:', matchedMessageId)
        }
      }

      // No cache hit (or cached search failed): broad date-range search → Gemini matches
      if (!matchedMessageId) {
        console.log('[ExpenseTab] Broad search with date range')
        const broadQuery = dateRange
        console.log('[ExpenseTab] Broad query:', broadQuery)
        const searchResult = await searchMessages(broadQuery, { searchAllMail: true, maxResults: 30 })
        console.log('[ExpenseTab] Broad search result:', searchResult.messageIds.length, 'messages')

        if (searchResult.error) {
          console.error('[ExpenseTab] Search error:', searchResult.error)
          setMatchStatus(s => ({ ...s, [t.id!]: 'error' }))
          return
        }
        if (searchResult.messageIds.length === 0) {
          console.log('[ExpenseTab] No emails in date range')
          setMatchStatus(s => ({ ...s, [t.id!]: 'no-match' }))
          return
        }

        // Fetch metadata for candidates
        const metaResult = await fetchMessagesMetadata(searchResult.messageIds.slice(0, 20))
        console.log('[ExpenseTab] Metadata:', metaResult.messages.map(m => ({ from: m.from, subject: m.subject?.substring(0, 40) })))
        if (metaResult.error || metaResult.messages.length === 0) {
          setMatchStatus(s => ({ ...s, [t.id!]: 'no-match' }))
          return
        }

        // Gemini picks the best match
        console.log('[ExpenseTab] Sending to Gemini:', { desc, amount: t.amount, candidates: metaResult.messages.length })
        const matchRes = await fetch('/api/match-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'match',
            transaction: { date: t.date, description: desc, amount: t.amount, merchant: t.merchant },
            candidates: metaResult.messages,
          }),
        })
        const matchData = await matchRes.json()
        console.log('[ExpenseTab] Gemini result:', matchData)

        if (!matchData.messageId && matchData.senderHint) {
          // Gemini identified the sender but couldn't find the receipt — search again narrowly
          console.log('[ExpenseTab] Gemini hint: sender is', matchData.senderHint, '— searching narrowly')
          const narrowQuery = `from:${matchData.senderHint} (חשבונית OR קבלה OR receipt OR invoice) ${dateRange}`
          console.log('[ExpenseTab] Narrow query:', narrowQuery)
          const narrowResult = await searchMessages(narrowQuery, { searchAllMail: true, maxResults: 5 })
          console.log('[ExpenseTab] Narrow result:', narrowResult.messageIds.length, 'messages')
          if (narrowResult.messageIds.length > 0) {
            matchedMessageId = narrowResult.messageIds[0]
            // Cache the sender for future use
            const senderDomain = matchData.senderHint.includes('@') ? matchData.senderHint.split('@')[1] : matchData.senderHint
            cache[desc] = senderDomain
            await saveMerchantCache(cache)
            console.log('[ExpenseTab] Cached from hint:', desc, '→', senderDomain)
          }
        } else if (matchData.messageId) {
          matchedMessageId = matchData.messageId
        }

        if (!matchedMessageId) {
          setMatchStatus(s => ({ ...s, [t.id!]: 'no-match' }))
          return
        }

        // Cache the mapping: extract sender domain from the matched email
        if (!cache[desc]) {
          const matched = metaResult.messages.find(m => m.id === matchedMessageId)
          if (matched?.from) {
            const emailMatch = matched.from.match(/<([^>]+)>/)
            const senderDomain = emailMatch ? emailMatch[1].split('@')[1] : matched.from
            cache[desc] = senderDomain
            await saveMerchantCache(cache)
            console.log('[ExpenseTab] Cached:', desc, '→', senderDomain)
          }
        }
      }

      // Fetch email body
      console.log('[ExpenseTab] Fetching email body for', matchedMessageId)
      const bodyResult = await fetchMessageBody(matchedMessageId!)
      console.log('[ExpenseTab] Body length:', bodyResult.body?.length, 'error:', bodyResult.error)
      if (bodyResult.error || !bodyResult.body) {
        setMatchStatus(s => ({ ...s, [t.id!]: 'no-match' }))
        return
      }

      // Claude extracts receipt data (or save without extraction if no key)
      console.log('[ExpenseTab] Claude API key present:', !!claudeApiKey)
      if (!claudeApiKey) {
        const doc: ExpenseDocument = {
          transactionId: t.id,
          fileName: 'gmail-match',
          sourceType: 'gmail',
          gmailMessageId: matchedMessageId,
          uploadedAt: new Date().toISOString(),
        }
        await db.expenseDocuments.add(doc)
        setMatchedDocs(d => ({ ...d, [t.id!]: doc }))
        setMatchStatus(s => ({ ...s, [t.id!]: 'matched' }))
        return
      }

      console.log('[ExpenseTab] Sending to Claude for extraction...')
      const extractRes = await fetch('/api/match-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extract',
          emailBody: bodyResult.body,
          transaction: { date: t.date, description: desc, amount: t.amount },
          claudeApiKey,
        }),
      })
      const extracted = await extractRes.json()
      console.log('[ExpenseTab] Claude extraction:', extracted)

      // If there's a document URL, download the PDF and upload to Drive
      let driveFileId: string | undefined
      let driveWebViewLink: string | undefined
      if (extracted.documentUrl) {
        console.log('[ExpenseTab] Downloading PDF from:', extracted.documentUrl)
        try {
          const dlRes = await fetch('/api/match-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'download-pdf', url: extracted.documentUrl }),
          })
          const dlData = await dlRes.json()
          if (dlData.base64) {
            // Ensure Google Drive access
            if (!(await hasGoogleAccess())) {
              await requestGoogleAccess()
            }
            if (await hasGoogleAccess()) {
              // Convert base64 to File for upload
              const binary = atob(dlData.base64)
              const bytes = new Uint8Array(binary.length)
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
              const blob = new Blob([bytes], { type: dlData.contentType || 'application/pdf' })
              const fileName = dlData.fileName || `receipt-${extracted.vendor || 'unknown'}.pdf`
              const file = new File([blob], fileName, { type: blob.type })
              console.log('[ExpenseTab] Uploading to Drive:', fileName)
              const uploaded = await uploadExpenseDocument(file)
              driveFileId = uploaded.fileId
              driveWebViewLink = uploaded.webViewLink
              console.log('[ExpenseTab] Uploaded to Drive:', driveWebViewLink)
            }
          }
        } catch (err) {
          console.warn('[ExpenseTab] PDF download/upload failed:', err)
          // Fall back to raw URL
          driveWebViewLink = extracted.documentUrl
        }
      }

      const doc: ExpenseDocument = {
        transactionId: t.id,
        fileName: driveFileId ? 'drive-upload' : 'gmail-match',
        vendor: extracted.vendor,
        amount: extracted.amount,
        vatAmount: extracted.vatAmount,
        date: extracted.date,
        description: extracted.description,
        driveFileId,
        driveWebViewLink,
        extractedData: extracted,
        sourceType: 'gmail',
        gmailMessageId: matchedMessageId,
        uploadedAt: new Date().toISOString(),
      }
      await db.expenseDocuments.add(doc)
      setMatchedDocs(d => ({ ...d, [t.id!]: doc }))
      setMatchStatus(s => ({ ...s, [t.id!]: 'matched' }))
    } catch (err) {
      console.error('[ExpenseTab] Match error:', err)
      setMatchStatus(s => ({ ...s, [t.id!]: 'error' }))
    }
  }

  const getMonthTotal = () => {
    return transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }

  const getVatTotal = () => {
    return transactions.reduce((sum, t) => {
      const doc = matchedDocs[t.id!]
      return sum + (doc?.vatAmount || 0)
    }, 0)
  }

  const handleUnlink = async (txId: number) => {
    const doc = matchedDocs[txId]
    if (!doc?.id) return
    await db.expenseDocuments.delete(doc.id)
    setMatchedDocs(d => {
      const next = { ...d }
      delete next[txId]
      return next
    })
    setMatchStatus(s => {
      const next = { ...s }
      delete next[txId]
      return next
    })
  }

  const [downloading, setDownloading] = useState(false)

  const handleDownloadAll = async () => {
    const docsWithFiles = Object.values(matchedDocs).filter(d => d.driveFileId)
    if (docsWithFiles.length === 0) return
    setDownloading(true)
    try {
      const zip = new JSZip()
      for (const doc of docsWithFiles) {
        const { base64, mimeType } = await downloadDriveFile(doc.driveFileId!)
        const ext = mimeType.includes('pdf') ? 'pdf' : 'bin'
        const name = `${doc.vendor || 'receipt'}-${doc.date || 'unknown'}.${ext}`
        zip.file(name, base64, { base64: true })
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `expenses-${filterMode === 'month' ? selectedMonth.replace('/', '-') : filterMode === 'year' ? selectedYear : 'all'}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Zip download failed:', err)
    }
    setDownloading(false)
  }

  if (loading) {
    return <p>טוען...</p>
  }

  if (!business) {
    return <p>עסק לא נמצא</p>
  }

  const categories = subjectStore.getAll().filter(
    (c: Category) => c.type === 'expense' && c.businessId === businessId
  )

  if (categories.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        <p>אין נושאי הוצאה משויכים לעסק זה.</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          ניתן לשייך נושאי הוצאה בהגדרות → נושאים
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filter selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 600 }}>תקופה:</label>
        <select
          value={filterMode}
          onChange={(e) => {
            const mode = e.target.value as 'month' | 'year' | 'all'
            setFilterMode(mode)
            if (mode === 'year' && !selectedYear) {
              const years = [...new Set(availableMonths.map(m => m.split('/')[1]))].sort((a, b) => Number(b) - Number(a))
              if (years.length > 0) setSelectedYear(years[0])
            }
          }}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: '1px solid #e2e8f0',
            fontSize: '1rem',
            direction: 'rtl',
          }}
        >
          <option value="month">חודש</option>
          <option value="year">שנה</option>
          <option value="all">הכל</option>
        </select>
        {filterMode === 'month' && (
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #e2e8f0',
              fontSize: '1rem',
              direction: 'rtl',
            }}
          >
            {availableMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        {filterMode === 'year' && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #e2e8f0',
              fontSize: '1rem',
              direction: 'rtl',
            }}
          >
            {[...new Set(availableMonths.map(m => m.split('/')[1]))].sort((a, b) => Number(b) - Number(a)).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
        {transactions.length > 0 && (
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
            סה"כ: ₪{getMonthTotal().toLocaleString()}
            {getVatTotal() > 0 && ` (מע״מ: ₪${getVatTotal().toLocaleString()})`}
          </span>
        )}
        {Object.values(matchedDocs).some(d => d.driveFileId) && (
          <button
            onClick={handleDownloadAll}
            disabled={downloading}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: '1px solid #e2e8f0',
              background: downloading ? '#f1f5f9' : '#fff',
              cursor: downloading ? 'wait' : 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {downloading ? '...מוריד' : '📥 הורד הכל (ZIP)'}
          </button>
        )}
      </div>

      {/* Transactions table */}
      {transactions.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
          אין הוצאות בתקופה זו
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>תאריך</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>תיאור</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>נושא</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>סכום</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>מע״מ</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '80px' }}>קבלה</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const txId = t.id!
                const status = matchStatus[txId] || 'idle'
                const doc = matchedDocs[txId]
                return (
                  <tr key={txId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{t.date}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      {doc?.description || doc?.vendor || t.merchant || t.description}
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8' }}>
                        {t.description}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{t.category}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 500, color: '#dc2626' }}>
                      ₪{Math.abs(t.amount).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#64748b', fontSize: '0.85rem' }}>
                      {doc?.vatAmount != null ? `₪${doc.vatAmount.toLocaleString()}` : ''}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                      {status === 'matched' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                          {doc?.driveWebViewLink ? (
                            <a href={doc.driveWebViewLink} target="_blank" rel="noopener noreferrer" title={doc?.vendor || 'פתח קבלה'} style={{ color: '#10b981', textDecoration: 'none', fontSize: '0.9rem' }}>📄</a>
                          ) : (
                            <span title={doc?.vendor || 'נמצאה קבלה'} style={{ color: '#10b981' }}>✓</span>
                          )}
                          <button
                            onClick={() => handleUnlink(txId)}
                            title="הסר קישור"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.7rem', padding: 0 }}
                          >✕</button>
                        </div>
                      ) : status === 'searching' ? (
                        <span style={{ color: '#64748b' }}>...</span>
                      ) : status === 'no-match' ? (
                        <button
                          onClick={() => handleMatchReceipt(t)}
                          disabled={Object.values(matchStatus).includes('searching')}
                          title="לא נמצאה קבלה — לחץ לחיפוש נוסף"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', fontSize: '0.85rem', padding: '0.1rem 0.3rem' }}
                        >לא נמצא</button>
                      ) : status === 'error' ? (
                        <button
                          onClick={() => handleMatchReceipt(t)}
                          disabled={Object.values(matchStatus).includes('searching')}
                          title="שגיאה — לחץ לניסיון נוסף"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.85rem', padding: '0.1rem 0.3rem' }}
                        >שגיאה</button>
                      ) : (
                        <button
                          onClick={() => handleMatchReceipt(t)}
                          disabled={Object.values(matchStatus).includes('searching')}
                          title="חפש קבלה ב-Gmail"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            padding: '0.1rem 0.3rem',
                            opacity: Object.values(matchStatus).includes('searching') ? 0.4 : 1,
                          }}
                        >
                          🔍
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
