'use client'

import React, { useState } from 'react'
import { db } from '@/app/db/financeDB'
import Modal from '@/app/components/Modal'
import { YpayDocType } from '@/app/services/ypayService'
import { uploadIncomeDocument } from '@/app/services/googleDriveService'
import {
  precheckExternalIncomeDocument,
  saveExternalIncomeDocument,
  type ExternalIncomeDocInput,
} from '@/app/services/externalIncomeDocService'

// aglamazo#481 (Agla 119505/119509): upload an invoice / invoice-receipt that
// was issued OUTSIDE Aglamazo (e.g. by GROW at card clearance). The fields are
// read from the file, every one can be corrected, then the PDF goes to Drive
// and the document is saved. It counts in VAT; income tax stays on the later
// accumulated payout credit.

type Props = {
  businessId: string
  onClose: () => void
  onSaved: () => void
}

type Form = {
  docType: number
  serialNumber: string
  date: string
  customerName: string
  netAmount: string
  vatAmount: string
  grossAmount: string
}

const EMPTY_FORM: Form = {
  docType: YpayDocType.TaxInvoiceReceipt, serialNumber: '', date: '', customerName: '',
  netAmount: '', vatAmount: '', grossAmount: '',
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function numText(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : ''
}

export default function ExternalInvoiceUploadModal({ businessId, onClose, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: k === 'docType' ? Number(e.target.value) : e.target.value }) as Form)

  const handleFile = async (picked: File | undefined) => {
    if (!picked) return
    setFile(picked)
    setError(null)
    setNotice(null)
    setReading(true)
    try {
      const claudeKey = await db.appSettings.where('key').equals('claudeApiKey').first()
      const res = await fetch('/api/match-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extract-income-invoice',
          pdfBase64: await fileToBase64(picked),
          mediaType: picked.type || 'application/pdf',
          claudeApiKey: (claudeKey?.value as string | undefined) || undefined,
        }),
      })
      const x = await res.json()
      console.log('[ExternalIncome] extract →', x)
      if (!res.ok || x?.error) throw new Error(x?.error || `HTTP ${res.status}`)
      setForm({
        docType: x.docType === YpayDocType.TaxInvoice ? YpayDocType.TaxInvoice : YpayDocType.TaxInvoiceReceipt,
        serialNumber: x.serialNumber != null ? String(x.serialNumber) : '',
        date: typeof x.date === 'string' ? x.date : '',
        customerName: typeof x.customerName === 'string' ? x.customerName : '',
        netAmount: numText(x.netAmount),
        vatAmount: numText(x.vatAmount),
        grossAmount: numText(x.grossAmount),
      })
      setNotice('הפרטים נקראו מהקובץ — יש לבדוק ולתקן לפני שמירה')
    } catch (err) {
      console.error('[ExternalIncome] extract failed', err)
      setError(`קריאת המסמך נכשלה (${err instanceof Error ? err.message : String(err)}) — אפשר למלא את הפרטים ידנית`)
    } finally {
      setReading(false)
    }
  }

  const handleSave = async () => {
    if (!file) { setError('יש לבחור קובץ'); return }
    const input: Omit<ExternalIncomeDocInput, 'url'> = {
      businessId,
      docType: form.docType,
      serialNumber: form.serialNumber,
      date: form.date,
      customerName: form.customerName,
      netAmount: Number(form.netAmount),
      vatAmount: Number(form.vatAmount),
      grossAmount: Number(form.grossAmount),
    }
    setSaving(true)
    setError(null)
    try {
      const refused = await precheckExternalIncomeDocument(input)
      if (refused) { setError(refused); return }
      const [year, month] = form.date.split('-')
      const uploaded = await uploadIncomeDocument(file, { year, month })
      if (!uploaded.webViewLink) throw new Error('העלאה ל-Drive נכשלה')
      const result = await saveExternalIncomeDocument({ ...input, url: uploaded.webViewLink, driveFileId: uploaded.fileId })
      if (!result.ok) { setError(result.error); return }
      onSaved()
      onClose()
    } catch (err) {
      console.error('[ExternalIncome] save failed', err)
      setError(`השמירה נכשלה: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const label: React.CSSProperties = { display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: '0.25rem' }
  const input: React.CSSProperties = { width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: '0.375rem', fontSize: '0.95rem', boxSizing: 'border-box' }
  const busy = reading || saving

  return (
    <Modal isOpen onClose={onClose} maxWidth="520px">
      <div style={{ direction: 'rtl', padding: '0.5rem' }}>
        <h3 style={{ margin: '0 0 0.25rem' }}>העלאת חשבונית חיצונית</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b' }}>
          חשבונית מס או חשבונית מס קבלה שהופקה מחוץ לאגלמזו (למשל GROW). נספרת במע״מ; ההכנסה עצמה נספרת כשהתשלום יגיע לבנק.
        </p>

        <label style={label}>קובץ (PDF או תמונה)</label>
        <input
          type="file"
          accept="application/pdf,image/*"
          disabled={busy}
          onChange={(e) => void handleFile(e.target.files?.[0])}
          style={{ marginBottom: '1rem' }}
        />
        {reading && <p style={{ color: '#6366f1', margin: '0 0 1rem' }}>קורא את המסמך...</p>}
        {notice && !reading && <p style={{ color: '#16a34a', margin: '0 0 1rem', fontSize: '0.85rem' }}>{notice}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={label}>סוג מסמך</label>
            <select value={form.docType} onChange={set('docType')} style={input} disabled={busy}>
              <option value={YpayDocType.TaxInvoiceReceipt}>חשבונית מס קבלה</option>
              <option value={YpayDocType.TaxInvoice}>חשבונית מס</option>
            </select>
          </div>
          <div>
            <label style={label}>מספר מסמך</label>
            <input value={form.serialNumber} onChange={set('serialNumber')} style={input} disabled={busy} />
          </div>
          <div>
            <label style={label}>תאריך הפקה</label>
            <input type="date" value={form.date} onChange={set('date')} style={input} disabled={busy} />
          </div>
          <div>
            <label style={label}>לקוח</label>
            <input value={form.customerName} onChange={set('customerName')} style={input} disabled={busy} />
          </div>
          <div>
            <label style={label}>סכום לפני מע״מ</label>
            <input type="number" step="0.01" value={form.netAmount} onChange={set('netAmount')} style={input} disabled={busy} />
          </div>
          <div>
            <label style={label}>מע״מ</label>
            <input type="number" step="0.01" value={form.vatAmount} onChange={set('vatAmount')} style={input} disabled={busy} />
          </div>
          <div>
            <label style={label}>סה״כ כולל מע״מ</label>
            <input type="number" step="0.01" value={form.grossAmount} onChange={set('grossAmount')} style={input} disabled={busy} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.6rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.375rem', color: '#b91c1c', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start', marginTop: '1.25rem' }}>
          <button
            onClick={() => void handleSave()}
            disabled={busy || !file}
            style={{ padding: '0.5rem 1.25rem', background: busy || !file ? '#94a3b8' : '#6366f1', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 600, cursor: busy || !file ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'שומר...' : 'שמירה'}
          </button>
          <button onClick={onClose} disabled={saving} style={{ padding: '0.5rem 1.25rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.375rem', cursor: 'pointer' }}>
            ביטול
          </button>
        </div>
      </div>
    </Modal>
  )
}
