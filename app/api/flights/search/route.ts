import { NextRequest, NextResponse } from 'next/server'

const SERPAPI_KEY = process.env.SERPAPI_KEY || ''

// Hebrew city name → IATA code mapping
const CITY_MAP: Record<string, string> = {
  // Israel
  'תל אביב': 'TLV', 'תא': 'TLV', 'ת"א': 'TLV',
  'ירושלים': 'JRS',
  'חיפה': 'HFA',
  'אילת': 'ETH',
  'רמון': 'ETM',
  // Western Europe
  'לונדון': 'LHR', 'לונדן': 'LHR',
  'פריז': 'CDG', 'פריס': 'CDG',
  'ברצלונה': 'BCN',
  'מדריד': 'MAD',
  'רומא': 'FCO',
  'מילאנו': 'MXP', 'מילן': 'MXP',
  'ונציה': 'VCE',
  'פירנצה': 'FLR',
  'נאפולי': 'NAP',
  'אמסטרדם': 'AMS',
  'בריסל': 'BRU',
  'ליסבון': 'LIS',
  'דבלין': 'DUB',
  'ניס': 'NCE',
  'מרסיי': 'MRS',
  'ליון': 'LYS',
  'מנצ\'סטר': 'MAN',
  'אדינבורו': 'EDI',
  // Central Europe
  'ברלין': 'BER',
  'מינכן': 'MUC',
  'פרנקפורט': 'FRA',
  'ציריך': 'ZRH',
  'באזל': 'BSL',
  'ז\'נבה': 'GVA', 'ג\'נבה': 'GVA', 'ז׳נבה': 'GVA',
  'וינה': 'VIE',
  'פראג': 'PRG',
  'בודפשט': 'BUD',
  'ורשה': 'WAW',
  'קרקוב': 'KRK',
  // Eastern / Southern Europe
  'אתונה': 'ATH',
  'סלוניקי': 'SKG', 'תסלוניקי': 'SKG',
  'בוקרשט': 'OTP',
  'סופיה': 'SOF',
  'דוברובניק': 'DBV',
  'ספליט': 'SPU',
  // Scandinavia
  'קופנהגן': 'CPH',
  'שטוקהולם': 'ARN',
  'אוסלו': 'OSL',
  'הלסינקי': 'HEL',
  // Turkey & Cyprus
  'איסטנבול': 'IST',
  'אנטליה': 'AYT',
  'לרנקה': 'LCA',
  'פאפוס': 'PFO',
  // Middle East
  'דובאי': 'DXB',
  'אבו דאבי': 'AUH',
  'עמאן': 'AMM',
  'קהיר': 'CAI',
  // Caucasus
  'טביליסי': 'TBS',
  'באטומי': 'BUS',
  'ירוואן': 'EVN',
  // Asia
  'בנגקוק': 'BKK',
  'טוקיו': 'NRT',
  'סינגפור': 'SIN',
  'הונג קונג': 'HKG',
  'סיאול': 'ICN',
  'מומבאי': 'BOM', 'בומביי': 'BOM',
  'דלהי': 'DEL',
  'ניו דלהי': 'DEL',
  // Americas
  'ניו יורק': 'JFK',
  'לוס אנג\'לס': 'LAX', 'לוס אנג׳לס': 'LAX',
  'מיאמי': 'MIA',
  'בוסטון': 'BOS',
  'שיקגו': 'ORD',
  'טורונטו': 'YYZ',
  'מונטריאול': 'YUL',
  // Africa
  'מרקש': 'RAK',
  'אדיס אבבה': 'ADD',
  'ניירובי': 'NBO',
}

function resolveIATA(input: string): { code: string; resolved: boolean } {
  const trimmed = input.trim()
  if (/^[A-Z]{3}$/i.test(trimmed)) return { code: trimmed.toUpperCase(), resolved: true }
  const mapped = CITY_MAP[trimmed]
  if (mapped) return { code: mapped, resolved: true }
  return { code: trimmed, resolved: false }
}

function sampleDates(start: string, end: string, maxSamples = 5): string[] {
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')
  const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return [start]
  if (diffDays < maxSamples) {
    const dates: string[] = []
    const d = new Date(startDate)
    while (d <= endDate) {
      dates.push(d.toISOString().split('T')[0])
      d.setDate(d.getDate() + 1)
    }
    return dates
  }

  const step = diffDays / (maxSamples - 1)
  const dates: string[] = []
  for (let i = 0; i < maxSamples; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + Math.round(i * step))
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

function buildBookingLink(fromIata: string, toIata: string, date: string): string {
  // Link to Google Flights since our data comes from there
  const d = new Date(date + 'T00:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dateStr = `${months[d.getMonth()]}+${d.getDate()}+${d.getFullYear()}`
  return `https://www.google.com/search?q=flights+${fromIata}+to+${toIata}+${dateStr}+one+way&hl=he`
}

interface SerpFlight {
  departure_airport: { name: string; id: string; time: string }
  arrival_airport: { name: string; id: string; time: string }
  duration: number // minutes
  airline: string
  airline_logo: string
  flight_number: string
}

interface SerpFlightGroup {
  flights: SerpFlight[]
  layovers?: Array<{ duration: number; name: string; id: string }>
  total_duration: number // minutes
  price: number
  type?: string
  departure_token?: string
}

async function searchDate(fromIata: string, toIata: string, date: string) {
  const url = new URL('https://serpapi.com/search')
  url.searchParams.set('engine', 'google_flights')
  url.searchParams.set('departure_id', fromIata)
  url.searchParams.set('arrival_id', toIata)
  url.searchParams.set('outbound_date', date)
  url.searchParams.set('type', '2') // one-way
  url.searchParams.set('currency', 'ILS')
  url.searchParams.set('hl', 'he')
  url.searchParams.set('api_key', SERPAPI_KEY)

  const res = await fetch(url.toString())
  if (!res.ok) return []

  const json = await res.json()
  const groups: SerpFlightGroup[] = [
    ...(json.best_flights || []),
    ...(json.other_flights || []),
  ]

  return groups.map((g, idx) => {
    const segments = g.flights
    const first = segments[0]
    const last = segments[segments.length - 1]
    // SerpApi times are "YYYY-MM-DD HH:MM" — convert to ISO
    const departure = first.departure_airport.time.replace(' ', 'T') + ':00'
    const arrival = last.arrival_airport.time.replace(' ', 'T') + ':00'

    return {
      id: `${date}-${idx}`,
      price: g.price,
      currency: 'ILS',
      airlines: [...new Set(segments.map(s => s.airline))],
      stops: segments.length - 1,
      departure,
      arrival,
      duration: g.total_duration * 60, // convert minutes → seconds
      deepLink: buildBookingLink(fromIata, toIata, date),
      route: segments.map(s => ({
        airline: s.airline,
        flyFrom: s.departure_airport.id,
        flyTo: s.arrival_airport.id,
        departure: s.departure_airport.time.replace(' ', 'T') + ':00',
        arrival: s.arrival_airport.time.replace(' ', 'T') + ':00',
      })),
    }
  })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const from = params.get('from')
  const to = params.get('to')
  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')

  if (!from || !to || !dateFrom || !dateTo) {
    return NextResponse.json({ error: 'Missing required params: from, to, dateFrom, dateTo' }, { status: 400 })
  }

  if (!SERPAPI_KEY) {
    return NextResponse.json({ error: 'SerpApi key not configured' }, { status: 500 })
  }

  try {
    const fromResult = resolveIATA(from)
    const toResult = resolveIATA(to)

    if (!fromResult.resolved) {
      return NextResponse.json({ error: `לא זוהה מוצא "${from}". נסה קוד IATA (למשל TLV)` }, { status: 400 })
    }
    if (!toResult.resolved) {
      return NextResponse.json({ error: `לא זוהה יעד "${to}". נסה קוד IATA (למשל BCN)` }, { status: 400 })
    }

    const dates = sampleDates(dateFrom, dateTo)
    // Search dates sequentially to stay within rate limits
    const allFlights = []
    for (const date of dates) {
      const results = await searchDate(fromResult.code, toResult.code, date)
      allFlights.push(...results)
    }

    allFlights.sort((a, b) => a.price - b.price)

    return NextResponse.json(allFlights)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
