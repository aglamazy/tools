'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { db, type Business, type Project, type YpayDocument } from '@/app/db/financeDB'
import { businessStore } from '@/app/stores/businessStore'
import { projectStore } from '@/app/stores/projectStore'
import { YpayDocType } from '@/app/services/ypayService'
import { getTaxProfile } from '@/app/components/TaxProfileSection'
import Modal from '@/app/components/Modal'
import ItemInvoiceModal from './ItemInvoiceModal'

type InvoicesTabProps = {
  businessId: number
}

function formatDateForDisplay(iso: string): string {
  return iso.split('T')[0].split('-').reverse().join('/')
}

function inferDocDate(doc: YpayDocument): string {
  if (doc.transactionId.startsWith('invoice:') && doc.monthName) {
    return doc.monthName
  }
  return formatDateForDisplay(doc.createdAt)
}

function docTypeLabel(docType: number): string {
  switch (docType) {
    case YpayDocType.BusinessInvoice: return 'חשבונית עסקה'
    case YpayDocType.TaxInvoice: return 'חשבונית מס'
    default: return `סוג ${docType}`
  }
}

export default function InvoicesTab({ businessId }: InvoicesTabProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [activeProjects, setActiveProjects] = useState<Project[]>([])
  const [docs, setDocs] = useState<YpayDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileVatType, setProfileVatType] = useState<'exempt' | 'authorized' | undefined>(undefined)

  const hasYpay = business?.ypayUseSandbox
    ? !!(business?.ypaySandboxClientId && business?.ypaySandboxClientSecret)
    : !!(business?.ypayClientId && business?.ypayClientSecret)
  const billingDocTypes = new Set<number>([YpayDocType.BusinessInvoice, YpayDocType.TaxInvoice])

  const load = useCallback(async () => {
    setLoading(true)
    const [b, all, active] = await Promise.all([
      businessStore.getById(businessId),
      projectStore.getByBusinessId(businessId),
      projectStore.getActiveByBusinessId(businessId),
    ])
    setBusiness(b || null)
    setActiveProjects(active)

    const profile = await getTaxProfile(b?.userId)
    setProfileVatType(profile.vatType)

    const projectNames = new Set(all.map(p => p.name))
    const allDocs = await db.ypayDocuments
      .filter(d => billingDocTypes.has(d.docType) && !!d.projectName && projectNames.has(d.projectName))
      .toArray()
    allDocs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    setDocs(allDocs)
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <div className="card"><p>טוען...</p></div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>חשבוניות עסקה</h2>
          {business?.ypayUseSandbox && (
            <span style={{
              padding: '0.15rem 0.5rem', fontSize: '0.75rem', fontWeight: 700,
              background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '0.25rem',
            }}>
              Sandbox
            </span>
          )}
        </div>
        <button
          disabled={!hasYpay}
          onClick={() => setShowModal(true)}
          title={!hasYpay ? 'יש להגדיר פרטי YPAY בהגדרות העסק' : ''}
          style={{
            padding: '0.5rem 1rem',
            background: !hasYpay ? '#94a3b8' : '#6366f1',
            color: 'white', border: 'none', borderRadius: '0.375rem',
            cursor: !hasYpay ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          + חשבונית חדשה
        </button>
      </div>

      {!hasYpay && (
        <div style={{ padding: '0.75rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
          יש להגדיר פרטי התחברות YPAY בהגדרות העסק לפני יצירת חשבוניות.
        </div>
      )}

      {docs.length === 0 ? (
        <div className="card">
          <p style={{ color: '#64748b', margin: 0 }}>עדיין לא נוצרו חשבוניות עסקה לעסק הזה.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'right' }}>
                <th style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>מס׳ סידורי</th>
                <th style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>פרויקט</th>
                <th style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>תאריך / חודש</th>
                <th style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>סוג</th>
                <th style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>סכום</th>
                <th style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>סטטוס</th>
                <th style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}></th>
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => {
                const isItemBased = doc.transactionId.startsWith('invoice-items:')
                return (
                  <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>#{doc.serialNumber}</td>
                    <td style={{ padding: '0.75rem' }}>{doc.projectName || '—'}</td>
                    <td style={{ padding: '0.75rem' }}>{inferDocDate(doc)}</td>
                    <td style={{ padding: '0.75rem', color: '#64748b', fontSize: '0.85rem' }}>
                      {docTypeLabel(doc.docType)} · {isItemBased ? 'פריטים' : 'שעתי'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>
                      {doc.amount != null ? `${doc.amount.toFixed(2)} ₪` : '—'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        display: 'inline-block', padding: '0.15rem 0.5rem', fontSize: '0.75rem',
                        borderRadius: '0.25rem',
                        background: doc.paidAt ? '#f0fdf4' : '#fef3c7',
                        color: doc.paidAt ? '#16a34a' : '#92400e',
                        border: `1px solid ${doc.paidAt ? '#bbf7d0' : '#fde68a'}`,
                      }}>
                        {doc.paidAt ? `✓ נסגר ${formatDateForDisplay(doc.paidAt)}` : 'פתוח'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' }}
                      >
                        פתח PDF
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && business && (
        <ItemInvoiceModal
          business={business}
          projects={activeProjects}
          vatType={profileVatType}
          onClose={() => setShowModal(false)}
          onCreated={() => void load()}
          onError={setError}
          onProjectAdded={() => void load()}
        />
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
