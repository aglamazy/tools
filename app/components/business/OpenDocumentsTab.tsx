'use client'

import React, { useEffect, useState } from 'react'
import { db, type YpayDocument, type Project } from '@/app/db/financeDB'
import { projectStore } from '@/app/stores/projectStore'
import { YpayDocType } from '@/app/services/ypayService'
import { MONTH_NAMES_HE } from '@/app/lib/dateUtils'
import FormModal, { FormField, inputStyle } from '../FormModal'
import Modal from '@/app/components/Modal'

type OpenDocumentsTabProps = {
  businessId: number
}

type ManualInvoiceForm = {
  projectId: number | null
  monthValue: string // "YYYY-MM" for the input
  amount: string
  serialNumber: string
  url: string
}

function getDefaultMonth(): string {
  const d = new Date()
  d.setDate(d.getDate() - 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthValueToName(value: string): string {
  const [year, month] = value.split('-').map(Number)
  return `${MONTH_NAMES_HE[month - 1]} ${year}`
}

const emptyForm: ManualInvoiceForm = {
  projectId: null,
  monthValue: getDefaultMonth(),
  amount: '',
  serialNumber: '',
  url: '',
}

export default function OpenDocumentsTab({ businessId }: OpenDocumentsTabProps) {
  const [documents, setDocuments] = useState<YpayDocument[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState<ManualInvoiceForm | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDocuments = async () => {
    const docs = await db.ypayDocuments
      .where('docType')
      .equals(YpayDocType.BusinessInvoice)
      .toArray()
    docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    setDocuments(docs)
    setLoading(false)
  }

  useEffect(() => {
    void loadDocuments()
    projectStore.getByBusinessId(businessId).then(setProjects)
  }, [businessId])

  const handleMarkPaid = async (doc: YpayDocument) => {
    await db.ypayDocuments.update(doc.id!, { paidAt: new Date().toISOString() })
    await loadDocuments()
  }

  const handleUnmarkPaid = async (doc: YpayDocument) => {
    await db.ypayDocuments.update(doc.id!, { paidAt: undefined })
    await loadDocuments()
  }

  const handleAddManual = async () => {
    if (!formData) return
    const project = projects.find(p => p.id === formData.projectId)
    if (!project || !formData.monthValue || !formData.amount) {
      setError('יש למלא פרויקט, חודש וסכום')
      return
    }
    const monthName = monthValueToName(formData.monthValue)
    const transactionId = `invoice:${project.name}:${monthName}`
    const existing = await db.ypayDocuments.where('transactionId').equals(transactionId).first()
    if (existing) {
      setError('חשבונית עסקה כבר קיימת לפרויקט וחודש זה')
      return
    }
    await db.ypayDocuments.add({
      transactionId,
      url: formData.url || '',
      serialNumber: formData.serialNumber || '',
      docType: YpayDocType.BusinessInvoice,
      amount: Number(formData.amount),
      projectName: project.name,
      monthName,
      createdAt: new Date().toISOString(),
    })
    setFormData(null)
    await loadDocuments()
  }

  const handleDelete = async (doc: YpayDocument) => {
    await db.ypayDocuments.delete(doc.id!)
    await loadDocuments()
  }

  const openDocs = documents.filter(d => !d.paidAt)
  const paidDocs = documents.filter(d => !!d.paidAt)
  const totalOpen = openDocs.reduce((sum, d) => sum + (d.amount || 0), 0)

  if (loading) return <p>טוען...</p>

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>מסמכים פתוחים</h3>
        <button
          onClick={() => setFormData({ ...emptyForm })}
          style={{
            padding: '0.5rem 1rem', background: '#3b82f6', color: 'white',
            border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.9rem',
          }}
        >+ הוסף ידנית</button>
      </div>

      {totalOpen > 0 && (
        <div style={{
          padding: '1rem', background: '#fef3c7', border: '1px solid #fbbf24',
          borderRadius: '0.5rem', marginBottom: '1rem', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 600, color: '#92400e' }}>סה״כ לגבייה</span>
          <span style={{ fontWeight: 700, fontSize: '1.2rem', color: '#92400e' }}>
            {totalOpen.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪
          </span>
        </div>
      )}

      {openDocs.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {openDocs.map(doc => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onMarkPaid={() => void handleMarkPaid(doc)}
              onDelete={() => void handleDelete(doc)}
            />
          ))}
        </div>
      ) : (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem 0' }}>
          אין מסמכים פתוחים
        </p>
      )}

      {paidDocs.length > 0 && (
        <>
          <h4 style={{ margin: '1.5rem 0 0.75rem', fontSize: '0.95rem', fontWeight: 600, color: '#64748b' }}>
            שולם ({paidDocs.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {paidDocs.map(doc => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                paid
                onUnmarkPaid={() => void handleUnmarkPaid(doc)}
                onDelete={() => void handleDelete(doc)}
              />
            ))}
          </div>
        </>
      )}

      {formData && (
        <FormModal
          isOpen
          title="הוסף חשבונית עסקה"
          onClose={() => setFormData(null)}
          onSave={() => void handleAddManual()}
          saveText="הוסף"
        >
          <FormField label="פרויקט">
            <select
              value={formData.projectId || ''}
              onChange={e => setFormData({ ...formData, projectId: Number(e.target.value) || null })}
              style={inputStyle}
            >
              <option value="">בחר פרויקט</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="חודש">
            <input
              type="month"
              value={formData.monthValue}
              onChange={e => setFormData({ ...formData, monthValue: e.target.value })}
              style={inputStyle}
            />
          </FormField>
          <FormField label="סכום (₪)">
            <input
              type="number"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              style={inputStyle}
              placeholder="0"
            />
          </FormField>
          <FormField label="מספר מסמך">
            <input
              value={formData.serialNumber}
              onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
              style={inputStyle}
              placeholder="אופציונלי"
            />
          </FormField>
          <FormField label="קישור למסמך">
            <input
              value={formData.url}
              onChange={e => setFormData({ ...formData, url: e.target.value })}
              style={inputStyle}
              placeholder="אופציונלי"
            />
          </FormField>
        </FormModal>
      )}

      <Modal isOpen={!!error} onClose={() => setError(null)} maxWidth="400px">
        <div style={{ textAlign: 'center', padding: '1.5rem', direction: 'rtl' }}>
          <p style={{ fontSize: '1.05rem', margin: '0 0 1.25rem' }}>{error}</p>
          <button onClick={() => setError(null)} className="file-picker">
            <span>אישור</span>
          </button>
        </div>
      </Modal>
    </div>
  )
}

function DocumentRow({ doc, paid, onMarkPaid, onUnmarkPaid, onDelete }: {
  doc: YpayDocument
  paid?: boolean
  onMarkPaid?: () => void
  onUnmarkPaid?: () => void
  onDelete: () => void
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '1rem', background: paid ? '#f0fdf4' : '#f8fafc',
      border: `1px solid ${paid ? '#bbf7d0' : '#e2e8f0'}`,
      borderRadius: '0.5rem', fontSize: '0.95rem',
      opacity: paid ? 0.7 : 1,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
          {doc.projectName || 'ללא פרויקט'}
          {doc.serialNumber && (
            <span style={{ color: '#64748b', fontWeight: 400, marginRight: '0.5rem' }}>
              #{doc.serialNumber}
            </span>
          )}
        </div>
        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
          {doc.monthName || ''}
          {doc.createdAt && ` · ${new Date(doc.createdAt).toLocaleDateString('he-IL')}`}
          {paid && doc.paidAt && ` · שולם ${new Date(doc.paidAt).toLocaleDateString('he-IL')}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>
          {doc.amount ? `${doc.amount.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪` : '—'}
        </span>
        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#e0f2fe',
              border: '1px solid #7dd3fc', borderRadius: '0.25rem', color: '#0369a1',
              textDecoration: 'none',
            }}
          >צפה</a>
        )}
        {!paid && onMarkPaid && (
          <button
            onClick={onMarkPaid}
            style={{
              padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#ecfdf5',
              border: '1px solid #6ee7b7', borderRadius: '0.25rem', cursor: 'pointer', color: '#059669',
            }}
          >שולם</button>
        )}
        {paid && onUnmarkPaid && (
          <button
            onClick={onUnmarkPaid}
            style={{
              padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#fef3c7',
              border: '1px solid #fbbf24', borderRadius: '0.25rem', cursor: 'pointer', color: '#92400e',
            }}
          >בטל תשלום</button>
        )}
        <button
          onClick={onDelete}
          style={{
            padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#fef2f2',
            border: '1px solid #fca5a5', borderRadius: '0.25rem', cursor: 'pointer', color: '#dc2626',
          }}
        >מחק</button>
      </div>
    </div>
  )
}
