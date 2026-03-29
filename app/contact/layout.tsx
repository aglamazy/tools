import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `צור קשר | ${branding.name}`,
  description: `צרו קשר עם צוות ${branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.`,
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: `צור קשר | ${branding.name}`,
    description: `צרו קשר עם צוות ${branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.`,
    url: '/contact',
  },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
