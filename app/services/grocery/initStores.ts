/**
 * Register all store plugins. Import this once at app startup.
 */
import { registerStore } from './storeRegistry'
import { shufersalPlugin } from './shufersalPlugin'
import { retalixPlugin } from './retalixClient'

let initialized = false

export function initStores() {
  if (initialized) return
  registerStore(shufersalPlugin)
  registerStore(retalixPlugin)
  initialized = true
}
