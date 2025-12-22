/**
 * Station ID Store
 * Generates and persists a unique ID for this browser/device
 * Used for multi-device sync lock management
 */

const STATION_ID_KEY = 'finance-station-id'

/**
 * Get or create a unique station ID for this browser
 * Returns empty string during SSR (data operations are client-only)
 */
export function getStationId(): string {
  if (typeof window === 'undefined') {
    return '' // SSR - no data operations happen here
  }

  let stationId = localStorage.getItem(STATION_ID_KEY)

  if (!stationId) {
    // Use browser's crypto.randomUUID() for proper UUID generation
    stationId = `station-${crypto.randomUUID()}`
    localStorage.setItem(STATION_ID_KEY, stationId)
  }

  return stationId
}

/**
 * Clear station ID (for testing/reset)
 */
export function clearStationId(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STATION_ID_KEY)
}
