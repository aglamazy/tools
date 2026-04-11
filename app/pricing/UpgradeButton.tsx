'use client'

import { useEffect, useState } from 'react'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'

interface UpgradeButtonProps {
  planTier: string
  planName: string
  planCta: string
  comingSoon?: boolean
  highlighted?: boolean
}

export default function UpgradeButton({ planTier, planName, planCta, comingSoon, highlighted }: UpgradeButtonProps) {
  const [currentTier, setCurrentTier] = useState<UserTier>(userTierStore.get())

  useEffect(() => {
    const unsubscribe = userTierStore.subscribe(setCurrentTier)
    return unsubscribe
  }, [])

  const isCurrentPlan = currentTier === planTier

  const handleUpgrade = () => {
    if (comingSoon) return
    const message = `שלום, אני מעוניין לשדרג לתוכנית ${planName}`
    window.open(`mailto:support@aglamaz.com?subject=שדרוג לתוכנית ${planName}&body=${encodeURIComponent(message)}`, '_blank')
  }

  return (
    <button
      onClick={handleUpgrade}
      disabled={isCurrentPlan || comingSoon}
      style={{
        width: '100%',
        padding: '0.875rem',
        borderRadius: '0.5rem',
        border: 'none',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: isCurrentPlan || comingSoon ? 'default' : 'pointer',
        background: isCurrentPlan
          ? (highlighted ? 'rgba(255,255,255,0.2)' : '#e2e8f0')
          : highlighted
            ? '#fff'
            : '#4338ca',
        color: isCurrentPlan
          ? (highlighted ? 'rgba(255,255,255,0.8)' : '#64748b')
          : highlighted
            ? '#4338ca'
            : '#fff',
      }}
    >
      {isCurrentPlan ? 'התוכנית הנוכחית' : planCta}
    </button>
  )
}
