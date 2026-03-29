import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `תנאי שימוש | ${branding.name}`,
  description: `תנאי השימוש של ${branding.name}. קראו את התנאים וההגבלות לפני השימוש בשירות.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: `תנאי שימוש | ${branding.name}`,
    description: `תנאי השימוש של ${branding.name}. קראו את התנאים וההגבלות לפני השימוש בשירות.`,
    url: '/terms',
  },
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children
}
