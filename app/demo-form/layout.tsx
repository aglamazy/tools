import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `טופס הדגמה | ${branding.name}`,
  description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי. גלו כיצד המערכת עוזרת לנהל את העסק שלכם.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/demo-form',
  },
  openGraph: {
    title: `טופס הדגמה | ${branding.name}`,
    description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי. גלו כיצד המערכת עוזרת לנהל את העסק שלכם.`,
    url: '/demo-form',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `טופס הדגמה | ${branding.name}`,
  description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי.`,
  url: 'https://aglamazo.com/demo-form',
  inLanguage: 'he',
}

export default function DemoFormLayout({ children }: { children: React.ReactNode }) {
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
