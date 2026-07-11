'use client'

import { useEffect } from 'react'
import { useToast } from '@/app/components/ToastContainer'
import { getClaudeKeyHealth, claimDailyAlert } from '@/app/services/claudeKeyHealth'

// App-wide watcher: probes the Claude key (at most once/day, see
// claudeKeyHealth) and, if it's genuinely unusable, raises ONE bell
// notification per day so the user knows extraction is degraded even when
// they're nowhere near Settings. Transient failures (rate-limit / network)
// don't alert — only a dead key (no-credit / invalid).
export default function ClaudeKeyHealthWatcher() {
  const { showToast } = useToast()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const health = await getClaudeKeyHealth()
      if (cancelled) return
      const deadKey = !health.ok && (health.reason === 'no-credit' || health.reason === 'invalid')
      if (deadKey && (await claimDailyAlert())) {
        if (cancelled) return
        showToast('warning', `מפתח Claude אינו פעיל — ${health.message}`, '🔑', 8000, '/app/settings?tab=apikeys')
      }
    })()
    return () => { cancelled = true }
  }, [showToast])

  return null
}
