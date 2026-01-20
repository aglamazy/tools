'use client'

import React, { useState } from 'react'
import { createPayment } from '@/app/services/upayService'
import { getCurrentUser } from '@/app/services/firebaseAuthService'

type UpgradeModalProps = {
  isOpen: boolean
  onClose: () => void
  featureName?: string
}

const BUSINESS_BENEFITS = [
  'ניהול עסקים מרובים',
  'דוחות מתקדמים',
  'ייצוא לאקסל',
  'גיבוי בענן',
  'תמיכה מועדפת',
]

const PRICE_DISPLAY = process.env.NEXT_PUBLIC_PRICE_DISPLAY || '₪99'

export default function UpgradeModal({ isOpen, onClose, featureName }: UpgradeModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleUpgrade = async () => {
    setIsLoading(true)
    setError(null)

    const user = getCurrentUser()
    if (!user) {
      setError('יש להתחבר לחשבון כדי לשדרג')
      setIsLoading(false)
      return
    }

    try {
      const result = await createPayment(user.uid, user.email || undefined)
      if (result.url) {
        window.location.href = result.url
      } else {
        setError(result.error || 'שגיאה ביצירת תשלום')
      }
    } catch (err) {
      console.error('[UpgradeModal] Payment error:', err)
      setError('שגיאה בתהליך השדרוג')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content upgrade-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="סגור">
          &times;
        </button>

        <div className="upgrade-header">
          <span className="upgrade-icon">💎</span>
          <h2>שדרג לחבילת Business</h2>
          {featureName && (
            <p className="upgrade-feature-name">
              התכונה &quot;{featureName}&quot; זמינה בחבילת Business
            </p>
          )}
        </div>

        <div className="upgrade-benefits">
          <h3>יתרונות החבילה:</h3>
          <ul>
            {BUSINESS_BENEFITS.map((benefit, index) => (
              <li key={index}>
                <span className="benefit-check">✓</span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <div className="upgrade-price">
          <span className="price-amount">{PRICE_DISPLAY}</span>
          <span className="price-period">תשלום חד פעמי</span>
        </div>

        {error && <div className="upgrade-error">{error}</div>}

        <div className="upgrade-actions">
          <button
            className="btn btn-primary upgrade-btn"
            onClick={handleUpgrade}
            disabled={isLoading}
          >
            {isLoading ? 'מעבד...' : 'שדרג עכשיו'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            אולי מאוחר יותר
          </button>
        </div>

        <p className="upgrade-note">
          התשלום מתבצע באמצעות UPAY בצורה מאובטחת
        </p>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .modal-content {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 420px;
            width: 90%;
            position: relative;
            text-align: center;
          }

          .modal-close {
            position: absolute;
            top: 0.75rem;
            left: 0.75rem;
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #64748b;
            padding: 0.25rem;
            line-height: 1;
          }

          .modal-close:hover {
            color: #1e293b;
          }

          .upgrade-header {
            margin-bottom: 1.5rem;
          }

          .upgrade-icon {
            font-size: 3rem;
            display: block;
            margin-bottom: 0.5rem;
          }

          .upgrade-header h2 {
            margin: 0 0 0.5rem;
            color: #1e293b;
            font-size: 1.5rem;
          }

          .upgrade-feature-name {
            color: #64748b;
            font-size: 0.9rem;
            margin: 0;
          }

          .upgrade-benefits {
            text-align: right;
            margin-bottom: 1.5rem;
          }

          .upgrade-benefits h3 {
            font-size: 1rem;
            color: #475569;
            margin-bottom: 0.75rem;
          }

          .upgrade-benefits ul {
            list-style: none;
            padding: 0;
            margin: 0;
          }

          .upgrade-benefits li {
            padding: 0.5rem 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #334155;
          }

          .benefit-check {
            color: #22c55e;
            font-weight: bold;
          }

          .upgrade-price {
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
          }

          .price-amount {
            display: block;
            font-size: 2rem;
            font-weight: bold;
          }

          .price-period {
            font-size: 0.85rem;
            opacity: 0.9;
          }

          .upgrade-error {
            background: #fee2e2;
            color: #dc2626;
            padding: 0.75rem;
            border-radius: 6px;
            margin-bottom: 1rem;
            font-size: 0.9rem;
          }

          .upgrade-actions {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .upgrade-btn {
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            border: none;
            padding: 0.875rem 1.5rem;
            font-size: 1rem;
            font-weight: 600;
            border-radius: 8px;
            cursor: pointer;
            transition: transform 0.15s, box-shadow 0.15s;
          }

          .upgrade-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
          }

          .upgrade-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .btn-secondary {
            background: transparent;
            border: 1px solid #e2e8f0;
            color: #64748b;
            padding: 0.75rem 1.5rem;
            font-size: 0.9rem;
            border-radius: 8px;
            cursor: pointer;
          }

          .btn-secondary:hover {
            background: #f8fafc;
          }

          .upgrade-note {
            margin-top: 1rem;
            font-size: 0.8rem;
            color: #94a3b8;
          }
        `}</style>
      </div>
    </div>
  )
}
