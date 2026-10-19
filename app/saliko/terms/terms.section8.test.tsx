import { describe, it, expect, vi } from 'vitest'

vi.mock('@/app/config/variants', async (orig) => {
  const real = await orig<typeof import('@/app/config/variants')>()
  return { ...real, VARIANT: 'saliko' }
})

import { renderToStaticMarkup } from 'react-dom/server'
import TermsPage from './page'

describe('Saliko terms section 8 (saliko#45)', () => {
  it('renders the approved section 8 with no open placeholder, numbering intact', () => {
    const el = TermsPage()
    const html = renderToStaticMarkup(el)
    expect(html).not.toContain('טרם הוחלט')
    expect(html).toContain('8. אחריות ובדיקת ההזמנה ותחום שיפוט')
    expect(html).toContain('השימוש בשירות מותר מגיל 18')
    expect(html).toContain('סמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בישראל')
    expect(html.indexOf('8. אחריות')).toBeLessThan(html.indexOf('9. יצירת קשר'))
  })
})
