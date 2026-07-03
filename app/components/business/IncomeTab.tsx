'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db, type Transaction, type YpayDocument, type Business, type Project } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { businessStore } from '@/app/stores/businessStore'
import { projectStore } from '@/app/stores/projectStore'
import { ypayService, YpayDocType } from '@/app/services/ypayService'
import { hasGmailAccess, requestGmailAccess, sendEmail, type EmailAttachment } from '@/app/services/gmailService'
import { getIdToken } from '@/app/services/firebaseAuthService'
import { partnerStore, type Partner as Participant } from '@/app/stores/partnerStore'
import { appSettingsStore, type AccountOwners } from '@/app/stores/appSettingsStore'
import { getTransactionAttributedUid } from '@/app/utils/transactionAttribution'
import ProjectEditModal from './ProjectEditModal'
import PaymentLinkModal from './PaymentLinkModal'
import PartnerSplitSummary from './PartnerSplitSummary'
import PaymentLinksTable, { type PaymentLinkRow } from './PaymentLinksTable'
import Modal from '@/app/components/Modal'
import type { Category } from '@/app/types/category'
import { getTaxProfile } from '@/app/components/TaxProfileSection'

type IncomeTabProps = {
  businessId: number
}

type TransactionWithDoc = Transaction & {
  ypayDoc?: YpayDocument
}

const parseSortableDate = (date?: string) => {
  if (!date) return 0
  const [day, month, year] = date.split('/')
  const ts = new Date(`${year}-${month}-${day}`).getTime()
  return Number.isFinite(ts) ? ts : 0
}

export default function IncomeTab({ businessId }: IncomeTabProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [transactions, setTransactions] = useState<TransactionWithDoc[]>([])
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
  const [creatingDoc, setCreatingDoc] = useState<number | null>(null)
  const [selectingProject, setSelectingProject] = useState<number | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [editingProjectContact, setEditingProjectContact] = useState<Project | null>(null)
  const [creatingNewProject, setCreatingNewProject] = useState(false)
  const [linkingDoc, setLinkingDoc] = useState<number | null>(null)
  const [linkForm, setLinkForm] = useState<{ url: string; serialNumber: string }>({ url: '', serialNumber: '' })
  const [ypayDocs, setYpayDocs] = useState<Array<{ serial_number: string; url: string }>>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null)
  const [sendingDoc, setSendingDoc] = useState<number | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [profileVatType, setProfileVatType] = useState<'exempt' | 'authorized' | undefined>(undefined)
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
    return Array.from(options, ([value, label]) => ({ value, label }))
  }, [ownerUid, ownerLabel, participants, transactions, accountOwners])
  const visibleTransactions = useMemo(() => {
    const minAmount = amountMinFilter.trim() ? Number(amountMinFilter) : null
    const maxAmount = amountMaxFilter.trim() ? Number(amountMaxFilter) : null
    const filtered = transactions.filter((t) => {
      const partyUid = resolvePartyUid(t)
      const amount = Math.abs(t.amount)
      if (partyFilter !== 'all' && partyUid !== partyFilter) return false
      if (minAmount != null && amount < minAmount) return false
      if (maxAmount != null && amount > maxAmount) return false
      return true
    })

    filtered.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'amount':
          return (Math.abs(a.amount) - Math.abs(b.amount)) * dir
        case 'party':
          return resolvePartyLabel(resolvePartyUid(a)).localeCompare(resolvePartyLabel(resolvePartyUid(b)), 'he') * dir
        case 'date':
        default: {
          return (parseSortableDate(a.date) - parseSortableDate(b.date)) * dir
        }
      }
    })

    return filtered
  }, [transactions, partyFilter, amountMinFilter, amountMaxFilter, sortKey, sortDir, accountOwners, ownerUid, participants])

  // #73 — compose a YPAY payment page for a customer (forward billing, not a receipt).
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentModalItems, setPaymentModalItems] = useState<Array<{ description: string; quantity: number; price: number }>>([])
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkRow[]>([])
  const [copiedCid, setCopiedCid] = useState<string | null>(null)

  // #213 — multi-select income rows to pre-seed a payment link.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const allSelected = visibleTransactions.length > 0 && visibleTransactions.every(t => t.id != null && selectedIds.has(t.id))
  const selectedTransactionsTotal = useMemo(() =>
    visibleTransactions.filter(t => t.id != null && selectedIds.has(t.id)).reduce((s, t) => s + t.amount, 0),
    [visibleTransactions, selectedIds],
  )
  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAll = () => setSelectedIds(
    allSelected ? new Set() : new Set(visibleTransactions.filter(t => t.id != null).map(t => t.id!)),
  )

  // Clear selection when filters change so stale IDs don't persist across views.
  useEffect(() => { setSelectedIds(new Set()) }, [filterMode, selectedMonth, selectedYear, partyFilter, businessId])

  useEffect(() => {
    loadBusiness()
    businessStore.getById(businessId)
      .then(b => getTaxProfile(b?.userId))
      .then(p => setProfileVatType(p.vatType))
    void appSettingsStore.getAccountOwners().then(setAccountOwners)
  }, [businessId])

  useEffect(() => { void loadPaymentLinks() }, [businessId])

  useEffect(() => {
    setPartyFilter('all')
  }, [businessId])

  // Read partners from cache for instant render; refresh in background; subscribe to store updates.
  useEffect(() => {
    if (!business) return
    const syncId = business.syncId
    partnerStore.recordBusiness(business.id, syncId)
    setParticipants(partnerStore.getCached(syncId))
    const unsub = partnerStore.subscribe(() => setParticipants(partnerStore.getCached(syncId)))
    void partnerStore.refresh(syncId)
    return unsub
  }, [business?.id, business?.syncId])

  useEffect(() => {
    if (business && (selectedMonth || filterMode !== 'month')) {
      loadTransactions()
    }
  }, [selectedMonth, selectedYear, filterMode, business])

  const loadPaymentLinks = async () => {
    try {
      const token = await getIdToken()
      if (!token) return
      const res = await fetch(`/api/ypay/payment-links?businessId=${businessId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) setPaymentLinks((data.links || []) as PaymentLinkRow[])
    } catch (err) {
      console.error('[IncomeTab] loadPaymentLinks failed:', err)
    }
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
    // Get income categories mapped to this business
    const categories = subjectStore.getAll().filter(
      (c: Category) => c.type === 'income' && c.businessId === businessId
    )
    if (categories.length === 0) {
      setAvailableMonths([])
      return
    }

    const categoryNames = categories.map(c => c.name)

    // Get all transactions matching these categories
    const allTransactions = await db.transactions.toArray()
    const matchingTransactions = allTransactions.filter(
      t => t.category && categoryNames.includes(t.category) && t.amount > 0
    )

    // Extract unique months and sort descending
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
      (c: Category) => c.type === 'income' && c.businessId === businessId
    )
    const categoryNames = categories.map(c => c.name)

    let filteredTransactions: Transaction[]

    if (filterMode === 'all') {
      // All transactions across all months
      const allTransactions = await db.transactions.toArray()
      filteredTransactions = allTransactions
    } else if (filterMode === 'year') {
      // All transactions for the selected year
      const allTransactions = await db.transactions.toArray()
      filteredTransactions = allTransactions.filter(t => t.month.endsWith('/' + selectedYear))
    } else {
      // Single month
      filteredTransactions = await db.transactions
        .where('month')
        .equals(selectedMonth)
        .toArray()
    }

    const incomeTransactions = filteredTransactions.filter(
      t => t.category && categoryNames.includes(t.category) && t.amount > 0
    )

    // Load YPAY documents for these transactions
    const docs = await db.ypayDocuments.toArray()
    const docMap = new Map(docs.map(d => [d.transactionId, d]))

    const withDocs: TransactionWithDoc[] = incomeTransactions.map(t => ({
      ...t,
      ypayDoc: docMap.get(String(t.id)),
    }))

    // Sort by date
    withDocs.sort((a, b) => {
      const [aD, aM, aY] = a.date.split('/')
      const [bD, bM, bY] = b.date.split('/')
      return new Date(`${aY}-${aM}-${aD}`).getTime() - new Date(`${bY}-${bM}-${bD}`).getTime()
    })

    setTransactions(withDocs)
  }

  const handleStartCreate = async (transactionId: number) => {
    const activeProjects = await projectStore.getActiveByBusinessId(businessId)
    setProjects(activeProjects)
    setSelectingProject(transactionId)
    setEditingProjectContact(null)
    setError(null)
    setLastCreatedUrl(null)
  }

  const handleSaveProjectContact = async (project: Project) => {
    if (creatingNewProject) {
      // Creating a brand new project
      const id = await projectStore.add({
        businessId,
        name: project.name.trim(),
        color: project.color,
        defaultHourlyRate: project.defaultHourlyRate,
        contactEmail: project.contactEmail,
        contactBusinessID: project.contactBusinessID,
        contactPhone: project.contactPhone,
      })
      const activeProjects = await projectStore.getActiveByBusinessId(businessId)
      setProjects(activeProjects)
      setSelectedProjectId(id as number)
      setEditingProjectContact(null)
      setCreatingNewProject(false)
      return
    }
    if (!project.id) return
    await projectStore.update(project.id, {
      name: project.name.trim(),
      color: project.color,
      defaultHourlyRate: project.defaultHourlyRate,
      contactEmail: project.contactEmail,
      contactBusinessID: project.contactBusinessID,
      contactPhone: project.contactPhone,
    })
    // Refresh projects list
    const activeProjects = await projectStore.getActiveByBusinessId(businessId)
    setProjects(activeProjects)
    setEditingProjectContact(null)
  }

  const handleCreateDocument = async (transaction: TransactionWithDoc, project: Project) => {
    if (!business || !transaction.id) return

    if (!project.contactEmail) {
      setError(`חסר אימייל בפרויקט "${project.name}" - יש לערוך בהגדרות`)
      setSelectingProject(null)
      return
    }

    setSelectingProject(null)
    setCreatingDoc(transaction.id)
    setError(null)

    // Strip invisible Unicode directional characters (RTL/LTR marks)
    const strip = (s?: string) => s?.replace(/[‎‏‪-‮⁦-⁩]/g, '').trim() || ''

    const contact = {
      email: strip(project.contactEmail),
      name: project.name,
      ...(strip(project.contactBusinessID) ? { businessID: strip(project.contactBusinessID) } : {}),
      ...(strip(project.contactPhone) ? { phone: strip(project.contactPhone) } : {}),
    }

    try {
      const result = await ypayService.createDocument(transaction, business, contact, profileVatType)
      setLastCreatedUrl(result.url)
      await loadTransactions()
    } catch (err: any) {
      setError(err.message || 'שגיאה ביצירת מסמך')
    } finally {
      setCreatingDoc(null)
    }
  }

  const loadExistingDocs = async () => {
    setLoadingDocs(true)
    try {
      const docs = await ypayService.listDocuments(business!)
      setYpayDocs(docs)
    } catch (err: any) {
      setError(err.message || 'שגיאה בטעינת מסמכים מ-YPAY')
    } finally {
      setLoadingDocs(false)
    }
  }

  const handleLinkDocument = async (transaction: TransactionWithDoc) => {
    if (!transaction.id || !linkForm.serialNumber.trim()) return

    setError(null)
    try {
      await db.ypayDocuments.add({
        transactionId: String(transaction.id),
        url: '',
        serialNumber: linkForm.serialNumber.trim(),
        docType: profileVatType === 'authorized' ? YpayDocType.TaxInvoiceReceipt : YpayDocType.Receipt,
        createdAt: new Date().toISOString(),
      })
      setLinkingDoc(null)
      setLinkForm({ url: '', serialNumber: '' })
      await loadTransactions()
    } catch (err: any) {
      setError(err.message || 'שגיאה בשמירת קבלה')
    }
  }

  const handleSendReceipt = async (transaction: TransactionWithDoc) => {
    if (!business || !transaction.ypayDoc) return

    // Ensure Gmail access
    if (!hasGmailAccess()) {
      const result = await requestGmailAccess()
      if (!result.success) {
        setStatusMessage(result.error || 'לא ניתן להתחבר ל-Gmail')
        return
      }
    }

    setSendingDoc(transaction.id!)
    try {
      const attachments: EmailAttachment[] = []

      // Download PDF
      if (transaction.ypayDoc.url) {
        const pdfResult = await ypayService.downloadPdf(transaction.ypayDoc.url)
        if (pdfResult.success && pdfResult.base64) {
          const docTypeLabel = profileVatType === 'authorized' ? 'חשבונית_מס_קבלה' : 'קבלה'
          attachments.push({
            filename: `${docTypeLabel}_${transaction.ypayDoc.serialNumber}.pdf`,
            mimeType: 'application/pdf',
            base64: pdfResult.base64,
          })
        }
      }

      const docTypeLabel = profileVatType === 'authorized' ? 'חשבונית מס קבלה' : 'קבלה'
      const subject = `${business.name} — ${docTypeLabel} #${transaction.ypayDoc.serialNumber}`
      const html = `
        <div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 1.5rem 2rem; border-radius: 0.75rem 0.75rem 0 0;">
            <h1 style="margin: 0; color: white; font-size: 1.25rem; font-weight: 600;">${business.name}</h1>
            <p style="margin: 0.25rem 0 0; color: #a7f3d0; font-size: 0.9rem;">${docTypeLabel} #${transaction.ypayDoc.serialNumber}</p>
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 0.75rem 0.75rem; padding: 1.5rem 2rem; background: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem;">
              <tr>
                <td style="padding: 0.5rem 0; color: #64748b; font-size: 0.9rem;">תאריך</td>
                <td style="padding: 0.5rem 0; font-weight: 600;">${transaction.date}</td>
              </tr>
              <tr>
                <td style="padding: 0.5rem 0; color: #64748b; font-size: 0.9rem;">תיאור</td>
                <td style="padding: 0.5rem 0; font-weight: 600;">${transaction.description}</td>
              </tr>
              <tr>
                <td style="padding: 0.5rem 0; color: #64748b; font-size: 0.9rem;">סכום</td>
                <td style="padding: 0.5rem 0; font-weight: 700; font-size: 1.1rem; color: #059669;">₪${transaction.amount.toLocaleString()}</td>
              </tr>
            </table>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 1rem 0;" />
            <p style="color: #475569; font-size: 0.9rem; margin: 0;">מצורף: ${docTypeLabel}${attachments.length > 0 ? '' : ` — <a href="${transaction.ypayDoc.url}" style="color: #059669;">צפה במסמך</a>`}.</p>
          </div>
          <div style="text-align: center; padding: 1rem 0 0.5rem;">
            <a href="https://aglamazo.com" style="color: #94a3b8; text-decoration: none; font-size: 0.8rem;">
              <strong style="color: #64748b;">Aglamazo</strong> — הראש השקט של העסק שלך
            </a>
          </div>
        </div>
      `

      // TODO: remove hardcoded email after testing
      const result = await sendEmail('yaakov.aglamaz@gmail.com', subject, html, attachments)
      if (result.success) {
        setStatusMessage('המסמך נשלח בהצלחה')
      } else {
        setStatusMessage(result.error || 'שגיאה בשליחת מייל')
      }
    } catch (err: any) {
      setStatusMessage(err.message || 'שגיאה בשליחת מייל')
    } finally {
      setSendingDoc(null)
    }
  }

  const openPaymentModalFromSelection = async () => {
    const selected = visibleTransactions.filter(t => t.id != null && selectedIds.has(t.id))
    const items = selected.map(t => ({ description: t.description, quantity: 1, price: t.amount }))
    setProjects(await projectStore.getActiveByBusinessId(businessId))
    setPaymentModalItems(items)
    setShowPaymentModal(true)
  }

  const getMonthTotal = () => {
    return visibleTransactions.reduce((sum, t) => sum + t.amount, 0)
  }

  if (loading) {
    return <p>טוען...</p>
  }

  if (!business) {
    return <p>עסק לא נמצא</p>
  }

  const categories = subjectStore.getAll().filter(
    (c: Category) => c.type === 'income' && c.businessId === businessId
  )

  if (categories.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        <p>אין נושאי הכנסה משויכים לעסק זה.</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          ניתן לשייך נושאי הכנסה בהגדרות → נושאים
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8rem', color: '#64748b' }}>סכום:</label>
          <input
            type="number"
            min="0"
            placeholder="מינימום"
            value={amountMinFilter}
            onChange={(e) => setAmountMinFilter(e.target.value)}
            style={{ padding: '0.45rem 0.7rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', width: '110px', direction: 'ltr' }}
          />
          <input
            type="number"
            min="0"
            placeholder="מקסימום"
            value={amountMaxFilter}
            onChange={(e) => setAmountMaxFilter(e.target.value)}
            style={{ padding: '0.45rem 0.7rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', width: '110px', direction: 'ltr' }}
          />
        </div>
        {visibleTransactions.length > 0 && (
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
            סה"כ: ₪{getMonthTotal().toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {lastCreatedUrl && (
        <div style={{ padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href={lastCreatedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#059669', fontSize: '0.85rem' }}>
            קבלה נוצרה בהצלחה - לצפייה
          </a>
          <button onClick={() => setLastCreatedUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>
      )}

      <PartnerSplitSummary transactions={transactions} participants={participants} />

      {/* #73 — create a YPAY payment page to send a customer (compose line items) */}
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button
          onClick={async () => {
            setProjects(await projectStore.getActiveByBusinessId(businessId))
            setPaymentModalItems([])
            setShowPaymentModal(true)
          }}
          style={{ padding: '0.5rem 1rem', background: '#059669', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
        >💳 צור דף תשלום ללקוח</button>
      </div>

      {/* #213 — multi-select action bar */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: 600 }}>
            {selectedIds.size} שורות נבחרו — ₪{selectedTransactionsTotal.toLocaleString()}
          </span>
          <button
            onClick={() => void openPaymentModalFromSelection()}
            style={{ padding: '0.4rem 0.85rem', background: '#059669', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
          >💳 צור דף תשלום</button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ padding: '0.4rem 0.7rem', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}
          >ביטול</button>
        </div>
      )}

      {/* #213 — payment links created for this business + their live status */}
      <PaymentLinksTable
        paymentLinks={paymentLinks}
        copiedCid={copiedCid}
        onCopy={(cid, payUrl) => {
          void navigator.clipboard.writeText(payUrl)
          setCopiedCid(cid)
          setTimeout(() => setCopiedCid(null), 1500)
        }}
      />

      {showPaymentModal && business && (
        <PaymentLinkModal
          business={business}
          projects={projects}
          vatType={profileVatType}
          initialItems={paymentModalItems.length > 0 ? paymentModalItems : undefined}
          onProjectAdded={async () => setProjects(await projectStore.getActiveByBusinessId(businessId))}
          onClose={() => {
            setShowPaymentModal(false)
            setPaymentModalItems([])
            setSelectedIds(new Set())
            void loadPaymentLinks()
          }}
        />
      )}

      {/* Transactions table */}
      {visibleTransactions.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
          אין הכנסות בתקופה זו
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 0.5rem', width: '2rem' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer' }}
                    title={allSelected ? 'בטל בחירת הכל' : 'בחר הכל'}
                  />
                </th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (sortKey === 'date') setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
                      else { setSortKey('date'); setSortDir('desc') }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 600, padding: 0, color: '#0f172a' }}
                  >
                    תאריך {sortKey === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>תיאור</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>נושא</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (sortKey === 'party') setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
                      else { setSortKey('party'); setSortDir('asc') }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 600, padding: 0, color: '#0f172a' }}
                  >
                    קיבל ע״י {sortKey === 'party' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (sortKey === 'amount') setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
                      else { setSortKey('amount'); setSortDir('desc') }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 600, padding: 0, color: '#0f172a' }}
                  >
                    סכום {sortKey === 'amount' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>קבלה</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((t) => {
                const attributedUid = resolvePartyUid(t)
                const isChecked = t.id != null && selectedIds.has(t.id)
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', background: isChecked ? '#f0f9ff' : undefined }}>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => t.id != null && toggleSelect(t.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{t.date}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{t.description}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{t.category}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                      {resolvePartyLabel(attributedUid)}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 500 }}>
                      ₪{t.amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                      {t.ypayDoc ? (
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'center' }}>
                          <a
                            href={t.ypayDoc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#10b981', textDecoration: 'none', fontWeight: 500 }}
                          >
                            {t.ypayDoc.serialNumber}
                          </a>
                          <button
                            onClick={() => void handleSendReceipt(t)}
                            disabled={sendingDoc === t.id}
                            title="שלח ללקוח"
                            style={{
                              padding: '0.2rem 0.5rem', fontSize: '0.75rem',
                              background: sendingDoc === t.id ? '#f1f5f9' : '#0ea5e9', color: sendingDoc === t.id ? '#64748b' : 'white',
                              border: 'none', borderRadius: '0.25rem',
                              cursor: sendingDoc === t.id ? 'wait' : 'pointer',
                            }}
                          >{sendingDoc === t.id ? '...' : '📧'}</button>
                        </div>
                      ) : linkingDoc === t.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '200px' }}>
                          <input
                            type="text"
                            placeholder="מספר קבלה"
                            value={linkForm.serialNumber}
                            onChange={(e) => setLinkForm(f => ({ ...f, serialNumber: e.target.value }))}
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', direction: 'rtl' }}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                            <button
                              onClick={() => handleLinkDocument(t)}
                              disabled={!linkForm.serialNumber.trim()}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f0fdf4', border: '1px solid #10b981', borderRadius: '0.25rem', cursor: 'pointer', color: '#059669' }}
                            >
                              שמור
                            </button>
                            <button
                              onClick={() => { setLinkingDoc(null); setLinkForm({ url: '', serialNumber: '' }) }}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.25rem', cursor: 'pointer', color: '#64748b' }}
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
                      ) : selectingProject === t.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '200px' }}>
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <select
                              value={selectedProjectId || ''}
                              onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', direction: 'rtl', flex: 1 }}
                            >
                              <option value="">בחר לקוח...</option>
                              {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}{!p.contactEmail ? ' (חסר אימייל)' : ''}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                setCreatingNewProject(true)
                                setEditingProjectContact({
                                  businessId,
                                  name: '',
                                  archived: false,
                                  createdAt: new Date().toISOString(),
                                  updatedAt: new Date().toISOString(),
                                })
                              }}
                              title="לקוח חדש"
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '0.25rem', cursor: 'pointer', color: '#2563eb', whiteSpace: 'nowrap' }}
                            >
                              +
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                            {(() => {
                              const selected = projects.find(p => p.id === selectedProjectId)
                              const hasEmail = selected?.contactEmail
                              return (
                                <>
                                  <button
                                    onClick={() => selected && handleCreateDocument(t, selected)}
                                    disabled={!selected || !hasEmail}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f0fdf4', border: '1px solid #10b981', borderRadius: '0.25rem', cursor: !selected || !hasEmail ? 'not-allowed' : 'pointer', color: '#059669', opacity: !selected || !hasEmail ? 0.5 : 1 }}
                                  >
                                    צור
                                  </button>
                                  <button
                                    onClick={() => selected && setEditingProjectContact(selected)}
                                    disabled={!selected}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.25rem', cursor: !selected ? 'not-allowed' : 'pointer', color: '#475569', opacity: !selected ? 0.5 : 1 }}
                                  >
                                    ערוך
                                  </button>
                                  <button
                                    onClick={() => { setSelectingProject(null); setSelectedProjectId(null) }}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.25rem', cursor: 'pointer', color: '#64748b' }}
                                  >
                                    ביטול
                                  </button>
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleStartCreate(t.id!)}
                            disabled={creatingDoc === t.id}
                            style={{
                              padding: '0.35rem 0.75rem',
                              fontSize: '0.8rem',
                              background: creatingDoc === t.id ? '#f1f5f9' : '#f0fdf4',
                              border: '1px solid #10b981',
                              borderRadius: '0.375rem',
                              cursor: creatingDoc === t.id ? 'not-allowed' : 'pointer',
                              color: '#059669',
                            }}
                          >
                            {creatingDoc === t.id ? '...' : 'צור קבלה'}
                          </button>
                          <button
                            onClick={() => { setLinkingDoc(t.id!); setLinkForm({ url: '', serialNumber: '' }); loadExistingDocs() }}
                            style={{
                              padding: '0.35rem 0.75rem',
                              fontSize: '0.8rem',
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              color: '#475569',
                            }}
                            title="קשר קבלה קיימת"
                          >
                            קשר
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProjectEditModal
        project={editingProjectContact}
        isNew={creatingNewProject}
        onClose={() => { setEditingProjectContact(null); setCreatingNewProject(false) }}
        onSave={handleSaveProjectContact}
      />

      <Modal isOpen={!!statusMessage} onClose={() => setStatusMessage(null)} maxWidth="400px">
        <div style={{ textAlign: 'center', padding: '1.5rem', direction: 'rtl' }}>
          <p style={{ fontSize: '1.05rem', margin: '0 0 1.25rem' }}>{statusMessage}</p>
          <button onClick={() => setStatusMessage(null)} className="file-picker"><span>אישור</span></button>
        </div>
      </Modal>
    </div>
  )
}
