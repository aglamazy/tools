/**
 * Register all store plugins. Import this once at app startup.
 */
import { registerStore } from './storeRegistry'
import { shufersalPlugin } from './shufersalPlugin'
import { createRexailPlugin } from './retalixClient'
import { REXAIL_STORES } from './rexailStores'

let initialized = false

export function initStores() {
  if (initialized) return
  registerStore(shufersalPlugin)
  // All Rexail-powered chains: Makor HaShefa registers as 'retalix' (legacy
  // id, preserves existing user data); the rest register under 'rexail_*'.
  for (const entry of REXAIL_STORES) {
    registerStore(createRexailPlugin({
      id: entry.id,
      label: entry.label,
      config: { siteOrigin: entry.siteOrigin, xWebsite: entry.xWebsite, storeId: entry.storeId },
    }))
  }
  initialized = true
}
