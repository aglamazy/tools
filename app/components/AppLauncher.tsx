'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ALL_PAGES, DEFAULT_TAB_IDS, type NavigablePage } from '@/app/lib/pageRegistry'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { businessStore } from '@/app/stores/businessStore'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import { BUSINESS_TYPE_CONFIG } from '@/app/types/businessColors'
import { routes } from '@/app/config'
import type { Business } from '@/app/db/financeDB'

export default function AppLauncher() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<string[]>(DEFAULT_TAB_IDS)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [defaultPageId, setDefaultPageId] = useState<string>('home')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pageId: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    appSettingsStore.getBottomTabConfig().then(config => {
      if (config) setFavoriteIds(config)
    })
    appSettingsStore.getDefaultPage().then(p => setDefaultPageId(p || 'home'))
  }, [])

  useEffect(() => {
    if (!open) return
    if (userTierStore.hasAccess(UserTier.PRO)) {
      businessStore.getAll().then(setBusinesses)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
        setEditing(false)
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close context menu on any click & clamp position to viewport
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    document.addEventListener('click', handler)

    // Clamp after render so we can measure the menu
    requestAnimationFrame(() => {
      const el = contextMenuRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      let { x, y } = contextMenu
      if (rect.right > window.innerWidth) x = window.innerWidth - rect.width - 8
      if (rect.bottom > window.innerHeight) y = window.innerHeight - rect.height - 8
      if (x < 0) x = 8
      if (y < 0) y = 8
      if (x !== contextMenu.x || y !== contextMenu.y) {
        setContextMenu({ ...contextMenu, x, y })
      }
    })

    return () => document.removeEventListener('click', handler)
  }, [contextMenu])

  const handleSetDefault = useCallback(async (pageId: string) => {
    setDefaultPageId(pageId)
    await appSettingsStore.setDefaultPage(pageId === 'home' ? null : pageId)
    setContextMenu(null)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, pageId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, pageId })
  }, [])

  const favorites = favoriteIds.map(id => ALL_PAGES.find(p => p.id === id)).filter(Boolean) as NavigablePage[]
  const others = ALL_PAGES.filter(p => !favoriteIds.includes(p.id))

  const toggleFavorite = useCallback(async (id: string) => {
    let next: string[]
    if (favoriteIds.includes(id)) {
      next = favoriteIds.filter(f => f !== id)
    } else {
      next = [...favoriteIds, id]
    }
    setFavoriteIds(next)
    await appSettingsStore.setBottomTabConfig(next)
  }, [favoriteIds])

  const handleNav = () => {
    setOpen(false)
    setEditing(false)
  }

  return (
    <div className="app-launcher-wrapper" ref={panelRef}>
      <button
        className="app-launcher-btn"
        onClick={() => { setOpen(!open); setEditing(false) }}
        aria-label="Apps"
      >
        <WaffleIcon />
      </button>

      {open && (
        <div className="app-launcher-panel">
          {/* Favorites section */}
          <div className="app-launcher-section">
            <div className="app-launcher-section-header">
              <span className="app-launcher-section-title">המועדפים שלך</span>
              <button
                className="app-launcher-edit-btn"
                onClick={() => setEditing(!editing)}
                aria-label="Edit favorites"
              >
                {editing ? '✓' : '✏️'}
              </button>
            </div>
            <div className="app-launcher-grid">
              {favorites.map(page => (
                <AppTile
                  key={page.id}
                  page={page}
                  editing={editing}
                  isFavorite
                  isDefault={page.id === defaultPageId}
                  onToggleFavorite={toggleFavorite}
                  onNav={handleNav}
                  onContextMenu={handleContextMenu}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="app-launcher-divider" />

          {/* All other apps */}
          <div className="app-launcher-section">
            <div className="app-launcher-grid">
              {others.map(page => (
                <AppTile
                  key={page.id}
                  page={page}
                  editing={editing}
                  isFavorite={false}
                  isDefault={page.id === defaultPageId}
                  onToggleFavorite={toggleFavorite}
                  onNav={handleNav}
                  onContextMenu={handleContextMenu}
                />
              ))}
              {/* Dynamic business tiles */}
              {businesses.map(biz => (
                <Link
                  key={`biz-${biz.id}`}
                  href={`/app/business/${biz.id}`}
                  className="app-launcher-tile"
                  onClick={handleNav}
                >
                  <span className="app-launcher-tile-icon">
                    {BUSINESS_TYPE_CONFIG[biz.type]?.icon || '🏢'}
                  </span>
                  <span className="app-launcher-tile-label">{biz.name}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Context menu */}
          {contextMenu && (
            <div
              ref={contextMenuRef}
              className="app-launcher-context-menu"
              style={{
                position: 'fixed',
                top: contextMenu.y,
                left: contextMenu.x,
                zIndex: 10000,
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: '0.25rem 0',
                minWidth: '160px',
              }}
            >
              <button
                onClick={() => handleSetDefault(contextMenu.pageId)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'right',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: contextMenu.pageId === defaultPageId ? '#16a34a' : '#1e293b',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {contextMenu.pageId === defaultPageId ? '✓ עמוד ברירת מחדל' : 'הגדר כעמוד ברירת מחדל'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AppTile({ page, editing, isFavorite, isDefault, onToggleFavorite, onNav, onContextMenu }: {
  page: NavigablePage
  editing: boolean
  isFavorite: boolean
  isDefault: boolean
  onToggleFavorite: (id: string) => void
  onNav: () => void
  onContextMenu: (e: React.MouseEvent, pageId: string) => void
}) {
  const hasAccess = userTierStore.hasAccess(page.requiredTier)
  const href = hasAccess ? page.href : routes.pricing

  if (editing) {
    return (
      <button
        className={`app-launcher-tile app-launcher-tile-edit ${isFavorite ? 'app-launcher-tile-fav' : ''}`}
        onClick={() => onToggleFavorite(page.id)}
      >
        <span className="app-launcher-tile-icon">{page.icon}</span>
        <span className="app-launcher-tile-label">{page.label}</span>
        <span className="app-launcher-tile-badge">
          {isFavorite ? '−' : '+'}
        </span>
      </button>
    )
  }

  return (
    <Link
      href={href}
      className={`app-launcher-tile ${!hasAccess ? 'app-launcher-tile-locked' : ''}`}
      onClick={onNav}
      onContextMenu={e => onContextMenu(e, page.id)}
    >
      <span className="app-launcher-tile-icon">{page.icon}</span>
      <span className="app-launcher-tile-label">
        {page.label}{!hasAccess ? ' 🔒' : ''}{isDefault ? ' ★' : ''}
      </span>
    </Link>
  )
}

function WaffleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="5" r="2" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="12" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
    </svg>
  )
}
