/**
 * Public payment-failure page (#73). YPAY redirects here (inside our iframe)
 * when a charge fails. The payer can retry from the original link.
 */
export const dynamic = 'force-dynamic'

export default function PayFailurePage() {
  return (
    <div style={{
      direction: 'rtl', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f1f5f9', fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif', padding: '1.5rem',
    }}>
      <div style={{ background: 'white', borderRadius: '0.75rem', boxShadow: '0 10px 40px rgba(15,23,42,0.08)', border: '1px solid #e2e8f0', padding: '2rem', textAlign: 'center', maxWidth: 420 }}>
        <img src="/logo.png" alt="logo" style={{ height: 36, marginBottom: '1rem' }} />
        <div style={{ fontSize: '2.5rem' }}>⚠️</div>
        <h1 style={{ color: '#dc2626', margin: '0.5rem 0', fontSize: '1.4rem' }}>התשלום לא הושלם</h1>
        <p style={{ color: '#64748b', margin: 0 }}>אפשר לנסות שוב או לפנות לעסק ששלח את הקישור.</p>
      </div>
    </div>
  )
}
