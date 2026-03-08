'use client'

import React, { useState, useEffect } from 'react'
import { db } from '@/app/db/financeDB'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { getHouseholdInfo } from '@/app/services/householdService'
import { subscribeToAuth, type AuthUser } from '@/app/stores/authStore'

type CardInfo = {
  cardNumber: string
  ownerUid: string | null
  lastActivity: string
}

type HouseholdMember = { uid: string; label: string }

export default function CreditCardsPage() {
  const [cards, setCards] = useState<CardInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [accountOwners, setAccountOwners] = useState<Record<string, string>>({})

  // Wait for auth before loading data
  useEffect(() => {
    let done = false
    const unsub = subscribeToAuth((authState) => {
      if (done) return
      if (!authState.loading && authState.user) {
        done = true
        void loadAll(authState.user)
      } else if (!authState.loading && !authState.user) {
        done = true
        setLoading(false)
      }
    })
    return () => { done = true; unsub() }
  }, [])

  const loadAll = async (user: AuthUser) => {
    // Load members
    const memberList: HouseholdMember[] = []
    try {
      const info = await getHouseholdInfo()
      if (info.household) {
        const hNames = (info.household as any).memberNames || {}
        const hEmails = (info.household as any).memberEmails || {}
        for (const uid of info.household.members) {
          memberList.push({ uid, label: hNames[uid] || hEmails[uid] || uid })
        }
      }
    } catch { /* no household */ }
    if (!memberList.find(m => m.uid === user.uid)) {
      memberList.push({ uid: user.uid, label: user.displayName || user.email || user.uid })
    }
    setMembers(memberList)

    // Load cards
    const transactions = await db.transactions.where('type').equals('credit').toArray()
    const owners = await appSettingsStore.getAccountOwners()
    setAccountOwners(owners)

    const toSortable = (d: string) => {
      const [dd, mm, yyyy] = d.split('/')
      return `${yyyy}${mm}${dd}`
    }
    const byCard = new Map<string, string>()
    for (const t of transactions) {
      if (!t.cardNumber || !t.date) continue
      const existing = byCard.get(t.cardNumber)
      if (!existing || toSortable(t.date) > toSortable(existing)) {
        byCard.set(t.cardNumber, t.date)
      }
    }

    const list: CardInfo[] = Array.from(byCard.entries()).map(([cardNumber, lastDate]) => ({
      cardNumber,
      ownerUid: owners[`card:${cardNumber}`] || null,
      lastActivity: lastDate,
    }))

    list.sort((a, b) => a.cardNumber.localeCompare(b.cardNumber))
    setCards(list)
    setLoading(false)
  }

  const assignOwner = async (cardNumber: string, uid: string | null) => {
    const key = `card:${cardNumber}`
    const updated = { ...accountOwners }
    if (uid) {
      updated[key] = uid
    } else {
      delete updated[key]
    }
    setAccountOwners(updated)
    await appSettingsStore.setAccountOwners(updated)
    setCards(prev => prev.map(c =>
      c.cardNumber === cardNumber ? { ...c, ownerUid: uid } : c
    ))
  }

  if (loading) {
    return (
      <main className="app" dir="rtl">
        <div className="card"><p>טוען...</p></div>
      </main>
    )
  }

  return (
    <main className="app" dir="rtl">
      {cards.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: '#64748b' }}>
            לא נמצאו כרטיסי אשראי. ייבא קובץ אשראי כדי להתחיל.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>כרטיס</th>
                  <th>בעלים</th>
                  <th>פעילות אחרונה</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.cardNumber}>
                    <td style={{ fontWeight: 600 }}>{card.cardNumber}</td>
                    <td>
                      <select
                        value={card.ownerUid || ''}
                        onChange={(e) => assignOwner(card.cardNumber, e.target.value || null)}
                        style={{
                          padding: '0.25rem 0.4rem',
                          fontSize: '0.85rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          background: '#fff',
                          color: card.ownerUid ? '#374151' : '#94a3b8',
                        }}
                      >
                        <option value="">לא משויך</option>
                        {members.map(m => (
                          <option key={m.uid} value={m.uid}>{m.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>{card.lastActivity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}
