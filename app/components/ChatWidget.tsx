'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppChat from '@/app/components/AppChat'
import YesNoModal from '@/app/components/YesNoModal'
import { subscribeToAuth } from '@/app/stores/authStore'
import { chatHistoryStore, type ChatSummary } from '@/app/stores/chatHistoryStore'

/** Compact Hebrew "time ago" helper — good enough for a chat list. */
function formatRelativeHe(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  if (diffMs < 0) return 'עכשיו'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'עכשיו'
  if (minutes < 60) return `לפני ${minutes} דק׳`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `לפני ${hours} שע׳`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'אתמול'
  if (days < 7) return `לפני ${days} ימים`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `לפני ${weeks} שב׳`
  const months = Math.floor(days / 30)
  if (months < 12) return `לפני ${months} חוד׳`
  const years = Math.floor(days / 365)
  return `לפני ${years} שנ׳`
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<ChatSummary | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Track auth + initial chat list.
  useEffect(() => {
    const unsub = subscribeToAuth(async ({ user, initialized }) => {
      if (!initialized) return
      if (!user) {
        setUid(null)
        setChats([])
        setActiveId(null)
        return
      }
      setUid(user.uid)
      const [list, current] = [await chatHistoryStore.listChats(user.uid), chatHistoryStore.getActiveChatId(user.uid)]
      setChats(list)
      setActiveId(current)
    })
    return unsub
  }, [])

  // Keep chat list in sync whenever the store mutates.
  useEffect(() => {
    if (!uid) return
    const unsubChanges = chatHistoryStore.subscribeChanges(async (listenerUid) => {
      if (listenerUid !== uid) return
      const list = await chatHistoryStore.listChats(uid)
      setChats(list)
    })
    const unsubActive = chatHistoryStore.subscribeActive((listenerUid, nextId) => {
      if (listenerUid !== uid) return
      setActiveId(nextId)
    })
    return () => {
      unsubChanges()
      unsubActive()
    }
  }, [uid])

  // Click-outside to close the dropdown.
  useEffect(() => {
    if (!dropdownOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!dropdownRef.current) return
      if (!dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [dropdownOpen])

  const handleBubble = () => {
    if (window.innerWidth <= 768) {
      router.push('/app/chat')
    } else {
      setOpen(prev => !prev)
    }
  }

  const createNew = useCallback(async () => {
    if (!uid) return
    const chat = await chatHistoryStore.createChat(uid)
    chatHistoryStore.setActiveChatId(uid, chat.id)
    setDropdownOpen(false)
  }, [uid])

  const switchTo = useCallback((id: string) => {
    if (!uid) return
    chatHistoryStore.setActiveChatId(uid, id)
    setDropdownOpen(false)
  }, [uid])

  const startRename = (chat: ChatSummary) => {
    setRenamingId(chat.id)
    setRenameValue(chat.title)
  }

  const commitRename = async () => {
    if (!uid || !renamingId) return
    const trimmed = renameValue.trim()
    if (trimmed.length > 0) {
      await chatHistoryStore.renameChat(uid, renamingId, trimmed)
    }
    setRenamingId(null)
    setRenameValue('')
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  const confirmDelete = async () => {
    if (!uid || !deleteCandidate) return
    await chatHistoryStore.deleteChat(uid, deleteCandidate.id)
    setDeleteCandidate(null)
  }

  const activeChat = chats.find(c => c.id === activeId) ?? null
  const activeTitle = activeChat?.title || 'שיחה חדשה'

  return (
    <>
      {open && (
        <div className="chat-float-panel" dir="rtl">
          <div className="chat-float-header">
            <span className="chat-float-header-label">💬 עוזר אישי</span>
            <div className="chat-float-switcher" ref={dropdownRef}>
              <button
                type="button"
                className="chat-float-title"
                onClick={() => setDropdownOpen(o => !o)}
                title={activeTitle}
              >
                <span className="chat-float-title-text">{activeTitle}</span>
                <span className="chat-float-title-arrow">{dropdownOpen ? '▲' : '▼'}</span>
              </button>
              {dropdownOpen && (
                <div className="chat-float-dropdown">
                  <button className="chat-float-dropdown-new" onClick={createNew}>
                    ➕ שיחה חדשה
                  </button>
                  <div className="chat-float-dropdown-list">
                    {chats.length === 0 && (
                      <div className="chat-float-dropdown-empty">אין שיחות קודמות</div>
                    )}
                    {chats.map(chat => (
                      <div
                        key={chat.id}
                        className={`chat-float-dropdown-row ${chat.id === activeId ? 'is-active' : ''}`}
                      >
                        {renamingId === chat.id ? (
                          <input
                            className="chat-float-dropdown-rename"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                              else if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                            }}
                            onBlur={commitRename}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            className="chat-float-dropdown-pick"
                            onClick={() => switchTo(chat.id)}
                          >
                            <span className="chat-float-dropdown-title">{chat.title}</span>
                            <span className="chat-float-dropdown-meta">{formatRelativeHe(chat.updatedAt)}</span>
                          </button>
                        )}
                        {renamingId !== chat.id && (
                          <div className="chat-float-dropdown-actions">
                            <button
                              type="button"
                              className="chat-float-dropdown-icon"
                              aria-label="שנה שם"
                              onClick={(e) => { e.stopPropagation(); startRename(chat) }}
                            >
                              ✏
                            </button>
                            <button
                              type="button"
                              className="chat-float-dropdown-icon"
                              aria-label="מחק"
                              onClick={(e) => { e.stopPropagation(); setDeleteCandidate(chat) }}
                            >
                              🗑
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
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

      <YesNoModal
        isOpen={!!deleteCandidate}
        question={deleteCandidate ? `למחוק את השיחה "${deleteCandidate.title}"?` : ''}
        yesText="מחק"
        noText="ביטול"
        onYes={confirmDelete}
        onNo={() => setDeleteCandidate(null)}
      />
    </>
  )
}
