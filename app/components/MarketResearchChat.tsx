'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/app/components/ToastContainer'
import type { SearchStrategyId } from '@/app/services/product-search/types'

type Message = { role: 'user' | 'assistant'; content: string }

type Product = {
  name: string
  description: string
  price: string
  url: string
  image?: string
  unitPrice?: string
  quantity?: string
}

type MarketResearchChatProps = {
  title: string
  subtitle: string
  strategy: SearchStrategyId
  apiKey?: string
}

export default function MarketResearchChat({ title, subtitle, strategy, apiKey }: MarketResearchChatProps) {
  const { showToast } = useToast()

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Products state
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return

    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setChatInput('')
    setChatLoading(true)

    try {
      const body: Record<string, unknown> = { messages: newMessages, strategy }
      if (apiKey) body.apiKey = apiKey

      const response = await fetch('/api/product-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (data.success) {
        const assistantMsg: Message = { role: 'assistant', content: data.message }
        setMessages([...newMessages, assistantMsg])

        // Always update products — clear old results if no new ones found
        setProducts(data.products?.length ? data.products : [])
      } else {
        showToast('error', data.error || 'Error communicating with AI')
      }
    } catch (err) {
      console.error('[MarketResearch] Error:', err)
      showToast('error', 'Failed to send message')
    } finally {
      setChatLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    img.style.display = 'none'
    const fallback = img.nextElementSibling as HTMLElement | null
    if (fallback) fallback.style.display = 'flex'
  }

  return (
    <div style={{ display: 'contents' }}>
      {/* Chat sidebar */}
      <aside className="mr-chat">
        <div className="mr-chat-header">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="mr-chat-messages">
          {messages.length === 0 && (
            <div className="mr-chat-empty">
              <span style={{ fontSize: '2rem' }}>🔍</span>
              <p>ספר לי מה אתה מחפש ואמצא לך את המוצרים הטובים ביותר</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`mr-chat-bubble ${msg.role === 'user' ? 'mr-chat-user' : 'mr-chat-assistant'}`}
            >
              {msg.content}
            </div>
          ))}

          {chatLoading && (
            <div className="mr-chat-bubble mr-chat-assistant mr-chat-loading">
              <span className="mr-dot-pulse" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="mr-chat-input-area">
          <textarea
            ref={inputRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="תאר מוצר שאתה מחפש..."
            rows={2}
            disabled={chatLoading}
            className="mr-chat-textarea"
          />
          <button
            onClick={sendMessage}
            disabled={chatLoading || !chatInput.trim()}
            className="mr-chat-send"
          >
            שלח
          </button>
        </div>
      </aside>

      {/* Product results */}
      <section className="mr-results">
        {products.length === 0 ? (
          <div className="mr-results-empty">
            <span style={{ fontSize: '3rem' }}>🛒</span>
            <h2>מחקר שוק</h2>
            <p>תאר את המוצר שאתה מחפש בצ׳אט, ותוצאות החיפוש יופיעו כאן</p>
          </div>
        ) : (
          <>
            <div className="mr-results-header">
              <h2>תוצאות ({products.length})</h2>
              <button
                className="mr-clear-btn"
                onClick={() => setProducts([])}
              >
                נקה תוצאות
              </button>
            </div>
            <div className="mr-products-grid">
              {products.map((product, i) => (
                <a
                  key={i}
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mr-product-card"
                >
                  <div className="mr-product-image-wrap">
                    {product.image ? (
                      <>
                        <img
                          src={product.image}
                          alt={product.name}
                          className="mr-product-image"
                          onError={handleImageError}
                        />
                        <div className="mr-product-image-fallback" style={{ display: 'none' }}>
                          🛍️
                        </div>
                      </>
                    ) : (
                      <div className="mr-product-image-fallback">
                        🛍️
                      </div>
                    )}
                  </div>
                  <div className="mr-product-info">
                    <h3 className="mr-product-name">{product.name}</h3>
                    <p className="mr-product-desc">{product.description}</p>
                    <div className="mr-product-price">
                      {product.price && /\d/.test(product.price) ? product.price : 'מחיר באתר'}
                    </div>
                    {product.unitPrice && (
                      <div className="mr-product-unit-price">
                        {product.unitPrice}
                        {product.quantity && <span className="mr-product-quantity"> ({product.quantity})</span>}
                      </div>
                    )}
                  </div>
                  <div className="mr-product-cta">
                    צפה בחנות ←
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
