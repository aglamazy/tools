'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export default function FormFillerClient() {
  const [url, setUrl] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const loadUrl = useCallback((targetUrl?: string) => {
    const raw = (targetUrl || url).trim()
    if (!raw) return
    let target = raw
    if (!target.startsWith('http')) target = 'https://' + target
    setLoading(true)
    setLoadedUrl(`/api/proxy?url=${encodeURIComponent(target)}`)
  }, [url])

  // Auto-load on paste
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim()
    if (pasted && (pasted.startsWith('http://') || pasted.startsWith('https://'))) {
      // Let the paste complete, then load
      setTimeout(() => loadUrl(pasted), 0)
    }
  }, [loadUrl])

  // Forward messages between proxied iframe and sidebar iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg || !msg.type) return

      // Messages from the proxied page (FIELDS_RESULT, FILL_RESULT)
      if (msg.type === 'FIELDS_RESULT' || msg.type === 'FILL_RESULT') {
        const sidebarIframe = document.getElementById('sidebar-iframe') as HTMLIFrameElement
        sidebarIframe?.contentWindow?.postMessage(msg, '*')
      }

      // Messages from the sidebar (EXTRACT_FIELDS, FILL_FIELDS)
      if (msg.type === 'EXTRACT_FIELDS' || msg.type === 'FILL_FIELDS') {
        iframeRef.current?.contentWindow?.postMessage(msg, '*')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '80vh', background: '#f1f5f9', borderRadius: '0.5rem', overflow: 'hidden' }}>
      {/* URL Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
      }}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            background: sidebarOpen ? '#3b82f6' : '#475569',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            padding: '0.4rem 0.75rem',
            fontSize: '0.8rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontWeight: 600,
          }}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? '◄ Sidebar' : '► Sidebar'}
        </button>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') loadUrl() }}
          onPaste={handlePaste}
          placeholder="Enter registration page URL..."
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            background: '#0f172a',
            color: '#e2e8f0',
            border: '1px solid #475569',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        <button
          onClick={() => loadUrl()}
          style={{
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            padding: '0.5rem 1.25rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Go
        </button>
      </div>

      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Target site iframe */}
        <div style={{ flex: 1, position: 'relative' }}>
          {!loadedUrl ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#64748b',
              gap: '1rem',
            }}>
              <div style={{ fontSize: '3rem' }}>📋</div>
              <p style={{ fontSize: '1.1rem', margin: 0 }}>Enter a registration page URL above to get started</p>
              <p style={{ fontSize: '0.85rem', margin: 0, color: '#94a3b8' }}>
                The form will load here and the sidebar will help you fill it
              </p>
            </div>
          ) : (
            <>
              {loading && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f8fafc',
                  zIndex: 5,
                }}>
                  <div style={{ textAlign: 'center', color: '#64748b' }}>
                    <div style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      border: '3px solid #e2e8f0',
                      borderTopColor: '#3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                      margin: '0 auto 1rem',
                    }} />
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading page...</p>
                  </div>
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={loadedUrl}
                onLoad={() => setLoading(false)}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: 'white',
                }}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation"
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </>
          )}
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div style={{
            width: '360px',
            minWidth: '360px',
            borderLeft: '2px solid #e2e8f0',
            background: '#f8fafc',
            overflow: 'hidden',
          }}>
            <iframe
              id="sidebar-iframe"
              src="/extension/sidebar"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
