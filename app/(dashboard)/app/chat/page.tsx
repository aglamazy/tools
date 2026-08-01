'use client'

import { useEffect } from 'react'
import AppChat from '@/app/components/AppChat'
import { chatPageActive } from '@/app/lib/chatPageActive'

export default function ChatPage() {
  useEffect(() => {
    chatPageActive.set(true)
    return () => chatPageActive.set(false)
  }, [])

  return (
    <div dir="rtl" className="app-chat-page">
      <AppChat />
    </div>
  )
}
