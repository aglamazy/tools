'use client'

import React from 'react'
import type { Business, Transaction } from '@/app/db/financeDB'
import type { AuthUser } from '@/app/stores/authStore'
import type { TaxProfile } from '@/app/components/TaxProfileSection'

export type HouseholdMember = { uid: string; label: string }

export type HouseholdDebug = {
  apiResult: unknown
  apiError: string | null
  fellBackToCurrentUser: boolean
}

type TaxesDebugPanelProps = {
  currentUser: AuthUser | null
  householdDebug: HouseholdDebug | null
  members: HouseholdMember[]
  userTabs: { id: string; label: string }[]
  selectedUser: string
  ownBusinesses: Business[]
  relevantBusinesses: Business[]
  bizCategoryMap: Map<string, string[]>
  expCategoryMap: Map<string, string[]>
  userBizIdsFromDocs: Set<string>
  transactions: Transaction[]
  taxProfile: TaxProfile
}

export default function TaxesDebugPanel(props: TaxesDebugPanelProps) {
  const {
    currentUser, householdDebug, members, userTabs, selectedUser,
    ownBusinesses, relevantBusinesses, bizCategoryMap, expCategoryMap,
    userBizIdsFromDocs, transactions, taxProfile,
  } = props

  const bizLite = (b: Business) => ({
    id: b.id, name: b.name, userId: b.userId ?? null,
    sharedWithMe: !!b.sharedWithMe, vatType: b.vatType ?? null,
    isTaxFree: !!b.isTaxFree, type: b.type,
  })

  const txByCategory: Record<string, number> = {}
  for (const t of transactions) {
    if (!t.category) continue
    txByCategory[t.category] = (txByCategory[t.category] || 0) + 1
  }

  const mapToObj = (m: Map<string, string[]>): Record<string, string[]> => {
    const o: Record<string, string[]> = {}
    m.forEach((v, k) => { o[String(k)] = v })
    return o
  }

  const payload = {
    currentUser: currentUser ? {
      uid: currentUser.uid,
      email: (currentUser as any).email ?? null,
      displayName: (currentUser as any).displayName ?? null,
    } : null,
    householdDebug,
    members,
    userTabs,
    selectedUser,
    ownBusinesses: ownBusinesses.map(bizLite),
    relevantBusinesses: relevantBusinesses.map(b => ({ id: b.id, name: b.name, userId: b.userId ?? null })),
    bizCategoryMap: mapToObj(bizCategoryMap),
    expCategoryMap: mapToObj(expCategoryMap),
    userBizIdsFromDocs: Array.from(userBizIdsFromDocs),
    taxProfile,
    transactions: {
      total: transactions.length,
      byCategory: txByCategory,
    },
  }

  return (
    <details
      open
      dir="ltr"
      style={{
        marginBottom: '1rem',
        padding: '0.75rem',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '0.5rem',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.75rem',
        color: '#78350f',
      }}
    >
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        DEBUG — TaxesTab state (visible only with ?debug=1)
      </summary>
      <pre style={{
        margin: '0.5rem 0 0 0',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: '60vh',
        overflow: 'auto',
      }}>
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  )
}
