'use client'
import React from 'react'
import type { Transaction } from '@/app/db/financeDB'
import type { Partner as Participant } from '@/app/stores/partnerStore'

type Props = {
  transactions: Pick<Transaction, 'amount' | 'paidByUid'>[]
  participants: Participant[]
}

export default function PartnerSplitSummary({ transactions, participants }: Props) {
  if (participants.length <= 1 || !transactions.some(t => t.paidByUid)) return null

  const totalReceived = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const sharePctSum = participants.reduce((sum, p) => sum + (p.sharePercent ?? 0), 0)
  const validShares = sharePctSum > 0
  const rows = participants.map(p => {
    const received = transactions
      .filter(t => t.paidByUid === p.uid)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    const sharePct = p.sharePercent ?? 0
    const fairShare = totalReceived * (sharePct / 100)
    const balance = validShares ? (received - fairShare) : 0
    return { ...p, received, fairShare, balance }
  })

  return (
    <div style={{
      marginBottom: '1rem', padding: '0.75rem 1rem',
      background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem',
      fontSize: '0.85rem',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#166534' }}>חלוקת הכנסות בין השותפים</div>
      <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #86efac', color: '#15803d' }}>
            <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontWeight: 500 }}>שותף</th>
            <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontWeight: 500 }}>אחוז</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', fontWeight: 500 }}>קיבל</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', fontWeight: 500 }}>חלקו</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', fontWeight: 500 }}>מאזן</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.uid}>
              <td style={{ padding: '0.25rem 0.5rem' }}>{r.label}</td>
              <td style={{ padding: '0.25rem 0.5rem', color: '#64748b' }}>
                {r.sharePercent != null ? `${r.sharePercent}%` : '—'}
              </td>
              <td style={{ padding: '0.25rem 0.5rem', textAlign: 'left' }}>₪{r.received.toLocaleString()}</td>
              <td style={{ padding: '0.25rem 0.5rem', textAlign: 'left', color: '#64748b' }}>
                ₪{Math.round(r.fairShare).toLocaleString()}
              </td>
              <td style={{
                padding: '0.25rem 0.5rem', textAlign: 'left', fontWeight: 500,
                color: r.balance > 0 ? '#dc2626' : r.balance < 0 ? '#16a34a' : '#64748b',
              }}>
                {r.balance > 0 ? '+' : ''}₪{Math.round(r.balance).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!validShares && (
        <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#dc2626' }}>
          אחוזי שותפות לא הוגדרו — קבע אותם בלשונית ההגדרות
        </div>
      )}
    </div>
  )
}
