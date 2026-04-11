import Link from 'next/link'
import UpgradeButton from './UpgradeButton'

const plans = [
  {
    id: 'free',
    tier: 'free',
    name: 'חינם',
    price: '0',
    period: '',
    description: 'לניהול תקציב בסיסי',
    features: [
      'ייבוא קבצי בנק וכרטיסי אשראי',
      'תזרים מזומנים',
      'ניהול תקציב',
      'משימות',
      'גיבוי מקומי',
    ],
    cta: 'התוכנית הנוכחית',
    highlighted: false,
  },
  {
    id: 'home',
    tier: 'home',
    name: 'בית',
    price: 'בקרוב',
    period: 'חודשי / שנתי',
    description: 'לזוגות ומשפחות',
    features: [
      'כל התכונות של חינם',
      'שיתוף נתונים עם בן/בת זוג',
      'סנכרון בין מכשירים',
      'גיבוי מוצפן בענן',
    ],
    cta: 'בקרוב',
    highlighted: false,
    comingSoon: true,
  },
  {
    id: 'pro',
    tier: 'pro',
    name: 'מקצועי',
    price: '99',
    period: 'לכל החיים',
    originalPrice: '199',
    description: 'לעצמאים ובעלי עסקים',
    features: [
      'כל התכונות של בית',
      'ניהול עסקים מרובים',
      'מעקב הון והשקעות',
      'תחזית תשלומים',
      'כלי פיתוח',
    ],
    cta: 'שדרג עכשיו',
    highlighted: true,
    promo: 'מבצע השקה לכל החיים!',
  },
]

export default function PricingPage() {
  return (
    <main className="app" dir="rtl">
      <div className="card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>תוכניות ומחירים</h1>
          <p style={{ fontSize: '1.25rem', color: '#64748b' }}>
            בחר את התוכנית המתאימה לך
          </p>
        </header>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          marginBottom: '3rem'
        }}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              style={{
                background: plan.highlighted ? 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)' : '#fff',
                color: plan.highlighted ? '#fff' : 'inherit',
                borderRadius: '1rem',
                padding: '2rem',
                border: plan.highlighted ? 'none' : '1px solid #e2e8f0',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                opacity: plan.comingSoon ? 0.7 : 1,
              }}
            >
              {plan.promo && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '1rem',
                  background: '#f59e0b',
                  color: '#fff',
                  padding: '0.25rem 1rem',
                  borderRadius: '999px',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                }}>
                  {plan.promo}
                </div>
              )}

              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{plan.name}</h2>
              <p style={{
                fontSize: '0.875rem',
                color: plan.highlighted ? 'rgba(255,255,255,0.8)' : '#64748b',
                marginBottom: '1rem'
              }}>
                {plan.description}
              </p>

              <div style={{ marginBottom: '1.5rem' }}>
                {plan.originalPrice && (
                  <span style={{
                    textDecoration: 'line-through',
                    color: plan.highlighted ? 'rgba(255,255,255,0.6)' : '#94a3b8',
                    fontSize: '1.25rem',
                    marginLeft: '0.5rem',
                  }}>
                    {plan.originalPrice}
                  </span>
                )}
                <span style={{ fontSize: '3rem', fontWeight: 'bold' }}>
                  {plan.price === '0' ? 'חינם' : plan.price === 'בקרוב' ? '' : `₪${plan.price}`}
                </span>
                {plan.price === 'בקרוב' && (
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>בקרוב</span>
                )}
                {plan.period && (
                  <span style={{
                    fontSize: '1rem',
                    color: plan.highlighted ? 'rgba(255,255,255,0.8)' : '#64748b',
                    marginRight: '0.5rem'
                  }}>
                    {plan.period}
                  </span>
                )}
              </div>

              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 1.5rem 0',
                flex: 1,
              }}>
                {plan.features.map((feature, idx) => (
                  <li key={idx} style={{
                    padding: '0.5rem 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <span style={{ color: plan.highlighted ? '#86efac' : '#10b981' }}>✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <UpgradeButton
                planTier={plan.tier}
                planName={plan.name}
                planCta={plan.cta}
                comingSoon={plan.comingSoon}
                highlighted={plan.highlighted}
              />
            </div>
          ))}
        </div>

        <section style={{
          textAlign: 'center',
          padding: '2rem',
          background: '#fef3c7',
          borderRadius: '1rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            מבצע השקה מוגבל!
          </h3>
          <p style={{ color: '#92400e', marginBottom: '1rem' }}>
            שדרג עכשיו לתוכנית מקצועי ב-99 ש&quot;ח בלבד - <strong>לכל החיים</strong>
          </p>
          <p style={{ fontSize: '0.875rem', color: '#a16207' }}>
            * המחיר הרגיל יהיה 199 ש&quot;ח. המבצע לזמן מוגבל בלבד.
          </p>
        </section>

        <section style={{ textAlign: 'center', paddingTop: '2rem', borderTop: '1px solid #e2e8f0' }}>
          <p style={{ color: '#64748b', marginBottom: '1rem' }}>
            יש לך שאלות? צור איתנו קשר
          </p>
          <Link
            href="mailto:support@aglamaz.com"
            style={{
              color: '#4338ca',
              textDecoration: 'none',
              fontWeight: '600',
            }}
          >
            support@aglamaz.com
          </Link>
        </section>
      </div>
    </main>
  )
}
