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
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    appSettingsStore.getBottomTabConfig().then(config => {
      if (config) setFavoriteIds(config)
    })
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
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

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
                  onToggleFavorite={toggleFavorite}
                  onNav={handleNav}
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
                  onToggleFavorite={toggleFavorite}
                  onNav={handleNav}
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
        </div>
      )}
    </div>
  )
}

function AppTile({ page, editing, isFavorite, onToggleFavorite, onNav }: {
  page: NavigablePage
  editing: boolean
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  onNav: () => void
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
    >
      <span className="app-launcher-tile-icon">{page.icon}</span>
      <span className="app-launcher-tile-label">
        {page.label}{!hasAccess ? ' 🔒' : ''}
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
