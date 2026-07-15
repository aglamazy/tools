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
import ExpenseFiltersBar from '@/app/components/business/ExpenseFiltersBar'
import ExpenseCashForm from '@/app/components/business/ExpenseCashForm'
import ExpenseRowsTable from '@/app/components/business/ExpenseRowsTable'
import ExpenseMonthSupplierPivot from '@/app/components/business/ExpenseMonthSupplierPivot'
import DuplicateTransactionsModal from '@/app/components/DuplicateTransactionsModal'
import type { ExpenseTableRow, MatchStatus } from '@/app/components/business/expenseTabTypes'
import { useToast } from '@/app/components/ToastContainer'
import { normalizeDate, parseDateMs } from '@/app/utils/parsers/shared'

type ExpenseTabProps = {
  businessId: number
}

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
  const [viewMode, setViewMode] = useState<'list' | 'pivot'>('list')
  const [business, setBusiness] = useState<Business | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [filterMode, setFilterMode] = useState<'month' | 'year' | 'all'>('all')
  const [partyFilter, setPartyFilter] = useState<string>('all')
  const [amountMinFilter, setAmountMinFilter] = useState<string>('')
  const [amountMaxFilter, setAmountMaxFilter] = useState<string>('')
  const [sortKey, setSortKey] = useState<'date' | 'party' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [matchStatus, setMatchStatus] = useState<Record<number, MatchStatus>>({})
  const [matchedDocs, setMatchedDocs] = useState<Record<number, ExpenseDocument[]>>({})
  const [claudeApiKey, setClaudeApiKey] = useState<string>('')
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const { showToast } = useToast()

  useEffect(() => {
    loadBusiness()
    loadClaudeKey()
    subjectStore.getAll().then(setAllCategories)
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
    const categories = (await subjectStore.getAll()).filter(
      (c: Category) => c.type === 'expense' && c.businessId === businessId && !c.excludeFromBusinessTotals
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

const parseSortableDate = (date?: string) => parseDateMs(date)

  const loadTransactions = async () => {
    const categories = (await subjectStore.getAll()).filter(
      (c: Category) => c.type === 'expense' && c.businessId === businessId && !c.excludeFromBusinessTotals
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
      return parseDateMs(a.date) - parseDateMs(b.date)
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
    } catch (err) {
      // A providerError (bad model id, depleted credits, rate limit) is
      // thrown here instead of silently skipped — surface the real reason,
      // not just a generic failed-search state.
      showToast('error', err instanceof Error ? err.message : 'שגיאה בחיפוש קבלה')
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
          externalTxRef: typeof finalExtracted.externalTxRef === 'string' ? finalExtracted.externalTxRef : undefined,
          referenceNumber: typeof finalExtracted.referenceNumber === 'string' ? finalExtracted.referenceNumber : undefined,
          docType:
            finalExtracted.docType === 'invoice' ||
            finalExtracted.docType === 'receipt' ||
            finalExtracted.docType === 'receipt-invoice' ||
            finalExtracted.docType === 'unknown'
              ? finalExtracted.docType
              : undefined,
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

  const visibleRows = useMemo(() => {
    const minAmount = amountMinFilter.trim() ? Number(amountMinFilter) : null
    const maxAmount = amountMaxFilter.trim() ? Number(amountMaxFilter) : null
    const rows: ExpenseTableRow[] = []

    for (const t of transactions) {
      const partyUid = resolvePartyUid(t)
      const amount = Math.abs(t.amount)
      if (partyFilter !== 'all' && partyUid !== partyFilter) continue
      if (minAmount != null && amount < minAmount) continue
      if (maxAmount != null && amount > maxAmount) continue
      rows.push({
        kind: 'transaction',
        id: t.id!,
        date: t.date,
        partyUid,
        partyLabel: resolvePartyLabel(partyUid),
        amount,
        vatAmount: matchedDocs[t.id!]?.reduce((s, d) => s + (d.vatAmount || 0), 0) || 0,
        transaction: t,
      })
    }

    for (const d of partnerPaidDocs) {
      const partyUid = d.paidByUid || ownerUid
      const amount = Math.abs(d.amount || 0)
      if (partyFilter !== 'all' && partyUid !== partyFilter) continue
      if (minAmount != null && amount < minAmount) continue
      if (maxAmount != null && amount > maxAmount) continue
      rows.push({
        kind: 'partnerDoc',
        id: d.id!,
        date: d.date || '',
        partyUid,
        partyLabel: resolvePartyLabel(partyUid),
        amount,
        vatAmount: d.vatAmount || 0,
        doc: d,
      })
    }

    rows.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'amount':
          return (a.amount - b.amount) * dir
        case 'party':
          return a.partyLabel.localeCompare(b.partyLabel, 'he') * dir
        case 'date':
        default: {
          return (parseSortableDate(a.date) - parseSortableDate(b.date)) * dir
        }
      }
    })

    return rows
  }, [transactions, partnerPaidDocs, partyFilter, amountMinFilter, amountMaxFilter, sortKey, sortDir, accountOwners, ownerUid, participants, matchedDocs])

  const visibleTransactions = useMemo(
    () => visibleRows.flatMap((row) => (row.kind === 'transaction' ? [row.transaction] : [])),
    [visibleRows],
  )

  const visiblePartnerPaidDocs = useMemo(
    () => visibleRows.flatMap((row) => (row.kind === 'partnerDoc' ? [row.doc] : [])),
    [visibleRows],
  )

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

      // Use extracted date or today, normalize through the shared parser.
      const canonicalDate = (() => {
        const extractedCanonical = normalizeDate(extracted.date)
        if (extractedCanonical && /^\d{4}-\d{2}-\d{2}$/.test(extractedCanonical)) {
          return extractedCanonical
        }
        return normalizeDate(todayStr) || '1970-01-01'
      })()
      const [year, monthNum, day] = canonicalDate.split('-')
      const date = `${day}/${monthNum}/${year}`
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
        externalTxRef: typeof extracted.externalTxRef === 'string' ? extracted.externalTxRef : undefined,
        referenceNumber: typeof extracted.referenceNumber === 'string' ? extracted.referenceNumber : undefined,
        docType:
          extracted.docType === 'invoice' ||
          extracted.docType === 'receipt' ||
          extracted.docType === 'receipt-invoice' ||
          extracted.docType === 'unknown'
            ? extracted.docType
            : undefined,
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
    return visibleRows.reduce((sum, row) => sum + row.amount, 0)
  }

  const getVatTotal = () => {
    return visibleRows.reduce((sum, row) => sum + row.vatAmount, 0)
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

  const onSort = (key: 'date' | 'party' | 'amount') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'party' ? 'asc' : 'desc') }
  }

  if (loading) {
    return <p>טוען...</p>
  }

  if (!business) {
    return <p>עסק לא נמצא</p>
  }

  const categories = allCategories.filter(
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
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        <button
          onClick={() => setViewMode('list')}
          style={{
            padding: '0.4rem 0.9rem', borderRadius: '0.375rem 0 0 0.375rem', border: '1px solid #e2e8f0',
            background: viewMode === 'list' ? '#3b82f6' : '#fff', color: viewMode === 'list' ? '#fff' : '#0f172a',
            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
          }}
        >
          רשימה
        </button>
        <button
          onClick={() => setViewMode('pivot')}
          style={{
            padding: '0.4rem 0.9rem', borderRadius: '0 0.375rem 0.375rem 0', border: '1px solid #e2e8f0', borderRight: 'none',
            background: viewMode === 'pivot' ? '#3b82f6' : '#fff', color: viewMode === 'pivot' ? '#fff' : '#0f172a',
            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
          }}
        >
          טבלה
        </button>
        {filterMode === 'month' && selectedMonth && (
          <button
            onClick={() => setShowDuplicates(true)}
            title="בדוק תנועות כפולות בחודש הנבחר (למשל אותו חיוב שיובא גם מ-XLS וגם מ-PDF)"
            style={{
              marginRight: '0.5rem', padding: '0.4rem 0.9rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0',
              background: '#fff', color: '#0f172a', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
            }}
          >
            בדוק כפילויות
          </button>
        )}
      </div>

      {showDuplicates && (
        <DuplicateTransactionsModal
          isOpen={showDuplicates}
          month={selectedMonth}
          onClose={() => setShowDuplicates(false)}
          onDeleted={() => { void loadTransactions() }}
        />
      )}

      {viewMode === 'pivot' ? (
        <ExpenseMonthSupplierPivot businessId={businessId} />
      ) : (
        <>
          <ExpenseFiltersBar
            filterMode={filterMode}
            setFilterMode={setFilterMode}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            availableMonths={availableMonths}
            partyOptions={partyOptions}
            partyFilter={partyFilter}
            setPartyFilter={setPartyFilter}
            amountMinFilter={amountMinFilter}
            setAmountMinFilter={setAmountMinFilter}
            amountMaxFilter={amountMaxFilter}
            setAmountMaxFilter={setAmountMaxFilter}
            showTotals={visibleTransactions.length > 0 || visiblePartnerPaidDocs.length > 0}
            monthTotal={getMonthTotal()}
            vatTotal={getVatTotal()}
            hasDownloadable={Object.values(matchedDocs).flat().some(d => d.driveFileId)}
            downloading={downloading}
            onDownloadAll={handleDownloadAll}
            showCashForm={showCashForm}
            setShowCashForm={setShowCashForm}
            hasMultipleParticipants={participants.length > 1}
            onOpenPartnerImport={() => setShowPartnerImportModal(true)}
          />

          {showCashForm && (
            <ExpenseCashForm
              categories={categories}
              participants={participants}
              cashCategory={cashCategory}
              setCashCategory={setCashCategory}
              cashPaidByUid={cashPaidByUid}
              setCashPaidByUid={setCashPaidByUid}
              cashFile={cashFile}
              setCashFile={setCashFile}
              cashSaving={cashSaving}
              onSubmit={handleAddCash}
            />
          )}

          {/* Splid summary intentionally removed from Expenses tab (per Agla
              2026-06-05): it duplicated the Settlement tab. Share % lives in
              Settings; the Settlement tab is the single place to see split
              math. Partner-paid rows are merged into the transactions table
              below so they're visible in context. */}

          <ExpenseRowsTable
            visibleRows={visibleRows}
            categories={categories}
            matchStatus={matchStatus}
            matchedDocs={matchedDocs}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            editingTxId={editingTxId}
            editValues={editValues}
            setEditValues={setEditValues}
            editingIsCash={editingIsCash}
            startEdit={startEdit}
            saveEdit={saveEdit}
            cancelEdit={cancelEdit}
            handleMatchReceipt={handleMatchReceipt}
            handleUploadReceipt={handleUploadReceipt}
            handleUnlink={handleUnlink}
            handleDeleteCash={handleDeleteCash}
          />
        </>
      )}

      <PartnerPaidImportModal
        open={showPartnerImportModal}
        onClose={() => setShowPartnerImportModal(false)}
        businessId={businessId}
        participants={participants}
        categories={allCategories}
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
