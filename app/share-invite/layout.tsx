import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `שיתוף עסק | ${branding.name}`,
  description: `קבלו הזמנה לשיתוף עסק ב-${branding.name}.`,
  robots: { index: false, follow: true },
  alternates: {
    canonical: '/share-invite',
  },
}

export default function ShareInviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
