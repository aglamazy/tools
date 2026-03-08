'use client'

import React, { useState } from 'react'
import { ypayService } from '@/app/services/ypayService'

export type InvoicePreview = {
  projectName: string
  totalHours: number
  hourlyRate: number
  amount: number
  monthName: string
  date: string
  contactEmail: string
  contactBusinessID?: string
  contactPhone?: string
  description: string
}

type InvoicePreviewModalProps = {
  preview: InvoicePreview
  onClose: () => void
  onError: (message: string) => void
}

function PreviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: highlight ? '0.75rem' : '0.5rem',
      background: highlight ? '#dbeafe' : '#f8fafc',
      borderRadius: '0.375rem',
      ...(highlight ? { border: '1px solid #93c5fd' } : {}),
    }}>
      <span style={{ color: highlight ? '#1e40af' : '#64748b', fontWeight: highlight ? 600 : 400 }}>{label}</span>
      <span style={{ fontWeight: highlight ? 700 : 600, fontSize: highlight ? '1.1rem' : undefined, color: highlight ? '#1e40af' : undefined }}>{value}</span>
    </div>
  )
}

export default function InvoicePreviewModal({ preview, onClose, onError }: InvoicePreviewModalProps) {
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const contact = {
        name: preview.projectName,
        email: preview.contactEmail,
        businessID: preview.contactBusinessID,
        phone: preview.contactPhone,
      }
      const result = await ypayService.createBusinessInvoice({
        projectName: preview.projectName,
        totalHours: preview.totalHours,
        hourlyRate: preview.hourlyRate,
        monthName: preview.monthName,
        date: preview.date,
        contact,
      })
      window.open(result.url, '_blank')
      onClose()
    } catch (err: any) {
      onError(err.message || 'שגיאה ביצירת חשבונית עסקה')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '450px', maxWidth: '90vw',
        direction: 'rtl',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>חשבונית עסקה - תצוגה מקדימה</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <PreviewRow label="פרויקט" value={preview.projectName} />
          <PreviewRow label="חודש" value={preview.monthName} />
          <PreviewRow label="תאריך מסמך" value={preview.date.split('-').reverse().join('/')} />
          <PreviewRow label="שעות" value={preview.totalHours.toFixed(2)} />
          <PreviewRow label="תעריף שעתי" value={`${preview.hourlyRate} ₪`} />
          <PreviewRow label="סה״כ" value={`${preview.amount.toFixed(2)} ₪`} highlight />

          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '0.25rem 0' }} />

          <PreviewRow label="אימייל" value={preview.contactEmail} />
          {preview.contactBusinessID && <PreviewRow label="ח.פ" value={preview.contactBusinessID} />}
          {preview.contactPhone && <PreviewRow label="טלפון" value={preview.contactPhone} />}

          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '0.25rem 0' }} />

          <div style={{ padding: '0.5rem', background: '#f8fafc', borderRadius: '0.375rem' }}>
            <span style={{ color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>תיאור פריט</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{preview.description}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-start' }}>
          <button
            disabled={creating}
            onClick={() => void handleCreate()}
            style={{
              padding: '0.5rem 1.25rem', background: creating ? '#94a3b8' : '#6366f1', color: 'white',
              border: 'none', borderRadius: '0.375rem', cursor: creating ? 'wait' : 'pointer', fontWeight: 600,
            }}
          >
            {creating ? 'יוצר...' : 'צור'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.25rem', background: '#f1f5f9', color: '#475569',
              border: '1px solid #cbd5e1', borderRadius: '0.375rem', cursor: 'pointer',
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
