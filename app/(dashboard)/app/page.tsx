"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { getPageById } from '@/app/lib/pageRegistry'
import HomePage from '@/app/components/HomePage'

export default function DashboardPage() {
  const router = useRouter()
  const [showHome, setShowHome] = useState(false)

  useEffect(() => {
    appSettingsStore.getDefaultPage().then(pageId => {
      if (pageId && pageId !== 'home') {
        const page = getPageById(pageId)
        if (page) {
          router.replace(page.href)
          return
        }
      }
      setShowHome(true)
    })
  }, [router])

  if (!showHome) return null

  return <HomePage />
}
