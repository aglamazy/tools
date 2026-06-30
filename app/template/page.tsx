import type { Metadata } from 'next'
import { buildHubMetadata, QuickWinHub, QUICK_WIN_PAGES } from '@/app/lib/seoQuickWin'

const hub = {
  path: '/template',
  title: 'תבניות אקסל חינם לעסקים קטנים',
  description:
    'תבניות אקסל להורדה לניהול תזרים ולמעקב הוצאות והכנסות. מבנה פשוט ומסודר שמתאים לכל עסק קטן, עם הוראות מעשיות למעבר לסיווג אוטומטי.',
  pages: [
    QUICK_WIN_PAGES.cashFlowExcelTemplate,
    QUICK_WIN_PAGES.incomeExpensesTemplate,
  ],
}

export const metadata: Metadata = buildHubMetadata(hub)

export default function TemplateHubPage() {
  return <QuickWinHub hub={hub} />
}
