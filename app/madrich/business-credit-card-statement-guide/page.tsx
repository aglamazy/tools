import type { Metadata } from 'next'
import { buildQuickWinMetadata, QuickWinPage, QUICK_WIN_PAGES } from '@/app/lib/seoQuickWin'

export const dynamic = 'force-static'

const page = QUICK_WIN_PAGES.businessCreditCardStatement

export const metadata: Metadata = buildQuickWinMetadata(page)

export default function Page() {
  return <QuickWinPage page={page} />
}
