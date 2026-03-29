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

export default function FormFillerLayout({ children }: { children: React.ReactNode }) {
  return children
}
