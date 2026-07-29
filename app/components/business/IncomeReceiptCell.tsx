'use client'

import React from 'react'
import type { Business, Project, YpayDocument } from '@/app/db/financeDB'
import { YpayDocType } from '@/app/services/ypayService'
import type { TransactionWithDoc, OpenInvoice } from './IncomeTab'

type LinkForm = { url: string; serialNumber: string }
type Allocation = { docId: string; amount: number }

function toAllocationArray(allocations: Record<string, number>): Allocation[] {
  return Object.entries(allocations)
    .map(([docId, amount]) => ({ docId, amount }))
    .filter((a) => a.amount > 0)
}

type IncomeReceiptCellProps = {
  transaction: TransactionWithDoc
  business: Business | null
  invoiceById: Map<string, YpayDocument>
  sendingDoc: number | null
  onSendReceipt: (t: TransactionWithDoc) => void
  onDeleteReceipt: (t: TransactionWithDoc) => void

  // Row edit mode — only one row is active at a time, controlled by the parent.
  linkingDoc: number | null
  selectingProject: number | null
  creatingDoc: number | null

  linkForm: LinkForm
  onLinkFormChange: (form: LinkForm) => void
  onStartLink: (transactionId: number) => void
  onCancelLink: () => void
  onLinkDocument: (t: TransactionWithDoc, allocations: Allocation[]) => void

  projects: Project[]
  selectedProjectId: number | null
  onSelectedProjectIdChange: (id: number | null) => void
  onStartCreate: (transactionId: number) => void
  onCancelCreate: () => void
  onCreateNewProject: () => void
  onEditProject: (p: Project) => void
  onCreateDocument: (t: TransactionWithDoc, project: Project, allocations: Allocation[]) => void

  openInvoices: OpenInvoice[]
  selectedAllocations: Record<string, number>
  onSelectedAllocationsChange: (allocations: Record<string, number>) => void
}

// Per-invoice amount picker for closing one or more open invoices with a
// single receipt — a payment can fully cover several invoices and partially
// cover one more (paid more than N invoices but less than N+1 together), so
// each row is an editable amount defaulting to the invoice's full remaining
// balance, not just a checkbox. Shows a running total against the receipt
// amount so a mismatched allocation is obvious before saving.
function InvoiceAllocationList({
  invoices, allocations, onChange, receiptAmount,
}: {
  invoices: OpenInvoice[]
  allocations: Record<string, number>
  onChange: (allocations: Record<string, number>) => void
  receiptAmount: number
}) {
  if (invoices.length === 0) return null

  const selectedTotal = Object.values(allocations).reduce((s, a) => s + a, 0)
  const hasSelection = Object.keys(allocations).length > 0
  const matches = Math.abs(selectedTotal - receiptAmount) < 0.01
  const unallocated = receiptAmount - selectedTotal

  const toggle = (inv: OpenInvoice) => {
    if (inv.syncId == null) return
    if (inv.syncId in allocations) {
      const next = { ...allocations }
      delete next[inv.syncId]
      onChange(next)
    } else {
      // Auto-fill with whatever's actually left of the receipt, not the
      // invoice's full balance — checking invoices in order this way makes a
      // partial cover fill itself in (e.g. two full invoices + a smaller
      // remainder on the third), instead of the user having to do the
      // subtraction by hand.
      const amount = Math.max(0, Math.min(inv.remainingAmount, unallocated))
      onChange({ ...allocations, [inv.syncId]: Math.round(amount * 100) / 100 })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.35rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>סגור חשבונית(ות) פתוחה(ות):</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: Math.abs(unallocated) < 0.01 ? '#16a34a' : '#2563eb' }}>
          נותר להקצאה: {unallocated.toFixed(2)} ₪
        </span>
      </div>
      {invoices.map((inv) => {
        if (inv.syncId == null) return null
        const checked = inv.syncId in allocations
        const amount = allocations[inv.syncId]
        const isPartial = checked && amount < inv.remainingAmount - 0.01
        return (
          <div key={inv.syncId} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', flex: 1 }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(inv)} />
              #{inv.serialNumber} · {inv.projectName}
            </label>
            {checked && (
              <>
                <input
                  type="number"
                  min={0}
                  max={inv.remainingAmount}
                  step="0.01"
                  value={amount}
                  onChange={(e) => onChange({ ...allocations, [inv.syncId!]: Number(e.target.value) })}
                  style={{ width: '75px', padding: '0.15rem 0.3rem', fontSize: '0.7rem', border: '1px solid #e2e8f0', borderRadius: '0.2rem', direction: 'ltr' }}
                />
                <span
                  title={inv.docType === YpayDocType.TaxInvoice ? 'הסכום הנותר כולל מע״מ' : undefined}
                  style={{ color: isPartial ? '#b45309' : '#64748b', whiteSpace: 'nowrap', cursor: inv.docType === YpayDocType.TaxInvoice ? 'help' : undefined }}
                >
                  מתוך {inv.remainingAmount.toFixed(2)} ₪{inv.docType === YpayDocType.TaxInvoice ? ' (כולל מע״מ)' : ''}{isPartial ? ' — כיסוי חלקי' : ''}
                </span>
              </>
            )}
          </div>
        )
      })}
      {hasSelection && (
        <span style={{ fontSize: '0.7rem', color: matches ? '#16a34a' : '#b45309' }}>
          סה״כ הוקצה: {selectedTotal.toFixed(2)} ₪ {!matches && `(סכום הקבלה: ${receiptAmount.toFixed(2)} ₪)`}
        </span>
      )}
    </div>
  )
}

export default function IncomeReceiptCell(props: IncomeReceiptCellProps) {
  const {
    transaction: t, business, invoiceById, sendingDoc, onSendReceipt, onDeleteReceipt,
    linkingDoc, selectingProject, creatingDoc,
    linkForm, onLinkFormChange, onStartLink, onCancelLink, onLinkDocument,
    projects, selectedProjectId, onSelectedProjectIdChange, onStartCreate, onCancelCreate,
    onCreateNewProject, onEditProject, onCreateDocument,
    openInvoices, selectedAllocations, onSelectedAllocationsChange,
  } = props

  if (t.ypayDoc) {
    const closedInvoices = (t.ypayDoc.closesAllocations || [])
      .map((a) => ({ label: invoiceById.get(a.docId)?.serialNumber ?? a.docId, amount: a.amount }))
    return (
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'center' }}>
        <a
          href={t.ypayDoc.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#10b981', textDecoration: 'none', fontWeight: 500 }}
        >
          {t.ypayDoc.serialNumber}
        </a>
        {closedInvoices.length > 0 && (
          <span
            title={`סוגר: ${closedInvoices.map((c) => `#${c.label} (₪${c.amount.toFixed(2)})`).join(', ')}`}
            style={{
              display: 'inline-flex', alignItems: 'center', fontSize: '0.7rem', fontWeight: 600,
              color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe',
              borderRadius: '999px', padding: '0.05rem 0.4rem', cursor: 'help',
            }}
          >
            ↪ {closedInvoices.length}
          </span>
        )}
        <button
          onClick={() => onSendReceipt(t)}
          disabled={sendingDoc === t.id}
          title="שלח ללקוח"
          style={{
            padding: '0.2rem 0.5rem', fontSize: '0.75rem',
            background: sendingDoc === t.id ? '#f1f5f9' : '#0ea5e9', color: sendingDoc === t.id ? '#64748b' : 'white',
            border: 'none', borderRadius: '0.25rem',
            cursor: sendingDoc === t.id ? 'wait' : 'pointer',
          }}
        >{sendingDoc === t.id ? '...' : '📧'}</button>
        {business?.ypayUseSandbox && (
          <button
            onClick={() => onDeleteReceipt(t)}
            title="מחק קבלה (מנתק גם סגירת חשבונית אם קיימת) — זמין רק במצב Sandbox"
            style={{
              padding: '0.2rem 0.5rem', fontSize: '0.75rem',
              background: '#fef2f2', color: '#dc2626',
              border: '1px solid #fecaca', borderRadius: '0.25rem', cursor: 'pointer',
            }}
          >🗑️</button>
        )}
      </div>
    )
  }

  if (linkingDoc === t.id) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '220px' }}>
        <input
          type="text"
          placeholder="מספר קבלה"
          value={linkForm.serialNumber}
          onChange={(e) => onLinkFormChange({ ...linkForm, serialNumber: e.target.value })}
          style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', direction: 'rtl' }}
          autoFocus
        />
        <InvoiceAllocationList
          invoices={openInvoices}
          allocations={selectedAllocations}
          onChange={onSelectedAllocationsChange}
          receiptAmount={t.amount}
        />
        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
          <button
            onClick={() => onLinkDocument(t, toAllocationArray(selectedAllocations))}
            disabled={!linkForm.serialNumber.trim()}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f0fdf4', border: '1px solid #10b981', borderRadius: '0.25rem', cursor: 'pointer', color: '#059669' }}
          >
            שמור
          </button>
          <button
            onClick={onCancelLink}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.25rem', cursor: 'pointer', color: '#64748b' }}
          >
            ביטול
          </button>
        </div>
      </div>
    )
  }

  if (selectingProject === t.id) {
    const selected = projects.find(p => p.id === selectedProjectId)
    const hasEmail = selected?.contactEmail
    const invoicesForProject = selected
      ? openInvoices.filter(inv => inv.projectName === selected.name)
      : []
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '220px' }}>
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => { onSelectedProjectIdChange(e.target.value ? Number(e.target.value) : null); onSelectedAllocationsChange({}) }}
            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', direction: 'rtl', flex: 1 }}
          >
            <option value="">בחר לקוח...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}{!p.contactEmail ? ' (חסר אימייל)' : ''}</option>
            ))}
          </select>
          <button
            onClick={onCreateNewProject}
            title="לקוח חדש"
            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '0.25rem', cursor: 'pointer', color: '#2563eb', whiteSpace: 'nowrap' }}
          >
            +
          </button>
        </div>
        <InvoiceAllocationList
          invoices={invoicesForProject}
          allocations={selectedAllocations}
          onChange={onSelectedAllocationsChange}
          receiptAmount={t.amount}
        />
        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
          <button
            onClick={() => selected && onCreateDocument(t, selected, toAllocationArray(selectedAllocations))}
            disabled={!selected || !hasEmail}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f0fdf4', border: '1px solid #10b981', borderRadius: '0.25rem', cursor: !selected || !hasEmail ? 'not-allowed' : 'pointer', color: '#059669', opacity: !selected || !hasEmail ? 0.5 : 1 }}
          >
            צור
          </button>
          <button
            onClick={() => selected && onEditProject(selected)}
            disabled={!selected}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.25rem', cursor: !selected ? 'not-allowed' : 'pointer', color: '#475569', opacity: !selected ? 0.5 : 1 }}
          >
            ערוך
          </button>
          <button
            onClick={onCancelCreate}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.25rem', cursor: 'pointer', color: '#64748b' }}
          >
            ביטול
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
      <button
        onClick={() => t.id != null && onStartCreate(t.id)}
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
        onClick={() => t.id != null && onStartLink(t.id)}
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
  )
}
