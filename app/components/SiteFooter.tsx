import Link from 'next/link'
import { branding, routes } from '@/app/config'
import { VARIANT } from '@/app/config/variants'

export default function SiteFooter() {
  const year = new Date().getFullYear()

  // Saliko's public marketing pages live under /saliko/* and most of the
  // Aglamazo links don't have Saliko equivalents yet. Show a minimal footer
  // for Saliko (brand + email) until those pages are written.
  const isSaliko = VARIANT === 'saliko'

  return (
    <footer className="site-footer" dir="rtl">
      <div className="site-footer-inner">
        <div className="site-footer-section">
          <h3>{branding.name}</h3>
          <p>{branding.tagline}</p>
        </div>

        {!isSaliko && (
          <div className="site-footer-section">
            <h4>קישורים</h4>
            <Link href={routes.about}>אודות</Link>
            <Link href={routes.guide}>מדריך</Link>
            <Link href={routes.pricing}>מחירון</Link>
            <Link href="/demo-form">טופס הדגמה</Link>
            <Link href="/form-filler">מילוי טפסים</Link>
            <Link href={routes.publicTerms}>תנאי שימוש</Link>
          </div>
        )}

        <div className="site-footer-section">
          <h4>צור קשר</h4>
          {!isSaliko && <Link href={routes.contact}>שלח הודעה</Link>}
          <a href="mailto:support@aglamaz.com">support@aglamaz.com</a>
        </div>
      </div>

      <div className="site-footer-copyright">
        &copy; {year} {branding.name}. כל הזכויות שמורות.
      </div>
    </footer>
  )
}
