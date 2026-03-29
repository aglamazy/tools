import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `הזמנה | ${branding.name}`,
  description: `הצטרפו ל-${branding.name} לניהול פיננסי משותף. קבלו הזמנה וגשו לניהול התקציב של המשק בית.`,
  alternates: {
    canonical: '/invite',
  },
  openGraph: {
    title: `הזמנה | ${branding.name}`,
    description: `הצטרפו ל-${branding.name} לניהול פיננסי משותף. קבלו הזמנה וגשו לניהול התקציב של המשק בית.`,
    url: '/invite',
  },
}

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children
}
