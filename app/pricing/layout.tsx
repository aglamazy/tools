import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `מחירים | ${branding.name}`,
  description: `תוכניות ומחירים של ${branding.name}. בחרו את התוכנית המתאימה לעסק שלכם — חינם, בסיסי או פרימיום.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: `מחירים | ${branding.name}`,
    description: `תוכניות ומחירים של ${branding.name}. בחרו את התוכנית המתאימה לעסק שלכם — חינם, בסיסי או פרימיום.`,
    url: '/pricing',
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
