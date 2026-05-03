'use client'

import React, { useMemo, useState } from 'react'
import { ypayService } from '@/app/services/ypayService'
import type { Business, Project } from '@/app/db/financeDB'
import { VAT_RATE_AUTHORIZED_DEALER, billingDocLabel } from '@/app/lib/vat'

type LineItem = {
  description: string
  quantity: number
  price: number
}

type ItemInvoiceModalProps = {
  business: Business
  projects: Project[]
  defaultProjectId?: number
  vatType?: 'exempt' | 'authorized'
  onClose: () => void
  onCreated: () => void
  onError: (message: string) => void
}

const emptyLine = (): LineItem => ({ description: '', quantity: 1, price: 0 })

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function ItemInvoiceModal({
  business,
  projects,
  defaultProjectId,
  vatType,
  onClose,
  onCreated,
  onError,
}: ItemInvoiceModalProps) {
  const effectiveVat = vatType || business.vatType
  const docLabel = billingDocLabel(effectiveVat)
  const isAuthorized = effectiveVat === 'authorized'
  const VAT_RATE = VAT_RATE_AUTHORIZED_DEALER
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId ?? projects[0]?.id ?? null)
  const [date, setDate] = useState<string>(todayLocal())
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])
  const [creating, setCreating] = useState(false)

  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId])

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0),
    [lines],
  )

  const validationError = useMemo<string | null>(() => {
    if (!project) return 'יש לבחור פרויקט'
    if (!project.contactEmail) return 'לא הוגדר אימייל איש קשר לפרויקט'
    if (!date) return 'יש לבחור תאריך'
    if (lines.length === 0) return 'יש להוסיף לפחות שורה אחת'
    for (const [i, l] of lines.entries()) {
      if (!l.description.trim()) return `שורה ${i + 1}: חסר תיאור`
      if (!(l.quantity > 0)) return `שורה ${i + 1}: כמות חייבת להיות גדולה מ-0`
      if (l.price < 0) return `שורה ${i + 1}: מחיר לא יכול להיות שלילי`
    }
    if (subtotal <= 0) return 'סכום חשבונית חייב להיות גדול מ-0'
    return null
  }, [project, date, lines, subtotal])

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx))

  const handleCreate = async () => {
    if (!project || validationError) return
    setCreating(true)
    try {
      const result = await ypayService.createItemBasedInvoice(business, {
        projectName: project.name,
        items: lines.map(l => ({
          description: l.description.trim(),
          quantity: Number(l.quantity),
          price: Number(l.price),
        })),
        date,
        vatType,
        contact: {
          name: project.name,
          email: project.contactEmail!,
          businessID: project.contactBusinessID,
          phone: project.contactPhone,
        },
      })
      window.open(result.url, '_blank')
      onCreated()
      onClose()
    } catch (err: any) {
      onError(err.message || 'שגיאה ביצירת חשבונית עסקה')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '720px', maxWidth: '95vw',
          maxHeight: '90vh', overflowY: 'auto', direction: 'rtl',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>{docLabel} — שורות פריטים</h3>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>פרויקט</label>
            <select
              value={projectId ?? ''}
              onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
            >
              {projects.length === 0 && <option value="">אין פרויקטים פעילים</option>}
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '0 0 180px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>תאריך מסמך</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
            />
          </div>
        </div>

        {project && (
          <div style={{
            padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '0.375rem',
            marginBottom: '1rem', fontSize: '0.85rem', color: '#475569',
          }}>
            <span>{project.contactEmail || 'ללא אימייל'}</span>
            {project.contactBusinessID && <span> · ח.פ {project.contactBusinessID}</span>}
            {project.contactPhone && <span> · {project.contactPhone}</span>}
          </div>
        )}

        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 110px 110px 32px',
            gap: '0.5rem', fontSize: '0.8rem', color: '#64748b', padding: '0 0.25rem 0.25rem',
          }}>
            <span>תיאור</span>
            <span>כמות</span>
            <span>{isAuthorized ? 'מחיר ללא מע״מ' : 'מחיר יחידה'}</span>
            <span>סה״כ</span>
            <span></span>
          </div>
          {lines.map((l, idx) => {
            const lineTotal = (Number(l.quantity) || 0) * (Number(l.price) || 0)
            return (
              <div
                key={idx}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 110px 110px 32px',
                  gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem',
                }}
              >
                <input
                  type="text"
                  value={l.description}
                  onChange={e => updateLine(idx, { description: e.target.value })}
                  placeholder="תיאור הפריט"
                  style={{ padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={l.quantity}
                  onChange={e => updateLine(idx, { quantity: Number(e.target.value) })}
                  style={{ padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={l.price}
                  onChange={e => updateLine(idx, { price: Number(e.target.value) })}
                  style={{ padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
                <div style={{
                  padding: '0.4rem', background: '#f8fafc', borderRadius: '0.375rem',
                  textAlign: 'left', fontWeight: 600,
                }}>
                  {lineTotal.toFixed(2)}
                </div>
                <button
                  onClick={() => removeLine(idx)}
                  disabled={lines.length === 1}
                  title="הסר שורה"
                  style={{
                    background: 'transparent', border: 'none',
                    cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                    color: lines.length === 1 ? '#cbd5e1' : '#ef4444', fontSize: '1.1rem',
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
          <button
            onClick={addLine}
            style={{
              marginTop: '0.5rem', padding: '0.4rem 0.85rem', background: '#f1f5f9', color: '#475569',
              border: '1px solid #cbd5e1', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            + הוסף שורה
          </button>
        </div>

        <div style={{
          padding: '0.75rem',
          background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '0.375rem', marginBottom: '1rem',
        }}>
          {isAuthorized ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e40af', fontSize: '0.9rem' }}>
                <span>סכום ללא מע״מ</span>
                <span>{subtotal.toFixed(2)} ₪</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e40af', fontSize: '0.9rem' }}>
                <span>מע״מ ({Math.round(VAT_RATE * 100)}%)</span>
                <span>{(subtotal * VAT_RATE).toFixed(2)} ₪</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                color: '#1e40af', fontWeight: 700, fontSize: '1.1rem',
                borderTop: '1px solid #93c5fd', marginTop: '0.4rem', paddingTop: '0.4rem',
              }}>
                <span>סה״כ לתשלום</span>
                <span>{(subtotal * (1 + VAT_RATE)).toFixed(2)} ₪</span>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#1e40af', fontWeight: 600 }}>סה״כ</span>
              <span style={{ color: '#1e40af', fontWeight: 700, fontSize: '1.1rem' }}>{subtotal.toFixed(2)} ₪</span>
            </div>
          )}
        </div>

        {validationError && (
          <div style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{validationError}</div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
          <button
            disabled={creating || !!validationError}
            onClick={() => void handleCreate()}
            style={{
              padding: '0.5rem 1.25rem',
              background: creating || validationError ? '#94a3b8' : '#6366f1',
              color: 'white', border: 'none', borderRadius: '0.375rem',
              cursor: creating ? 'wait' : validationError ? 'not-allowed' : 'pointer', fontWeight: 600,
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
