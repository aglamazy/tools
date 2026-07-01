import type { Metadata } from 'next'
import { buildHubMetadata, QuickWinHub, QUICK_WIN_PAGES } from '@/app/lib/seoQuickWin'

export const dynamic = 'force-static'

const hub = {
  path: '/machshevon',
  title: 'מחשבונים לעצמאי ועסק קטן — מס ומע"מ',
  description:
    'מחשבונים מעשיים לעצמאים: מקדמות מס הכנסה ומע"מ תשומות מול עסקאות. הסבר ברור ומבוסס מקורות רשמיים, עם קישור לנתוני תזרים אמיתיים מ-Aglamazo.',
  pages: [
    QUICK_WIN_PAGES.incomeTaxAdvanceCalculator,
    QUICK_WIN_PAGES.vatCalculator,
  ],
}

export const metadata: Metadata = buildHubMetadata(hub)

export default function MachshevonHubPage() {
  return <QuickWinHub hub={hub} />
}
