'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppChat from '@/app/components/AppChat'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleBubble = () => {
    if (window.innerWidth <= 768) {
      router.push('/app/chat')
    } else {
      setOpen(prev => !prev)
    }
  }

  return (
    <>
      {open && (
        <div className="chat-float-panel" dir="rtl">
          <div className="chat-float-header">
            <span>💬 עוזר אישי</span>
            <button className="chat-float-close" onClick={() => setOpen(false)} aria-label="סגור">✕</button>
          </div>
          <AppChat />
        </div>
      )}
      <button
        className="chat-float-bubble"
        onClick={handleBubble}
        aria-label="פתח עוזר אישי"
      >
        {open ? '✕' : '💬'}
      </button>
    </>
  )
}
