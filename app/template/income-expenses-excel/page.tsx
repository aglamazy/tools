import type { Metadata } from 'next'
import { buildQuickWinMetadata, QuickWinPage, QUICK_WIN_PAGES } from '@/app/lib/seoQuickWin'

const page = QUICK_WIN_PAGES.incomeExpensesTemplate

export const metadata: Metadata = buildQuickWinMetadata(page)

export default function Page() {
  return <QuickWinPage page={page} />
}
