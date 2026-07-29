'use client'

import { useEffect, useState } from 'react'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'

// Resolves a /app/business/{param} route segment — a slug (preferred,
// e.g. "AH") or a legacy numeric id (for old bookmarks/links) — to the
// actual Business record. undefined while resolving, null if nothing
// matched either lookup.
export function useResolvedBusiness(raw: string): Business | null | undefined {
  const [business, setBusiness] = useState<Business | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setBusiness(undefined)
    const resolve = async () => {
      const bySlug = await businessStore.getBySlug(raw)
      if (bySlug) {
        if (!cancelled) setBusiness(bySlug)
        return
      }
      const numeric = Number(raw)
      if (!isNaN(numeric)) {
        const byId = await businessStore.getById(numeric)
        if (!cancelled) setBusiness(byId ?? null)
        return
      }
      if (!cancelled) setBusiness(null)
    }
    void resolve()
    return () => {
      cancelled = true
    }
  }, [raw])

  return business
}

// Convenience wrapper for routes that only need the local numeric id (e.g.
// to hand off to a component that does its own full Business lookup).
export function useResolvedBusinessId(raw: string): number | null | undefined {
  const business = useResolvedBusiness(raw)
  if (business === undefined) return undefined
  return business?.id ?? null
}
