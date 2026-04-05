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

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `מילוי טפסים | ${branding.name}`,
    description: `כלי מילוי טפסים אוטומטי של ${branding.name}. חסכו זמן במילוי טפסים מקוונים.`,
    url: 'https://aglamazo.com/form-filler',
    inLanguage: 'he',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: branding.name, item: 'https://aglamazo.com/' },
      { '@type': 'ListItem', position: 2, name: 'מילוי טפסים', item: 'https://aglamazo.com/form-filler' },
    ],
  },
]

export default function FormFillerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
      <noscript>
        <div dir="rtl" style={{ maxWidth: '700px', margin: '2rem auto', padding: '2rem' }}>
          <h1>מילוי טפסים אוטומטי | {branding.name}</h1>
          <p>כלי מילוי טפסים אוטומטי של {branding.name}. חסכו זמן במילוי טפסים מקוונים עבור העסק שלכם.</p>
          <p>הכלי דורש JavaScript כדי לפעול. אנא הפעילו JavaScript בדפדפן שלכם.</p>
        </div>
      </noscript>
    </>
  )
}
