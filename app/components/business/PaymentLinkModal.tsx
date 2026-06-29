'use client'

/**
 * PaymentLinkModal (#73) — compose a YPAY credit-clearing payment page for a
 * customer (known in advance) and share the link.
 *
 * Forward-looking billing composer (NOT a receipt for existing income): the admin
 * picks the customer (an existing project/contact, or creates a new one), adds the
 * line items the customer should pay for — e.g. Ilan Oz: `1 × Basic agent @300` +
 * `1 × Marketing agent @100` = 400 + VAT — and gets a YPAY payment-page link.
 *
 * The customer's contact (name/email/ח.פ/phone) is sent to YPAY so the receipt is
 * stamped to them; the payer only enters card details on YPAY's page.
 *
 * VAT: the toggle maps to each item's `vatIncluded`. The displayed total uses the
 * statutory rate from app/lib/vat.ts (no hardcoding) for preview.
 */
import React, { useEffect, useMemo, useState } from 'react'
import type { Business, Project } from '@/app/db/financeDB'
import { ypayService } from '@/app/services/ypayService'
import { getVatRateForDate } from '@/app/lib/vat'
import { projectStore } from '@/app/stores/projectStore'
import ProjectEditModal from './ProjectEditModal'

type LineItem = { description: string; quantity: number; price: number }

type Props = {
  business: Business
  projects: Project[]
  /** Dealer VAT status — read from the tax profile by the parent (same SSOT as
   *  receipt/invoice creation), since it lives on the profile, not business.vatType. */
  vatType?: 'exempt' | 'authorized'
  onProjectAdded?: () => void
  onClose: () => void
}

const emptyLine = (): LineItem => ({ description: '', quantity: 1, price: 0 })

function blankProject(businessId: number): Project {
  const now = new Date().toISOString()
  return { businessId, name: '', color: '#3b82f6', archived: false, createdAt: now, updatedAt: now }
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const sheet: React.CSSProperties = {
  background: 'white', borderRadius: '0.75rem', padding: '1.5rem',
  width: 'min(620px, 94vw)', maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl',
}
const label: React.CSSProperties = { fontSize: '0.8rem', color: '#475569', marginBottom: '0.25rem', display: 'block' }
const input: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.6rem', border: '1px solid #cbd5e1',
  borderRadius: '0.4rem', fontSize: '0.9rem', boxSizing: 'border-box',
}

export default function PaymentLinkModal({ business, projects, vatType, onProjectAdded, onClose }: Props) {
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])
  const [projectId, setProjectId] = useState<number | null>(projects[0]?.id ?? null)
  const [draftProject, setDraftProject] = useState<Project | null>(null)
  const [priceIncludesVat, setPriceIncludesVat] = useState(false) // default: NOT including
  const [payments, setPayments] = useState(1)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saveToken, setSaveToken] = useState(false)

  useEffect(() => {
    if (projectId == null && projects.length > 0) setProjectId(projects[0].id ?? null)
  }, [projects, projectId])

  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId])

  const handleSaveNewProject = async (p: Project) => {
    if (!p.name.trim()) return
    const newId = await projectStore.add({
      businessId: p.businessId,
      name: p.name.trim(),
      color: p.color,
      defaultHourlyRate: p.defaultHourlyRate,
      contactEmail: p.contactEmail,
      contactBusinessID: p.contactBusinessID,
      contactPhone: p.contactPhone,
    })
    if (newId != null) { setProjectId(newId as number); onProjectAdded?.() }
    setDraftProject(null)
  }

  const updateLine = (idx: number, patch: Partial<LineItem>) =>
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (idx: number) => setLines(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))

  const net = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0),
    [lines],
  )
  const vatRate = getVatRateForDate(new Date())
  const total = priceIncludesVat ? net : net * (1 + vatRate)
  const vatAmount = total - (priceIncludesVat ? net / (1 + vatRate) : net)
  const fmt = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`

  const handleCreate = async () => {
    setError(null)
    if (!project) { setError('יש לבחור לקוח'); return }
    if (!project.contactEmail) { setError('ללקוח שנבחר אין אימייל — ערוך אותו (✎) או בחר לקוח אחר'); return }
    const clean = lines
      .map(l => ({ description: l.description.trim(), quantity: Number(l.quantity), price: Number(l.price) }))
      .filter(l => l.description && l.quantity > 0)
    if (clean.length === 0) { setError('יש להוסיף לפחות שורה אחת עם תיאור, כמות ומחיר'); return }

    setCreating(true)
    try {
      const { chargeIdentifier } = await ypayService.createPaymentLink(business, {
        items: clean.map(l => ({ ...l, vatIncluded: priceIncludesVat })),
        vatType,
        amount: total,
        contact: {
          name: project.name,
          email: project.contactEmail,
          ...(project.contactBusinessID ? { businessID: project.contactBusinessID } : {}),
          ...(project.contactPhone ? { phone: project.contactPhone } : {}),
        },
        // Always send `payments` — it's YPAY's MAX (default 12). Sending 1 caps
        // the clearance page to a single payment instead of offering 1..12.
        payments,
        saveToken,
      })
      // Share OUR branded page (logo + itemized details + YPAY iframe), not the
      // raw YPAY clearance url.
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      setResultUrl(`${origin}/pay/${chargeIdentifier}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת קישור תשלום')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>צור דף תשלום ללקוח</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {resultUrl ? (
          <div>
            <p style={{ fontSize: '0.9rem', color: '#166534', marginTop: 0 }}>הקישור נוצר. שלח אותו ללקוח:</p>
            <input style={{ ...input, marginBottom: '0.75rem' }} readOnly value={resultUrl} onFocus={(e) => e.currentTarget.select()} />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => { void navigator.clipboard.writeText(resultUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                style={{ padding: '0.5rem 0.9rem', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer' }}
              >{copied ? 'הועתק ✓' : 'העתק קישור'}</button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`קישור לתשלום: ${resultUrl}`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ padding: '0.5rem 0.9rem', background: '#22c55e', color: 'white', borderRadius: '0.4rem', textDecoration: 'none' }}
              >שלח ב-WhatsApp</a>
              <a href={resultUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '0.5rem 0.9rem', background: '#f1f5f9', color: '#0f172a', borderRadius: '0.4rem', textDecoration: 'none' }}>פתח דף תשלום</a>
            </div>
          </div>
        ) : (
          <>
            {/* Customer selection (existing contact or create new) */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={label}>לקוח *</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <select
                  style={{ ...input, flex: 1 }}
                  value={projectId ?? ''}
                  onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
                >
                  {projects.length === 0 && <option value="">אין לקוחות — צור חדש</option>}
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setDraftProject(blankProject(business.id!))}
                  title="לקוח חדש"
                  style={{ padding: '0.5rem 0.75rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                >+ חדש</button>
              </div>
              {project && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: project.contactEmail ? '#475569' : '#dc2626' }}>
                  {project.contactEmail || 'ללא אימייל — נדרש אימייל לחשבונית'}
                  {project.contactBusinessID && <span> · ח.פ {project.contactBusinessID}</span>}
                  {project.contactPhone && <span> · {project.contactPhone}</span>}
                </div>
              )}
            </div>

            {/* Line-item composer */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 4rem 6rem 5rem 1.5rem', gap: '0.4rem', fontSize: '0.72rem', color: '#94a3b8', padding: '0 0.1rem 0.2rem' }}>
                <span>תיאור / מוצר</span><span>כמות</span><span>מחיר ליח׳</span><span>סה״כ</span><span></span>
              </div>
              {lines.map((l, idx) => {
                const lineTotal = (Number(l.quantity) || 0) * (Number(l.price) || 0)
                return (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 4rem 6rem 5rem 1.5rem', gap: '0.4rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <input style={input} placeholder="למשל: סוכן בסיסי" value={l.description} onChange={e => updateLine(idx, { description: e.target.value })} />
                    <input style={input} type="number" min={0} value={l.quantity} onChange={e => updateLine(idx, { quantity: Number(e.target.value) })} />
                    <input style={input} type="number" min={0} value={l.price} onChange={e => updateLine(idx, { price: Number(e.target.value) })} />
                    <span style={{ fontSize: '0.85rem', color: '#475569', textAlign: 'left' }}>{fmt(lineTotal)}</span>
                    <button onClick={() => removeLine(idx)} disabled={lines.length === 1} title="הסר שורה"
                      style={{ background: 'none', border: 'none', cursor: lines.length === 1 ? 'default' : 'pointer', color: lines.length === 1 ? '#cbd5e1' : '#ef4444', fontSize: '1rem' }}>✕</button>
                  </div>
                )
              })}
              <button onClick={addLine} style={{ marginTop: '0.2rem', padding: '0.35rem 0.7rem', background: '#f1f5f9', border: '1px dashed #cbd5e1', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: '#475569' }}>+ הוסף שורה</button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.6rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>{priceIncludesVat ? 'מתוכו מע״מ' : `מע״מ (${Math.round(vatRate * 100)}%)`}</span><span>{fmt(vatAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#059669', marginTop: '0.2rem' }}>
                <span>סה״כ לתשלום</span><span>{fmt(total)}</span>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={priceIncludesVat} onChange={(e) => setPriceIncludesVat(e.target.checked)} />
              המחירים שהוקלדו כוללים מע״מ
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={saveToken} onChange={(e) => setSaveToken(e.target.checked)} />
              שמור טוקן אשראי לחיובים עתידיים (ריטיינר)
            </label>

            <div style={{ marginBottom: '1rem' }}>
              <label style={label}>מספר תשלומים</label>
              <select style={input} value={payments} onChange={(e) => setPayments(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {error && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}

            <button onClick={() => void handleCreate()} disabled={creating}
              style={{ width: '100%', padding: '0.7rem', background: creating ? '#94a3b8' : '#059669', color: 'white', border: 'none', borderRadius: '0.5rem', fontSize: '0.95rem', cursor: creating ? 'wait' : 'pointer', fontWeight: 600 }}>
              {creating ? 'יוצר קישור…' : `צור קישור תשלום · ${fmt(total)}`}
            </button>
          </>
        )}

        {draftProject && (
          <ProjectEditModal
            project={draftProject}
            isNew
            onClose={() => setDraftProject(null)}
            onSave={(p) => void handleSaveNewProject(p)}
          />
        )}
      </div>
    </div>
  )
}
