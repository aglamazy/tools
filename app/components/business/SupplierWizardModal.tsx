'use client'

import { useState } from 'react'
import Modal from '@/app/components/Modal'
import { hasGmailAccess, requestGmailAccess } from '@/app/services/gmailService'
import { addEmailSenderToSupplier, resolveOrCreateSupplier } from '@/app/services/supplierService'
import { sweepGmailForInvoices } from '@/app/services/supplierGmailSweep'
import { matchCandidatesToSuppliers } from '@/app/services/supplierMatcher'
import type { SupplierMatchProposal } from '@/app/types/supplierWizard'

type SupplierWizardModalProps = {
  isOpen: boolean
  onClose: () => void
}

type WizardPhase = 'idle' | 'sweeping' | 'matching' | 'review' | 'committing'

const CONFIDENCE_LABEL: Record<SupplierMatchProposal['confidence'], string> = {
  high: 'ודאות גבוהה',
  medium: 'ודאות בינונית',
  low: 'ודאות נמוכה',
}

const CONFIDENCE_COLOR: Record<SupplierMatchProposal['confidence'], string> = {
  high: '#10b981',
  medium: '#f59e0b',
  low: '#ef4444',
}

function actionLabel(proposal: SupplierMatchProposal): string {
  if (proposal.action === 'link-existing') {
    return `קישור לספק קיים: ${proposal.matchedSupplierName || ''}`
  }
  if (proposal.action === 'create-new') {
    return `יצירת ספק חדש: ${proposal.proposedName || proposal.candidate.from}`
  }
  return 'ללא התאמה'
}

export default function SupplierWizardModal({ isOpen, onClose }: SupplierWizardModalProps) {
  const [monthsBack, setMonthsBack] = useState(3)
  const [phase, setPhase] = useState<WizardPhase>('idle')
  const [error, setError] = useState('')
  const [proposals, setProposals] = useState<SupplierMatchProposal[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [summary, setSummary] = useState('')

  const actionable = proposals.filter((p) => p.action !== 'no-match')
  const checkedCount = actionable.filter((p) => checked[p.id]).length

  const resetReview = () => {
    setProposals([])
    setChecked({})
    setSummary('')
  }

  const handleSweep = async () => {
    setError('')
    setSummary('')
    resetReview()

    if (!hasGmailAccess()) {
      const access = await requestGmailAccess()
      if (!access.success) {
        setError(access.error || 'הגישה ל-Gmail נדחתה')
        return
      }
    }

    setPhase('sweeping')
    const sweepResult = await sweepGmailForInvoices(monthsBack)
    if (sweepResult.error) {
      setError(sweepResult.error)
      setPhase('idle')
      return
    }
    if (sweepResult.candidates.length === 0) {
      setError('לא נמצאו מיילים עם חשבוניות בטווח שנבחר')
      setPhase('idle')
      return
    }

    setPhase('matching')
    try {
      const matchResult = await matchCandidatesToSuppliers(sweepResult.candidates)
      if (matchResult.error) {
        setError(matchResult.error)
        setPhase('idle')
        return
      }
      setProposals(matchResult.proposals)
      const defaultChecked: Record<string, boolean> = {}
      for (const p of matchResult.proposals) {
        if (p.action !== 'no-match' && p.confidence === 'high') defaultChecked[p.id] = true
      }
      setChecked(defaultChecked)
      setPhase('review')
    } catch (err) {
      console.error('[SupplierWizard] matching failed:', err)
      setError('התאמת הספקים נכשלה')
      setPhase('idle')
    }
  }

  const toggleChecked = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleApprove = async () => {
    const selected = actionable.filter((p) => checked[p.id])
    if (selected.length === 0) return

    setPhase('committing')
    let succeeded = 0
    let failed = 0

    for (const proposal of selected) {
      try {
        if (proposal.action === 'link-existing' && proposal.matchedSupplierId) {
          await addEmailSenderToSupplier(proposal.matchedSupplierId, proposal.candidate.from)
          succeeded++
        } else if (proposal.action === 'create-new') {
          const supplier = await resolveOrCreateSupplier(proposal.proposedName || proposal.candidate.from)
          await addEmailSenderToSupplier(supplier.id!, proposal.candidate.from)
          succeeded++
        }
      } catch (err) {
        console.error('[SupplierWizard] commit failed for proposal', proposal.id, err)
        failed++
      }
    }

    setSummary(failed === 0 ? `עודכנו ${succeeded} ספקים בהצלחה` : `עודכנו ${succeeded} ספקים, ${failed} נכשלו`)
    setProposals((prev) => prev.filter((p) => !selected.some((s) => s.id === p.id)))
    setChecked({})
    setPhase('review')
  }

  const handleClose = () => {
    setPhase('idle')
    setError('')
    resetReview()
    onClose()
  }

  const isBusy = phase === 'sweeping' || phase === 'matching' || phase === 'committing'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} maxWidth="800px">
      <div className="modal-header">
        <h2>אשף ספקים — התאמת חשבוניות מ-Gmail</h2>
      </div>

      <div className="modal-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.875rem', color: '#374151' }}>
            טווח סריקה:
            <select
              value={monthsBack}
              onChange={(e) => setMonthsBack(Number(e.target.value))}
              disabled={isBusy}
              style={{ marginRight: '0.5rem', padding: '0.3rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
            >
              <option value={1}>חודש אחרון</option>
              <option value={3}>3 חודשים אחרונים</option>
              <option value={6}>6 חודשים אחרונים</option>
              <option value={12}>שנה אחרונה</option>
            </select>
          </label>
          <button onClick={handleSweep} className="file-picker" disabled={isBusy} style={{ padding: '0.375rem 1rem', fontSize: '0.875rem' }}>
            {phase === 'sweeping' ? 'סורק מיילים…' : phase === 'matching' ? 'מתאים ספקים…' : 'התחל סריקה'}
          </button>
        </div>

        {error && (
          <p style={{ color: '#ef4444', fontSize: '0.875rem', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '0.375rem' }}>
            {error}
          </p>
        )}

        {summary && (
          <p style={{ color: '#10b981', fontSize: '0.875rem', background: '#ecfdf5', padding: '0.5rem 0.75rem', borderRadius: '0.375rem' }}>
            {summary}
          </p>
        )}

        {actionable.length > 0 && (
          <>
            <div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {actionable.map((proposal) => (
                <div
                  key={proposal.id}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    padding: '0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!checked[proposal.id]}
                    onChange={() => toggleChecked(proposal.id)}
                    disabled={isBusy}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{proposal.candidate.subject}</span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#fff',
                          background: CONFIDENCE_COLOR[proposal.confidence],
                          borderRadius: '999px',
                          padding: '0.1rem 0.6rem',
                        }}
                      >
                        {CONFIDENCE_LABEL[proposal.confidence]}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {proposal.candidate.from} · {proposal.candidate.date}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#111827', marginTop: '0.25rem' }}>
                      {actionLabel(proposal)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.15rem' }}>
                      {proposal.reasoning}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#374151' }}>{checkedCount} נבחרו</span>
              <button
                onClick={handleApprove}
                className="file-picker"
                disabled={isBusy || checkedCount === 0}
                style={{ padding: '0.375rem 1rem', fontSize: '0.875rem' }}
              >
                {phase === 'committing' ? 'מעדכן…' : `אשר ועדכן (${checkedCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
