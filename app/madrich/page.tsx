import type { Metadata } from 'next'
import { buildHubMetadata, QuickWinHub, QUICK_WIN_PAGES } from '@/app/lib/seoQuickWin'

export const dynamic = 'force-static'

const hub = {
  path: '/madrich',
  title: 'מדריכים למנהל עסק קטן — תזרים, בנק ומס',
  description:
    'מדריכים מעשיים לבעלי עסקים קטנים: קריאת דפי בנק, התאמת חשבון, תזרים מזומנים, מע"מ, הוצאות מוכרות וסיווג אוטומטי. כל המדריכים חינם ומבוססים על מקורות רשמיים.',
  pages: [
    QUICK_WIN_PAGES.bankStatementGuide,
    QUICK_WIN_PAGES.bankReconciliationGuide,
    QUICK_WIN_PAGES.cashFlowWithoutBank,
    QUICK_WIN_PAGES.cashFlowGlossary,
    QUICK_WIN_PAGES.inputTaxGlossary,
    QUICK_WIN_PAGES.autoExpenseClassification,
    QUICK_WIN_PAGES.businessCreditCardStatement,
    QUICK_WIN_PAGES.workFromHomeExpenses,
  ],
}

export const metadata: Metadata = buildHubMetadata(hub)

export default function MadrichHubPage() {
  return <QuickWinHub hub={hub} />
}
