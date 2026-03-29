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

export default function DemoFormLayout({ children }: { children: React.ReactNode }) {
  return children
}
