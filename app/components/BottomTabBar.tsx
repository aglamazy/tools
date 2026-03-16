'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ALL_PAGES, DEFAULT_TAB_IDS, getPageById, type NavigablePage } from '@/app/lib/pageRegistry'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { businessStore } from '@/app/stores/businessStore'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import { BUSINESS_TYPE_CONFIG } from '@/app/types/businessColors'
import { routes } from '@/app/config'
import type { Business } from '@/app/db/financeDB'

export default function BottomTabBar() {
  const pathname = usePathname()
  const [tabIds, setTabIds] = useState<string[]>(DEFAULT_TAB_IDS)
  const [showMore, setShowMore] = useState(false)
  const [showCustomizer, setShowCustomizer] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    appSettingsStore.getBottomTabConfig().then(config => {
      if (config) setTabIds(config)
    })
  }, [])

  const tabs = tabIds.map(id => getPageById(id)).filter(Boolean) as NavigablePage[]

  const isActive = (page: NavigablePage) => {
    if (page.href === '/app') return pathname === '/app'
    return pathname.startsWith(page.href)
  }

  const isMoreActive = !tabs.some(t => isActive(t)) && pathname !== '/app'

  const handleLongPressStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowCustomizer(true)
    }, 600)
  }

  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const saveConfig = useCallback(async (newIds: string[]) => {
    setTabIds(newIds)
    await appSettingsStore.setBottomTabConfig(newIds)
  }, [])

  return (
    <>
      <nav className="bottom-tab-bar">
        {tabs.map(tab => (
          <Link
            key={tab.id}
            href={tab.href}
            className={`bottom-tab ${isActive(tab) ? 'bottom-tab-active' : ''}`}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            onContextMenu={e => { e.preventDefault(); setShowCustomizer(true) }}
          >
            <span className="bottom-tab-icon">{tab.icon}</span>
            <span className="bottom-tab-label">{tab.label}</span>
          </Link>
        ))}
        <button
          className={`bottom-tab ${isMoreActive || showMore ? 'bottom-tab-active' : ''}`}
          onClick={() => setShowMore(!showMore)}
        >
          <span className="bottom-tab-icon">⋯</span>
          <span className="bottom-tab-label">עוד</span>
        </button>
      </nav>

      {/* More Menu */}
      {showMore && (
        <MoreMenu
          tabIds={tabIds}
          onClose={() => setShowMore(false)}
          onCustomize={() => { setShowMore(false); setShowCustomizer(true) }}
        />
      )}

      {/* Tab Customizer */}
      {showCustomizer && (
        <TabCustomizer
          tabIds={tabIds}
          onSave={saveConfig}
          onClose={() => setShowCustomizer(false)}
        />
      )}
    </>
  )
}

function MoreMenu({ tabIds, onClose, onCustomize }: {
  tabIds: string[]
  onClose: () => void
  onCustomize: () => void
}) {
  const remaining = ALL_PAGES.filter(p => !tabIds.includes(p.id))
  const [businesses, setBusinesses] = useState<Business[]>([])

  useEffect(() => {
    if (userTierStore.hasAccess(UserTier.PRO)) {
      businessStore.getAll().then(setBusinesses)
    }
  }, [])

  return (
    <div className="more-menu-overlay" onClick={onClose}>
      <div className="more-menu" onClick={e => e.stopPropagation()}>
        <div className="more-menu-grid">
          {remaining.map(page => {
            const hasAccess = userTierStore.hasAccess(page.requiredTier)
            return (
              <Link
                key={page.id}
                href={hasAccess ? page.href : routes.pricing}
                className={`more-menu-item ${!hasAccess ? 'more-menu-locked' : ''}`}
                onClick={onClose}
              >
                <span className="more-menu-icon">{page.icon}</span>
                <span className="more-menu-label">
                  {page.label}{!hasAccess ? ' 🔒' : ''}
                </span>
              </Link>
            )
          })}
          {businesses.map(biz => (
            <Link
              key={`biz-${biz.id}`}
              href={`/business/${biz.id}`}
              className="more-menu-item"
              onClick={onClose}
            >
              <span className="more-menu-icon">{BUSINESS_TYPE_CONFIG[biz.type]?.icon || '🏢'}</span>
              <span className="more-menu-label">{biz.name}</span>
            </Link>
          ))}
        </div>
        <button className="more-menu-customize" onClick={onCustomize}>
          סדר מחדש את הכפתורים
        </button>
      </div>
    </div>
  )
}

function TabCustomizer({ tabIds, onSave, onClose }: {
  tabIds: string[]
  onSave: (ids: string[]) => Promise<void>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string[]>(tabIds)
  const availablePages = ALL_PAGES.filter(p => userTierStore.hasAccess(p.requiredTier))

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      setSelected(selected.filter(s => s !== id))
    } else if (selected.length < 4) {
      setSelected([...selected, id])
    }
  }

  const handleSave = async () => {
    await onSave(selected)
    onClose()
  }

  const handleReset = async () => {
    await onSave(DEFAULT_TAB_IDS)
    setSelected(DEFAULT_TAB_IDS)
    onClose()
  }

  return (
    <div className="more-menu-overlay" onClick={onClose}>
      <div className="tab-customizer" onClick={e => e.stopPropagation()}>
        <h3>בחר עד 4 כפתורים</h3>
        <p className="tab-customizer-hint">{selected.length}/4 נבחרו</p>

        <div className="tab-customizer-list">
          {availablePages.map(page => {
            const isSelected = selected.includes(page.id)
            return (
              <button
                key={page.id}
                className={`tab-customizer-item ${isSelected ? 'tab-customizer-selected' : ''}`}
                onClick={() => toggle(page.id)}
              >
                <span>{page.icon}</span>
                <span>{page.label}</span>
                {isSelected && <span className="tab-customizer-check">✓</span>}
              </button>
            )
          })}
        </div>

        <div className="tab-customizer-actions">
          <button onClick={handleReset} className="tab-customizer-reset">איפוס</button>
          <button
            onClick={handleSave}
            disabled={selected.length === 0}
            className="tab-customizer-save"
          >
            שמור
          </button>
        </div>
      </div>
    </div>
  )
}
