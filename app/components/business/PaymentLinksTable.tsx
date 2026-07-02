'use client'
import React from 'react'

export type PaymentLinkRow = {
  chargeIdentifier: string
  contact?: { name?: string } | null
  amount?: number | null
  currency?: string | null
  status?: string
  createdAt?: string
}

type Props = {
  paymentLinks: PaymentLinkRow[]
  copiedCid: string | null
  onCopy: (cid: string, payUrl: string) => void
}

export default function PaymentLinksTable({ paymentLinks, copiedCid, onCopy }: Props) {
  if (paymentLinks.length === 0) return null

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden', marginBottom: '1rem' }}>
      <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', fontWeight: 600, fontSize: '0.85rem', color: '#334155', borderBottom: '1px solid #e2e8f0' }}>
        קישורי תשלום
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <tbody>
          {paymentLinks.map((lnk) => {
            const paid = lnk.status === 'paid'
            const failed = lnk.status === 'failed'
            const payUrl = `${origin}/pay/${lnk.chargeIdentifier}`
            const badge = paid
              ? { t: '✓ שולם', c: '#166534', b: '#dcfce7' }
              : failed
                ? { t: 'נכשל', c: '#991b1b', b: '#fee2e2' }
                : { t: 'ממתין', c: '#92400e', b: '#fef3c7' }
            return (
              <tr key={lnk.chargeIdentifier} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.5rem 0.75rem', color: '#0f172a' }}>{lnk.contact?.name || '—'}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>
                  {typeof lnk.amount === 'number' ? `₪${lnk.amount.toLocaleString('he-IL', { maximumFractionDigits: 2 })}` : '—'}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  {lnk.createdAt ? new Date(lnk.createdAt).toLocaleDateString('he-IL') : ''}
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <span style={{ background: badge.b, color: badge.c, padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 }}>{badge.t}</span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'left', whiteSpace: 'nowrap' }}>
                  <button
                    onClick={() => onCopy(lnk.chargeIdentifier, payUrl)}
                    style={{ padding: '0.25rem 0.6rem', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '0.35rem', cursor: 'pointer', fontSize: '0.75rem', marginInlineEnd: '0.4rem' }}
                  >{copiedCid === lnk.chargeIdentifier ? 'הועתק ✓' : 'העתק קישור'}</button>
                  <a href={payUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: '#0ea5e9' }}>פתח</a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
