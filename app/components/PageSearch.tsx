'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import { config, routes } from '@/app/config'

type SearchablePage = {
  title: string
  keywords: string[]
  href: string
  icon: string
  requiredTier: UserTier
}

const PAGES: SearchablePage[] = [
  { title: 'משק בית', keywords: ['דשבורד', 'ראשי', 'dashboard', 'home'], href: routes.dashboard, icon: '🏠', requiredTier: UserTier.FREE },
  { title: 'ייבוא קבצים', keywords: ['ייבוא', 'קבצים', 'import', 'העלאה'], href: routes.import, icon: '📥', requiredTier: UserTier.FREE },
  { title: 'תזרים מזומנים', keywords: ['תזרים', 'מזומנים', 'cash', 'flow'], href: routes.cashFlow, icon: '💰', requiredTier: UserTier.FREE },
  { title: 'תקציב', keywords: ['תקציב', 'budget'], href: routes.budget, icon: '📊', requiredTier: UserTier.FREE },
  { title: 'כרטיסי אשראי', keywords: ['כרטיס', 'כרטיסים', 'אשראי', 'credit', 'card'], href: routes.creditCards, icon: '💳', requiredTier: UserTier.FREE },
  { title: 'תחזית תשלומים', keywords: ['תחזית', 'תשלומים', 'עתידי', 'future', 'payments'], href: routes.futurePayments, icon: '💳', requiredTier: UserTier.PRO },
  { title: 'הון', keywords: ['הון', 'נכסים', 'capital'], href: routes.capital, icon: '💎', requiredTier: UserTier.PRO },
  { title: 'מסים', keywords: ['מסים', 'מס', 'tax', 'taxes'], href: routes.taxes, icon: '🏛️', requiredTier: UserTier.PRO },
  { title: 'משימות', keywords: ['משימות', 'todo', 'tasks'], href: routes.todo, icon: '✓', requiredTier: UserTier.FREE },
  { title: 'מחקר שוק', keywords: ['מחקר', 'שוק', 'market', 'research', 'מוצרים'], href: routes.marketResearch, icon: '🔍', requiredTier: UserTier.PRO },
  { title: 'Gmail', keywords: ['gmail', 'מייל', 'דואר'], href: routes.gmail, icon: '📧', requiredTier: UserTier.PRO },
  { title: 'פרופיל', keywords: ['פרופיל', 'profile', 'חשבון'], href: routes.profile, icon: '👤', requiredTier: UserTier.FREE },
  { title: 'הגדרות', keywords: ['הגדרות', 'settings'], href: routes.settings, icon: '⚙️', requiredTier: UserTier.FREE },
  { title: 'מדריך שימוש', keywords: ['מדריך', 'עזרה', 'guide', 'help'], href: routes.guide, icon: '📖', requiredTier: UserTier.FREE },
  { title: 'אודות', keywords: ['אודות', 'about'], href: routes.about, icon: 'ℹ️', requiredTier: UserTier.FREE },
]

// Only include dev/admin pages in developer mode
if (config.developerMode) {
  PAGES.push({ title: 'Dev DB', keywords: ['dev', 'db', 'database'], href: routes.devDb, icon: '🛠️', requiredTier: UserTier.PRO })
}

export default function PageSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = query.trim()
    ? PAGES.filter(p => {
        if (!userTierStore.hasAccess(p.requiredTier)) return false
        const q = query.trim().toLowerCase()
        return p.title.toLowerCase().includes(q) ||
          p.keywords.some(k => k.toLowerCase().includes(q))
      })
    : []

  useEffect(() => { setSelectedIdx(0) }, [query])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const navigate = (href: string) => {
    router.push(href)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      navigate(results[selectedIdx].href)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="חיפוש עמוד..."
        dir="rtl"
        style={{
          padding: '0.35rem 0.75rem',
          border: '1px solid #e2e8f0',
          borderRadius: '0.5rem',
          fontSize: '0.85rem',
          width: '180px',
          background: '#f8fafc',
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onMouseOver={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
        onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
      />
      {open && results.length > 0 && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          listStyle: 'none',
          padding: '0.25rem 0',
          width: '220px',
          zIndex: 100,
          direction: 'rtl',
        }}>
          {results.map((page, i) => (
            <li
              key={page.href}
              onClick={() => navigate(page.href)}
              style={{
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                background: i === selectedIdx ? '#f1f5f9' : 'transparent',
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span>{page.icon}</span>
              <span>{page.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
