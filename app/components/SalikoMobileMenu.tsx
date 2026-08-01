'use client'

import { useState } from 'react'
import Link from 'next/link'
import { routes } from '@/app/config'
import { ALL_PAGES } from '@/app/lib/pageRegistry'

/**
 * Saliko #19 — mobile primary-view swap. On mobile, Saliko's dashboard
 * landing route now shows full-page chat instead of the dashboard/nav
 * experience (see app/(dashboard)/layout.tsx), so the "everything else"
 * (stores, settings, ...) needs a way back in. The exact IA here is
 * explicitly deferred by the product owner ("defined later") — this is a
 * minimal placeholder: a hamburger toggle + a slide-in drawer reusing the
 * existing variant-filtered page registry (the same list the bottom tab
 * bar / page search draw from), not a designed nav. Don't build this out
 * further without a product decision on the real IA.
 */
export default function SalikoMobileMenu() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Reuses the existing app-launcher-btn look (40px circle icon
          button) so it reads as part of the header, not a bolted-on control. */}
      <button
        type="button"
        className="app-launcher-btn"
        onClick={() => setOpen(true)}
        aria-label="פתח תפריט"
      >
        ☰
      </button>

      {open && (
        <div className="saliko-drawer-overlay" onClick={() => setOpen(false)}>
          <div className="saliko-drawer" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="saliko-drawer-header">
              <span>תפריט</span>
              <button
                type="button"
                className="saliko-drawer-close"
                onClick={() => setOpen(false)}
                aria-label="סגור תפריט"
              >
                ✕
              </button>
            </div>
            <nav className="saliko-drawer-list">
              <Link href={routes.dashboard} className="saliko-drawer-link" onClick={() => setOpen(false)}>
                <span>💬</span>
                <span>צ׳אט</span>
              </Link>
              {ALL_PAGES.map(page => (
                <Link
                  key={page.id}
                  href={page.href}
                  className="saliko-drawer-link"
                  onClick={() => setOpen(false)}
                >
                  <span>{page.icon}</span>
                  <span>{page.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
