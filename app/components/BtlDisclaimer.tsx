import React from 'react'

export const BTL_SITE_URL = 'https://www.btl.gov.il'

/** Short form for places with no room for the full note (e.g. a todo card line). */
export const BTL_DISCLAIMER_SHORT = 'לנוחות בלבד; היתרה המחייבת באתר ביטוח לאומי'

/**
 * aglamazo#498 (Agla 124308): the only source of truth for the National
 * Insurance balance (what is owed, what was paid, any fines) is the BTL site.
 * Every BTL figure Aglamazo shows is for convenience only. Shown next to
 * every BTL payment, schedule or balance; it changes no computed figure.
 */
export default function BtlDisclaimer({ style }: { style?: React.CSSProperties }) {
  return (
    <p
      data-testid="btl-disclaimer"
      style={{ margin: '0.35rem 0', fontSize: '0.75rem', color: '#92400e', ...style }}
    >
      ⓘ היתרה המחייבת בביטוח לאומי (חוב, תשלומים וקנסות) מופיעה רק{' '}
      <a href={BTL_SITE_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
        באתר ביטוח לאומי
      </a>
      . הסכומים כאן מוצגים לנוחות בלבד.
    </p>
  )
}
