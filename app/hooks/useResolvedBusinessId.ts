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
      // Next's useParams() does NOT decode a non-ASCII dynamic segment here —
      // raw arrives as the still-percent-encoded literal (e.g. "%D7%AA%D7%A9"
      // for "תש"), so a slug lookup with the raw value never matches a
      // Hebrew (or any non-ASCII) slug. decodeURIComponent is idempotent on
      // an already-decoded slug (our slugs never contain a literal "%").
      let decoded = raw
      try {
        decoded = decodeURIComponent(raw)
      } catch {
        // Malformed percent-encoding — fall back to the raw value.
      }
      const bySlug = await businessStore.getBySlug(decoded)
      if (bySlug) {
        if (!cancelled) setBusiness(bySlug)
        return
      }
      const numeric = Number(decoded)
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
