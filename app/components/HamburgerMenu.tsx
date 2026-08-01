'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ALL_PAGES } from '@/app/lib/pageRegistry'
import { routes } from '@/app/config'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'

/**
 * Mobile-only menu for the Saliko variant (task #19): full-page chat is the
 * primary mobile view, so everything else the desktop nav exposes (stores,
 * settings, admin) needs a way back in. Deliberately minimal — the IA/exact
 * contents are explicitly deferred; this just surfaces the same
 * variant-filtered page list AppLauncher would show on desktop, via a
 * hamburger icon instead of the waffle grid Saliko hides as noise.
 */
export default function HamburgerMenu() {
  const [open, setOpen] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsOwner(userTierStore.hasAccess(UserTier.OWNER))
    return userTierStore.subscribe(() => setIsOwner(userTierStore.hasAccess(UserTier.OWNER)))
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="hamburger-wrapper" ref={panelRef}>
      <button
        type="button"
        className="hamburger-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="תפריט"
      >
        ☰
      </button>
      {open && (
        <div className="hamburger-panel" dir="rtl">
          {ALL_PAGES.map((page) => (
            <Link
              key={page.id}
              href={page.href}
              onClick={() => setOpen(false)}
              className="avatar-menu-link"
            >
              {page.icon} {page.label}
            </Link>
          ))}
          {isOwner && (
            <Link href={routes.admin} onClick={() => setOpen(false)} className="avatar-menu-link">
              👑 ניהול
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
