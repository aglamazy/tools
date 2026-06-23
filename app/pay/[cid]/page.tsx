/**
 * Branded payment page (#73, #213). Public — the customer (anon, another device)
 * opens this link. We render our logo + the selected customer & line items, then
 * embed YPAY's clearance page in an iframe (YPAY's page only shows a total and
 * doesn't pre-fill, so the itemized context lives here). The persisted
 * `ypayPaymentLinks/{cid}` doc (written server-side at link creation) is the
 * source — the payer can't read the owner's Dexie/backup.
 */
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Item = { description?: string; quantity?: number; price?: number; vatIncluded?: boolean }
type LinkDoc = {
  businessName?: string | null
  amount?: number | null
  currency?: string | null
  items?: Item[]
  contact?: { name?: string; email?: string } | null
  paymentUrl?: string
  status?: string
}

async function getLink(cid: string): Promise<LinkDoc | null> {
  try {
    const doc = await getAdminFirestore().collection('ypayPaymentLinks').doc(cid).get()
    if (!doc.exists) return null
    return doc.data() as LinkDoc
  } catch (err) {
    console.error('[pay/[cid]] read failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

const money = (n: number, currency = 'ILS') =>
  `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}${currency !== 'ILS' ? ` ${currency}` : ''}`

const card: React.CSSProperties = {
  background: 'white', borderRadius: '0.75rem', boxShadow: '0 10px 40px rgba(15,23,42,0.08)',
  border: '1px solid #e2e8f0', overflow: 'hidden',
}

export default async function PayPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params
  const link = await getLink(cid)

  const shell: React.CSSProperties = {
    direction: 'rtl', minHeight: '100vh', background: '#f1f5f9',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
    padding: '1.5rem 1rem', boxSizing: 'border-box',
  }

  if (!link) {
    return (
      <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...card, padding: '2rem', textAlign: 'center', maxWidth: 420 }}>
          <img src="/logo.png" alt="logo" style={{ height: 40, marginBottom: '1rem' }} />
          <h2 style={{ color: '#0f172a', margin: '0 0 0.5rem' }}>קישור התשלום לא נמצא</h2>
          <p style={{ color: '#64748b', margin: 0 }}>ייתכן שהקישור פג או שגוי. פנה לעסק ששלח לך אותו.</p>
        </div>
      </div>
    )
  }

  const items = Array.isArray(link.items) ? link.items : []
  const total = typeof link.amount === 'number' ? link.amount : items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0)
  const isPaid = link.status === 'paid'

  return (
    <div style={shell}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        {/* Brand header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <img src="/logo.png" alt="logo" style={{ height: 36 }} />
          {link.businessName && <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{link.businessName}</span>}
        </div>

        {/* Stacked: our itemized details on top, YPAY clearance iframe below. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Itemized summary (what YPAY's page won't show) */}
          <div style={{ ...card, padding: '1.25rem' }}>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', color: '#0f172a' }}>פירוט התשלום</h2>
            {link.contact?.name && (
              <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.75rem' }}>
                לכבוד: <strong>{link.contact.name}</strong>
                {link.contact.email && <span> · {link.contact.email}</span>}
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: '#94a3b8', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.35rem 0', fontWeight: 500 }}>תיאור</th>
                  <th style={{ padding: '0.35rem 0', fontWeight: 500, textAlign: 'center' }}>כמות</th>
                  <th style={{ padding: '0.35rem 0', fontWeight: 500, textAlign: 'left' }}>סכום</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.4rem 0', color: '#0f172a' }}>{it.description || '—'}</td>
                    <td style={{ padding: '0.4rem 0', textAlign: 'center', color: '#475569' }}>{it.quantity ?? 1}</td>
                    <td style={{ padding: '0.4rem 0', textAlign: 'left', color: '#475569' }}>{money((Number(it.quantity) || 0) * (Number(it.price) || 0), link.currency || 'ILS')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.85rem', paddingTop: '0.6rem', borderTop: '2px solid #e2e8f0', fontWeight: 700, color: '#059669', fontSize: '1rem' }}>
              <span>סה״כ לתשלום</span><span>{money(total, link.currency || 'ILS')}</span>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.6rem', marginBottom: 0 }}>הסכום כולל מע״מ כחוק. התשלום מאובטח ומתבצע בעמוד הסליקה של YPAY.</p>
          </div>

          {/* YPAY clearance page (card capture stays on their PCI page) */}
          <div style={{ ...card, padding: isPaid ? '1.25rem' : 0 }}>
            {isPaid ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontSize: '2rem' }}>✅</div>
                <h2 style={{ color: '#059669', margin: '0.5rem 0' }}>התשלום בוצע</h2>
                <p style={{ color: '#64748b', margin: 0 }}>תודה! הקבלה נשלחה במייל.</p>
              </div>
            ) : link.paymentUrl ? (
              <iframe
                src={link.paymentUrl}
                title="YPAY payment"
                // YPAY's page is cross-origin (app.upay.co.il) — JS can't read its
                // content height to auto-fit, so we give it a height tall enough to
                // contain the whole clearance form (no inner scrollbar). The outer
                // page scrolls naturally if the viewport is shorter.
                style={{ width: '100%', height: 1250, border: 'none', display: 'block', margin: '0 auto' }}
                allow="payment"
              />
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#dc2626' }}>עמוד הסליקה אינו זמין כרגע.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
