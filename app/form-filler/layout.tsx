import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `מילוי טפסים | ${branding.name}`,
  description: `כלי מילוי טפסים אוטומטי של ${branding.name}. חסכו זמן במילוי טפסים מקוונים עבור העסק שלכם.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/form-filler',
  },
  openGraph: {
    title: `מילוי טפסים | ${branding.name}`,
    description: `כלי מילוי טפסים אוטומטי של ${branding.name}. חסכו זמן במילוי טפסים מקוונים עבור העסק שלכם.`,
    url: '/form-filler',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `מילוי טפסים | ${branding.name}`,
  description: `כלי מילוי טפסים אוטומטי של ${branding.name}. חסכו זמן במילוי טפסים מקוונים.`,
  url: 'https://aglamazo.com/form-filler',
  inLanguage: 'he',
}

export default function FormFillerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  )
}
