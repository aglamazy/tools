export interface FlightResult {
  id: string
  price: number
  currency: string
  airlines: string[]
  stops: number
  departure: string // ISO datetime
  arrival: string // ISO datetime
  duration: number // seconds
  deepLink: string
  route: FlightLeg[]
}

export interface FlightLeg {
  airline: string
  flyFrom: string
  flyTo: string
  departure: string
  arrival: string
}

export async function searchFlights(
  from: string,
  to: string,
  windowStart: string,
  windowEnd: string,
): Promise<FlightResult[]> {
  const url = new URL('/api/flights/search', window.location.origin)
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  url.searchParams.set('dateFrom', windowStart)
  url.searchParams.set('dateTo', windowEnd)

  const res = await fetch(url.toString())

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Flight search failed: ${res.status}`)
  }

  return res.json()
}
