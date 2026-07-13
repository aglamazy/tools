'use client'

import React from 'react'
import type { Business, Project, YpayDocument } from '@/app/db/financeDB'
import type { TransactionWithDoc } from './IncomeTab'

type LinkForm = { url: string; serialNumber: string }

type IncomeReceiptCellProps = {
  transaction: TransactionWithDoc
  business: Business | null
  invoiceById: Map<number, YpayDocument>
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
  onLinkDocument: (t: TransactionWithDoc, closesDocIds: number[]) => void

  projects: Project[]
  selectedProjectId: number | null
  onSelectedProjectIdChange: (id: number | null) => void
  onStartCreate: (transactionId: number) => void
  onCancelCreate: () => void
  onCreateNewProject: () => void
  onEditProject: (p: Project) => void
  onCreateDocument: (t: TransactionWithDoc, project: Project, closesDocIds: number[]) => void

  openInvoices: YpayDocument[]
  selectedInvoiceDocIds: number[]
  onSelectedInvoiceDocIdsChange: (ids: number[]) => void
}

// Checkbox list for closing one or more open invoices with a single receipt
// (a payment can cover more than one invoice) — shows a running total against
// the receipt amount so a mismatched selection is obvious before saving.
function InvoiceCloseChecklist({
  invoices, selectedIds, onChange, receiptAmount,
}: {
  invoices: YpayDocument[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  receiptAmount: number
}) {
  if (invoices.length === 0) return null
  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }
  const selectedTotal = invoices
    .filter(inv => inv.id != null && selectedIds.includes(inv.id))
    .reduce((s, inv) => s + (inv.amount || 0), 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', padding: '0.3rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', background: '#fff' }}>
      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>סגור חשבונית(ות) פתוחה(ות):</span>
      {invoices.map(inv => (
        <label key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={inv.id != null && selectedIds.includes(inv.id)}
            onChange={() => inv.id != null && toggle(inv.id)}
          />
          #{inv.serialNumber} · {inv.projectName} · {inv.amount ? `${inv.amount.toFixed(2)} ₪` : ''}
        </label>
      ))}
      {selectedIds.length > 0 && (
        <span style={{ fontSize: '0.7rem', color: Math.abs(selectedTotal - receiptAmount) < 0.01 ? '#16a34a' : '#b45309' }}>
          סה״כ נבחר: {selectedTotal.toFixed(2)} ₪ {Math.abs(selectedTotal - receiptAmount) >= 0.01 && `(סכום הקבלה: ${receiptAmount.toFixed(2)} ₪)`}
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
    openInvoices, selectedInvoiceDocIds, onSelectedInvoiceDocIdsChange,
  } = props

  if (t.ypayDoc) {
    const closedInvoices = (t.ypayDoc.closesDocIds || [])
      .map(id => invoiceById.get(id)?.serialNumber ?? id)
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
          <span style={{ fontSize: '0.7rem', color: '#6d28d9' }} title="חשבונית(ות) שנסגרו על ידי קבלה זו">
            ↪ סוגר #{closedInvoices.join(', #')}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '200px' }}>
        <input
          type="text"
          placeholder="מספר קבלה"
          value={linkForm.serialNumber}
          onChange={(e) => onLinkFormChange({ ...linkForm, serialNumber: e.target.value })}
          style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', direction: 'rtl' }}
          autoFocus
        />
        <InvoiceCloseChecklist
          invoices={openInvoices}
          selectedIds={selectedInvoiceDocIds}
          onChange={onSelectedInvoiceDocIdsChange}
          receiptAmount={t.amount}
        />
        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
          <button
            onClick={() => onLinkDocument(t, selectedInvoiceDocIds)}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '200px' }}>
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => { onSelectedProjectIdChange(e.target.value ? Number(e.target.value) : null); onSelectedInvoiceDocIdsChange([]) }}
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
        <InvoiceCloseChecklist
          invoices={invoicesForProject}
          selectedIds={selectedInvoiceDocIds}
          onChange={onSelectedInvoiceDocIdsChange}
          receiptAmount={t.amount}
        />
        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
          <button
            onClick={() => selected && onCreateDocument(t, selected, selectedInvoiceDocIds)}
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
