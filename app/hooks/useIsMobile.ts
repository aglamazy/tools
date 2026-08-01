'use client'

import { useEffect, useState } from 'react'

/**
 * `@media (max-width: 768px)` as a React-render-time boolean — the same
 * breakpoint app/layout.css and app/pages.css already use for mobile-only
 * CSS (e.g. `.chat-float-panel`, `.app-chat-page`). CSS media queries can't
 * gate which component tree renders, so anything that needs to swap out a
 * whole subtree (not just hide/show via display) needs this instead.
 *
 * Starts `false` (desktop) to match SSR output; the real value is read on
 * mount and kept in sync via matchMedia's `change` event (fires on resize
 * across the threshold — no need for a raw window resize listener).
 */
const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY)
    setIsMobile(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
