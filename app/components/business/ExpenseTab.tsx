'use client'

import React, { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { db, type Transaction, type Business, type ExpenseDocument } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { businessStore } from '@/app/stores/businessStore'
import { appSettingsStore, type AccountOwners } from '@/app/stores/appSettingsStore'
import { getTransactionAttributedUid } from '@/app/utils/transactionAttribution'
import { hasGmailAccess, requestGmailAccess } from '@/app/services/gmailService'
import { hasGoogleAccess, requestGoogleAccess, uploadExpenseDocument, downloadDriveFile } from '@/app/services/googleDriveService'
import { matchReceiptForTransaction, parseDateFolder } from '@/app/services/receiptMatchService'
import { partnerStore, type Partner as Participant } from '@/app/stores/partnerStore'
import { getUser } from '@/app/stores/authStore'
import type { Category } from '@/app/types/category'
import PartnerPaidImportModal from '@/app/components/business/PartnerPaidImportModal'

type ExpenseTabProps = {
  businessId: number
}

type MatchStatus = 'idle' | 'searching' | 'matched' | 'no-match' | 'error'

type ExtractedData = {
  vendor?: string; documentTitle?: string; description?: string
  date?: string; amount?: number; vatAmount?: number
  [key: string]: unknown
}

async function extractFromFile(file: File, transaction: { date: string; description: string; amount: number }, claudeApiKey: string): Promise<ExtractedData> {
  if (!claudeApiKey) return {}
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)

  const isPdf = file.type === 'application/pdf'
  const isImage = file.type.startsWith('image/')
  if (!isPdf && !isImage) return {}

  console.log(`[ExpenseTab] Extracting from ${isPdf ? 'PDF' : 'image'}:`, file.name)
  const extractRes = await fetch('/api/match-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(isPdf ? {
      action: 'extract-pdf', pdfBase64: base64, transaction, claudeApiKey,
    } : {
      action: 'extract-image', imageBase64: base64, mediaType: file.type, transaction, claudeApiKey,
    }),
  })
  const extracted = await extractRes.json()
  console.log('[ExpenseTab] Extraction result:', extracted)
  return extracted.error ? {} : extracted
}

export default function ExpenseTab({ businessId }: ExpenseTabProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [filterMode, setFilterMode] = useState<'month' | 'year' | 'all'>('all')
  const [partyFilter, setPartyFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [matchStatus, setMatchStatus] = useState<Record<number, MatchStatus>>({})
  const [matchedDocs, setMatchedDocs] = useState<Record<number, ExpenseDocument[]>>({})
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
    const docMap: Record<number, ExpenseDocument[]> = {}
    const statusMap: Record<number, MatchStatus> = {}
    for (const doc of docs) {
      if (doc.transactionId) {
        if (!docMap[doc.transactionId]) docMap[doc.transactionId] = []
        docMap[doc.transactionId].push(doc)
        statusMap[doc.transactionId] = 'matched'
      }
    }
    setMatchedDocs(docMap)
    setMatchStatus(statusMap)
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
      const result = await matchReceiptForTransaction(
        { id: t.id, date: t.date, description: t.description, merchant: t.merchant, amount: t.amount },
        claudeApiKey,
      )
      if (result.status === 'matched') {
        await db.expenseDocuments.add(result.doc)
        setMatchedDocs(d => ({ ...d, [t.id!]: [...(d[t.id!] || []), result.doc] }))
      }
      setMatchStatus(s => ({ ...s, [t.id!]: result.status }))
    } catch {
      setMatchStatus(s => ({ ...s, [t.id!]: 'error' }))
    }
  }

  const handleUploadReceipt = async (t: Transaction, files: FileList) => {
    if (!t.id || files.length === 0) return
    setMatchStatus(s => ({ ...s, [t.id!]: 'searching' }))

    try {
      const desc = (t.merchant || t.description || '').trim()
      const newDocs: ExpenseDocument[] = []

      for (const file of Array.from(files)) {
        const uploaded = await uploadExpenseDocument(file, parseDateFolder(t.date))
        const finalExtracted = await extractFromFile(file, { date: t.date, description: desc, amount: t.amount }, claudeApiKey)

        const doc: ExpenseDocument = {
          transactionId: t.id,
          fileName: file.name,
          vendor: finalExtracted.vendor || desc,
          amount: finalExtracted.amount,
          vatAmount: finalExtracted.vatAmount,
          date: finalExtracted.date,
          description: finalExtracted.documentTitle || finalExtracted.description,
          driveFileId: uploaded.fileId,
          driveWebViewLink: uploaded.webViewLink,
          extractedData: finalExtracted,
          sourceType: 'upload',
          uploadedAt: new Date().toISOString(),
        }
        await db.expenseDocuments.add(doc)
        newDocs.push(doc)
      }

      if (newDocs.length > 0) {
        setMatchedDocs(d => ({ ...d, [t.id!]: [...(d[t.id!] || []), ...newDocs] }))
      }
      setMatchStatus(s => ({ ...s, [t.id!]: 'matched' }))
    } catch (err) {
      console.error('[ExpenseTab] Upload error:', err)
      setMatchStatus(s => ({ ...s, [t.id!]: 'error' }))
    }
  }

  const [showCashForm, setShowCashForm] = useState(false)
  const [cashCategory, setCashCategory] = useState('')
  const [cashFile, setCashFile] = useState<File | null>(null)
  const [cashSaving, setCashSaving] = useState(false)
  const [cashPaidByUid, setCashPaidByUid] = useState<string>('')
  const [showPartnerImportModal, setShowPartnerImportModal] = useState(false)
  // Partner-paid invoices for this business (no transactionId, paidByUid set).
  // Loaded from db.expenseDocuments; surfaced in the Splid summary alongside
  // bank txs that carry paidByUid. (#44)
  const [partnerPaidDocs, setPartnerPaidDocs] = useState<ExpenseDocument[]>([])
  const [participants, setParticipants] = useState<Participant[]>(() =>
    typeof window !== 'undefined' ? partnerStore.getCachedByBusinessId(businessId) : []
  )
  const [accountOwners, setAccountOwners] = useState<AccountOwners>({})
  const ownerUid = business?.userId
  const ownerLabel = useMemo(() => {
    return participants.find((p) => p.uid === ownerUid)?.label || ownerUid || '—'
  }, [participants, ownerUid])

  const resolvePartyUid = (t: Pick<Transaction, 'paidByUid' | 'cardNumber' | 'accountNumber'>) => {
    return getTransactionAttributedUid(t, accountOwners, ownerUid)
  }

  const resolvePartyLabel = (uid: string | undefined) => {
    if (!uid) return '—'
    return participants.find((p) => p.uid === uid)?.label || (uid === ownerUid ? ownerLabel : uid)
  }

  const partyOptions = useMemo(() => {
    const options = new Map<string, string>()
    if (ownerUid) options.set(ownerUid, ownerLabel)
    for (const participant of participants) {
      if (participant.uid) options.set(participant.uid, participant.label)
    }
    for (const t of transactions) {
      const uid = resolvePartyUid(t)
      if (uid) options.set(uid, resolvePartyLabel(uid))
    }
    for (const d of partnerPaidDocs) {
      const uid = d.paidByUid || ownerUid
      if (uid) options.set(uid, resolvePartyLabel(uid))
    }
    return Array.from(options, ([value, label]) => ({ value, label }))
  }, [ownerUid, ownerLabel, participants, transactions, partnerPaidDocs, accountOwners])

  const visibleTransactions = useMemo(() => {
    return transactions.filter((t) => partyFilter === 'all' || resolvePartyUid(t) === partyFilter)
  }, [transactions, partyFilter, accountOwners, ownerUid])

  const visiblePartnerPaidDocs = useMemo(() => {
    return partnerPaidDocs.filter((d) => partyFilter === 'all' || (d.paidByUid || ownerUid) === partyFilter)
  }, [partnerPaidDocs, partyFilter, ownerUid])

  // Read partner list from cache for instant render; refresh in background; subscribe to store updates.
  useEffect(() => {
    if (!business) return
    const syncId = business.syncId
    partnerStore.recordBusiness(business.id, syncId)
    setParticipants(partnerStore.getCached(syncId))
    const unsub = partnerStore.subscribe(() => setParticipants(partnerStore.getCached(syncId)))
    void partnerStore.refresh(syncId)
    return unsub
  }, [business?.id, business?.syncId])

  // Load partner-paid expense docs (no bank tx, paidByUid set) for this business.
  const loadPartnerPaidDocs = async () => {
    if (!business?.id) return
    const docs = await db.expenseDocuments
      .filter(
        (d) => d.businessId === business.id && !d.transactionId && !!d.paidByUid,
      )
      .toArray()
    setPartnerPaidDocs(docs)
  }
  useEffect(() => {
    void loadPartnerPaidDocs()
  }, [business?.id])

  useEffect(() => {
    void appSettingsStore.getAccountOwners().then(setAccountOwners)
  }, [])

  useEffect(() => {
    setPartyFilter('all')
  }, [businessId])

  // Default cashPaidByUid to current user when participants change.
  useEffect(() => {
    if (cashPaidByUid) return // user picked one already
    const u = getUser()
    if (u && participants.find(p => p.uid === u.uid)) {
      setCashPaidByUid(u.uid)
    } else if (participants.length > 0) {
      setCashPaidByUid(participants[0].uid)
    }
  }, [participants, cashPaidByUid])

  const handleAddCash = async () => {
    if (!cashFile) return
    setCashSaving(true)
    try {
      // Extract data from document first
      const today = new Date()
      const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
      const extracted = await extractFromFile(cashFile, { date: todayStr, description: 'הוצאה במזומן', amount: 0 }, claudeApiKey)

      // Use extracted date or today, normalize to DD/MM/YYYY
      let date = extracted.date || todayStr
      const dateParts = date.split('/')
      const day = dateParts[0].padStart(2, '0')
      const monthNum = dateParts[1].padStart(2, '0')
      const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2]
      date = `${day}/${monthNum}/${year}`
      const month = `${monthNum}/${year}`
      const amount = extracted.amount ? -Math.abs(extracted.amount) : 0

      // Create transaction
      const txId = await db.transactions.add({
        type: 'cash',
        date,
        amount,
        description: extracted.vendor || extracted.description || 'הוצאה במזומן',
        category: cashCategory || categories[0]?.name,
        isFixed: false,
        ...(cashPaidByUid ? { paidByUid: cashPaidByUid } : {}),
        month,
        importedAt: new Date().toISOString(),
        fileId: 'cash',
      })

      // Upload file to Drive
      const dateFolder = { year, month: monthNum }
      const uploaded = await uploadExpenseDocument(cashFile, dateFolder)

      // Save expense document
      await db.expenseDocuments.add({
        transactionId: txId as number,
        fileName: cashFile.name,
        vendor: extracted.vendor,
        amount: extracted.amount,
        vatAmount: extracted.vatAmount,
        date,
        description: extracted.documentTitle || extracted.description,
        driveFileId: uploaded.fileId,
        driveWebViewLink: uploaded.webViewLink,
        extractedData: extracted,
        sourceType: 'upload',
        uploadedAt: new Date().toISOString(),
      })

      // Reset form, switch to the new month (useEffect will reload transactions)
      setCashCategory('')
      setCashFile(null)
      setShowCashForm(false)
      await loadAvailableMonths()
      setFilterMode('month')
      setSelectedMonth(month)
    } catch (err) {
      console.error('[ExpenseTab] Cash expense error:', err)
    }
    setCashSaving(false)
  }

  const getMonthTotal = () => {
    return visibleTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) +
      visiblePartnerPaidDocs.reduce((sum, d) => sum + Math.abs(d.amount || 0), 0)
  }

  const getVatTotal = () => {
    return visibleTransactions.reduce((sum, t) => {
      const docs = matchedDocs[t.id!]
      if (!docs) return sum
      return sum + docs.reduce((s, d) => s + (d.vatAmount || 0), 0)
    }, 0) + visiblePartnerPaidDocs.reduce((sum, d) => sum + (d.vatAmount || 0), 0)
  }

  const handleUnlink = async (txId: number) => {
    const docs = matchedDocs[txId]
    if (!docs?.length) return
    for (const doc of docs) {
      if (doc.id) await db.expenseDocuments.delete(doc.id)
    }
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

  const [editingTxId, setEditingTxId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<{ description: string; category: string; amount?: string }>({ description: '', category: '' })
  const [editingIsCash, setEditingIsCash] = useState(false)

  const startEdit = (t: Transaction) => {
    setEditingTxId(t.id!)
    setEditingIsCash(t.type === 'cash')
    setEditValues({ description: t.description, category: t.category || '', amount: String(Math.abs(t.amount)) })
  }

  const saveEdit = async () => {
    if (editingTxId == null) return
    const updates: Partial<Transaction> = {
      description: editValues.description,
      category: editValues.category,
    }
    if (editingIsCash && editValues.amount) {
      updates.amount = -Math.abs(parseFloat(editValues.amount))
    }
    await db.transactions.update(editingTxId, updates)
    setEditingTxId(null)
    await loadTransactions()
  }

  const cancelEdit = () => setEditingTxId(null)

  const handleDeleteCash = async (t: Transaction) => {
    if (!t.id || t.type !== 'cash') return
    // Record deletions for sync, then hard-delete locally
    const docs = matchedDocs[t.id]
    if (docs?.length) {
      for (const doc of docs) {
        if (doc.syncId) await appSettingsStore.recordDeletion('expenseDocuments', doc.syncId)
        if (doc.id) await db.expenseDocuments.delete(doc.id)
      }
    }
    if (t.syncId) await appSettingsStore.recordDeletion('transactions', t.syncId)
    await db.transactions.delete(t.id)
    await loadAvailableMonths()
    await loadTransactions()
  }

  const [downloading, setDownloading] = useState(false)

  const handleDownloadAll = async () => {
    const allDocs = Object.values(matchedDocs).flat().filter(d => d.driveFileId)
    if (allDocs.length === 0) return
    setDownloading(true)
    try {
      const zip = new JSZip()
      for (const doc of allDocs) {
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
        {partyOptions.length > 1 && (
          <select
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #e2e8f0',
              fontSize: '1rem',
              direction: 'rtl',
            }}
          >
            <option value="all">צד: הכל</option>
            {partyOptions.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        )}
        {visibleTransactions.length > 0 || visiblePartnerPaidDocs.length > 0 ? (
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
            סה"כ: ₪{getMonthTotal().toLocaleString()}
            {getVatTotal() > 0 && ` (מע״מ: ₪${getVatTotal().toLocaleString()})`}
          </span>
        ) : null}
        {Object.values(matchedDocs).flat().some(d => d.driveFileId) && (
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
        <button
          onClick={() => setShowCashForm(f => !f)}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: '0.375rem',
            border: '1px solid #e2e8f0',
            background: showCashForm ? '#f1f5f9' : '#fff',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          + מזומן
        </button>
        {participants.length > 1 && (
          <button
            onClick={() => setShowPartnerImportModal(true)}
            title="ייבוא מרובה של חשבוניות ששילם שותף — בחר מי שילם וקבצים מרובים, ערוך פרטים, אשר"
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: '1px solid #e2e8f0',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            + ייבוא חשבוניות מ-שותף
          </button>
        )}
      </div>

      {showCashForm && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>נושא</label>
            <select value={cashCategory} onChange={e => setCashCategory(e.target.value)}
              style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', direction: 'rtl', background: '#fff' }}>
              <option value="">בחר</option>
              {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          {participants.length > 1 && (
            <div>
              <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>שולם על ידי</label>
              <select value={cashPaidByUid} onChange={e => setCashPaidByUid(e.target.value)}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', direction: 'rtl', background: '#fff' }}>
                {participants.map(p => <option key={p.uid} value={p.uid}>{p.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>קובץ</label>
            <label className="file-picker" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', borderRadius: '0.375rem' }}>
              <span>{cashFile ? cashFile.name : 'בחר קובץ'}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" onChange={e => setCashFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <button
            onClick={handleAddCash}
            disabled={cashSaving || !cashFile}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: cashSaving || !cashFile ? '#93c5fd' : '#3b82f6',
              color: '#fff',
              cursor: cashSaving ? 'wait' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            {cashSaving ? 'מחלץ נתונים...' : 'הוסף'}
          </button>
        </div>
      )}

      {/* Splid summary intentionally removed from Expenses tab (per Agla
          2026-06-05): it duplicated the Settlement tab. Share % lives in
          Settings; the Settlement tab is the single place to see split
          math. Partner-paid rows are merged into the transactions table
          below so they're visible in context. */}

      {/* Transactions table — bank txs + partner-paid docs as inline rows */}
      {visibleTransactions.length === 0 && visiblePartnerPaidDocs.length === 0 ? (
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
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>שולם ע״י</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>סכום</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>מע״מ</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '80px' }}>קבלה</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((t) => {
                const txId = t.id!
                const status = matchStatus[txId] || 'idle'
                const docs = matchedDocs[txId]
                const firstDoc = docs?.[0]
                const vatTotal = docs?.reduce((s, d) => s + (d.vatAmount || 0), 0)
                const isEditing = editingTxId === txId
                const attributedUid = resolvePartyUid(t)
                return (
                  <tr key={txId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{t.date}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValues.description}
                          onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))}
                          style={{ padding: '0.3rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', width: '100%', direction: 'rtl', boxSizing: 'border-box' }}
                          autoFocus
                        />
                      ) : (
                        <>
                          {firstDoc?.description || firstDoc?.vendor || t.merchant || t.description}
                          <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8' }}>
                            {t.description}
                          </span>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>
                      {isEditing ? (
                        <select
                          value={editValues.category}
                          onChange={e => setEditValues(v => ({ ...v, category: e.target.value }))}
                          style={{ padding: '0.3rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', direction: 'rtl' }}
                        >
                          <option value="">—</option>
                          {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      ) : t.category}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                      {resolvePartyLabel(attributedUid)}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 500, color: '#dc2626' }}>
                      {isEditing && editingIsCash ? (
                        <input
                          type="number"
                          value={editValues.amount || ''}
                          onChange={e => setEditValues(v => ({ ...v, amount: e.target.value }))}
                          style={{ padding: '0.3rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', width: '90px', textAlign: 'left' }}
                        />
                      ) : (
                        <>₪{Math.abs(t.amount).toLocaleString()}</>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#64748b', fontSize: '0.85rem' }}>
                      {vatTotal ? `₪${vatTotal.toLocaleString()}` : ''}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                      {status === 'matched' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                          {docs?.map((doc, i) => (
                            doc.driveWebViewLink ? (
                              <a key={i} href={doc.driveWebViewLink} target="_blank" rel="noopener noreferrer" title={doc.vendor || doc.fileName || 'פתח קבלה'} style={{ color: '#10b981', textDecoration: 'none', fontSize: '0.9rem' }}>📄</a>
                            ) : (
                              <span key={i} title={doc.vendor || 'נמצאה קבלה'} style={{ color: '#10b981' }}>✓</span>
                            )
                          ))}
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
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
                        <label
                          title="העלה קבלה"
                          style={{
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            padding: '0.1rem 0.3rem',
                            opacity: Object.values(matchStatus).includes('searching') ? 0.4 : 1,
                          }}
                        >
                          📎
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const files = e.target.files
                              if (files && files.length > 0) handleUploadReceipt(t, files)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.25rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                          <button onClick={saveEdit} title="שמור" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#10b981', padding: '0.1rem 0.25rem' }}>✓</button>
                          <button onClick={cancelEdit} title="בטל" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', padding: '0.1rem 0.25rem' }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                          <button onClick={() => startEdit(t)} title="ערוך" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0.1rem 0.25rem', color: '#64748b' }}>✎</button>
                          {t.type === 'cash' && (
                            <button onClick={() => handleDeleteCash(t)} title="מחק" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '0.1rem 0.25rem', color: '#dc2626' }}>✕</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {/* Partner-paid invoices (no bank tx) appended as regular rows
                  (#44 follow-up) so they're visible alongside transactions in
                  the same table. Distinguished only by the "שולם ע״י" column
                  + a small badge in the description. */}
              {visiblePartnerPaidDocs.map((d) => {
                const payerLabel = resolvePartyLabel(d.paidByUid || ownerUid)
                return (
                  <tr key={`pp-${d.id}`} style={{ borderBottom: '1px solid #f1f5f9', background: '#fffbeb' }}>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{d.date || '—'}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      {d.vendor || d.fileName}
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#92400e' }}>
                        🧾 חשבונית ששולמה ע״י שותף (אין רישום בנק)
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{d.category || '—'}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{payerLabel}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>
                      ₪{(d.amount ?? 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#64748b' }}>
                      {d.vatAmount != null ? `₪${d.vatAmount.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                      {d.driveWebViewLink ? (
                        <a href={d.driveWebViewLink} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9' }}>
                          קובץ
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <PartnerPaidImportModal
        open={showPartnerImportModal}
        onClose={() => setShowPartnerImportModal(false)}
        businessId={businessId}
        participants={participants}
        categories={subjectStore.getAll()}
        selfUid={getUser()?.uid}
        claudeApiKey={claudeApiKey}
        onImported={(count) => {
          console.log(`[ExpenseTab] Imported ${count} partner-paid invoices`)
          void loadPartnerPaidDocs()
        }}
      />
    </div>
  )
}
