// PUBLIC ROUTE
// Proxy for embedding external registration forms in an iframe
// Fetches the target page, rewrites URLs to go through the proxy,
// strips frame-busting headers, and injects the form-extraction script.
import { NextResponse } from 'next/server'
import { getInjectedScript } from './injected-script'
import { withServiceCall } from '@/app/lib/observe'

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
}

// Persist cookies per host across requests (simulates a browser cookie jar)
const cookieJar: Record<string, string> = {}

function getCookiesForHost(host: string): string {
  return cookieJar[host] || ''
}

function saveCookies(host: string, setCookies: string[]) {
  let cookies = cookieJar[host] || ''
  for (const sc of setCookies) {
    const name = sc.split('=')[0]
    const value = sc.split(';')[0]
    if (cookies.includes(name + '=')) {
      cookies = cookies.replace(new RegExp(name + '=[^;]*'), value)
    } else {
      cookies = cookies ? cookies + '; ' + value : value
    }
  }
  cookieJar[host] = cookies
}

// Follow redirects manually, forwarding cookies across redirects
async function fetchWithCookies(url: string, init?: RequestInit): Promise<Response> {
  let currentUrl = url
  const maxRedirects = 10

  for (let i = 0; i < maxRedirects; i++) {
    const host = new URL(currentUrl).host
    const headers: Record<string, string> = { ...COMMON_HEADERS }
    const hostCookies = getCookiesForHost(host)
    if (hostCookies) headers['Cookie'] = hostCookies
    if (init?.headers) Object.assign(headers, init.headers)

    const response = await fetch(currentUrl, {
      ...init,
      headers,
      redirect: 'manual',
    })

    // Persist cookies
    const setCookies = response.headers.getSetCookie?.() || []
    if (setCookies.length > 0) saveCookies(host, setCookies)

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) break
      currentUrl = new URL(location, currentUrl).href
      // After redirect, switch to GET
      if (init?.method === 'POST') init = { ...init, method: 'GET', body: undefined }
      continue
    }

    // Attach final URL info
    Object.defineProperty(response, 'url', { value: currentUrl })
    return response
  }

  throw new Error('Too many redirects')
}

// Process HTML response: inject <base>, content script, and return
function processHtmlResponse(response: Response, html: string, targetUrl: string): NextResponse {
  const finalUrl = response.url || targetUrl
  const finalParsed = new URL(finalUrl)
  const finalBase = `${finalParsed.protocol}//${finalParsed.host}`

  // Add <base href> so relative resources (CSS, JS, images) load from the original site
  if (!html.includes('<base')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${finalBase}/" target="_self">`)
  }

  // Inject the content script before </body>
  const script = getInjectedScript(finalUrl, finalBase, finalParsed.hostname)
  if (html.includes('</body>')) {
    html = html.replace('</body>', script + '</body>')
  } else {
    html += script
  }

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function GETHandler(req: Request) {
  const { searchParams } = new URL(req.url)
  const targetUrl = searchParams.get('url')

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing ?url= parameter' }, { status: 400 })
  }

  try {
    const response = await fetchWithCookies(targetUrl)
    const contentType = response.headers.get('content-type') || ''

    // For non-HTML resources, pass through directly
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      const body = await response.arrayBuffer()
      const headers: Record<string, string> = { 'Content-Type': contentType }
      const cacheControl = response.headers.get('cache-control')
      if (cacheControl) headers['Cache-Control'] = cacheControl
      return new NextResponse(body, { headers })
    }

    const html = await response.text()
    return processHtmlResponse(response, html, targetUrl)
  } catch (err) {
    console.error('[Proxy] Error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch page', details: String(err) },
      { status: 500 }
    )
  }
}

async function POSTHandler(req: Request) {
  const { searchParams } = new URL(req.url)
  const targetUrl = searchParams.get('url')

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing ?url= parameter' }, { status: 400 })
  }

  try {
    const body = await req.text()
    const contentType = req.headers.get('content-type') || 'application/x-www-form-urlencoded'

    const response = await fetchWithCookies(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    })

    const respContentType = response.headers.get('content-type') || ''

    // For HTML responses, process inline (don't redirect — that loses session)
    if (respContentType.includes('text/html') || respContentType.includes('application/xhtml')) {
      const html = await response.text()
      return processHtmlResponse(response, html, targetUrl)
    }

    const responseBody = await response.arrayBuffer()
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { 'Content-Type': respContentType },
    })
  } catch (err) {
    console.error('[Proxy POST] Error:', err)
    return NextResponse.json(
      { error: 'Failed to submit form', details: String(err) },
      { status: 500 }
    )
  }
}

export const GET = withServiceCall(GETHandler)
export const POST = withServiceCall(POSTHandler)
