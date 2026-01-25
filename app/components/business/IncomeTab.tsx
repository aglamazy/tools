'use client'

import React, { useEffect, useState } from 'react'
import { db, type Transaction, type YpayDocument, type Business, type Project } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { businessStore } from '@/app/stores/businessStore'
import { projectStore } from '@/app/stores/projectStore'
import { ypayService, YpayDocType } from '@/app/services/ypayService'
import ProjectEditModal from './ProjectEditModal'
import type { Category } from '@/app/types/category'

type IncomeTabProps = {
  businessId: number
}

type TransactionWithDoc = Transaction & {
  ypayDoc?: YpayDocument
}

export default function IncomeTab({ businessId }: IncomeTabProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [transactions, setTransactions] = useState<TransactionWithDoc[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [creatingDoc, setCreatingDoc] = useState<number | null>(null)
  const [selectingProject, setSelectingProject] = useState<number | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [editingProjectContact, setEditingProjectContact] = useState<Project | null>(null)
  const [linkingDoc, setLinkingDoc] = useState<number | null>(null)
  const [linkForm, setLinkForm] = useState<{ url: string; serialNumber: string }>({ url: '', serialNumber: '' })
  const [ypayDocs, setYpayDocs] = useState<Array<{ serial_number: string; url: string }>>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null)

  useEffect(() => {
    loadBusiness()
  }, [businessId])

  useEffect(() => {
    if (selectedMonth && business) {
      loadTransactions()
    }
  }, [selectedMonth, business])

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

    // Get transactions for selected month matching categories
    const monthTransactions = await db.transactions
      .where('month')
      .equals(selectedMonth)
      .toArray()

    const incomeTransactions = monthTransactions.filter(
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
    const strip = (s?: string) => s?.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim() || ''

    const contact = {
      email: strip(project.contactEmail),
      name: project.name,
      ...(strip(project.contactBusinessID) ? { businessID: strip(project.contactBusinessID) } : {}),
      ...(strip(project.contactPhone) ? { phone: strip(project.contactPhone) } : {}),
    }

    try {
      const result = await ypayService.createDocument(transaction, business, contact)
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
      const docs = await ypayService.listDocuments()
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
        docType: business?.vatType === 'authorized' ? YpayDocType.TaxInvoiceReceipt : YpayDocType.Receipt,
        createdAt: new Date().toISOString(),
      })
      setLinkingDoc(null)
      setLinkForm({ url: '', serialNumber: '' })
      await loadTransactions()
    } catch (err: any) {
      setError(err.message || 'שגיאה בשמירת קבלה')
    }
  }

  const getMonthTotal = () => {
    return transactions.reduce((sum, t) => sum + t.amount, 0)
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
      {/* Month selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <label style={{ fontWeight: 600 }}>חודש:</label>
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
        {transactions.length > 0 && (
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

      {/* Transactions table */}
      {transactions.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
          אין הכנסות בחודש זה
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
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>קבלה</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{t.date}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{t.description}</td>
                  <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{t.category}</td>
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 500 }}>
                    ₪{t.amount.toLocaleString()}
                  </td>
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                    {t.ypayDoc ? (
                      <a
                        href={t.ypayDoc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#10b981', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {t.ypayDoc.serialNumber}
                      </a>
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
                        <select
                          value={selectedProjectId || ''}
                          onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
                          style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', direction: 'rtl' }}
                        >
                          <option value="">בחר לקוח...</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}{!p.contactEmail ? ' (חסר אימייל)' : ''}</option>
                          ))}
                        </select>
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProjectEditModal
        project={editingProjectContact}
        onClose={() => setEditingProjectContact(null)}
        onSave={handleSaveProjectContact}
      />
    </div>
  )
}
