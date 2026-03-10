/** Fetch a product page and extract metadata from og/meta tags, JSON-LD, and HTML */
export async function scrapeProductMeta(url: string): Promise<{
  image?: string
  title?: string
  description?: string
  price?: string
}> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.log(`[Scrape] ${url} returned ${res.status}`)
      return {}
    }

    const html = await res.text()
    console.log(`[Scrape] ${url} — ${html.length} bytes`)

    const getMeta = (property: string): string | undefined => {
      const re = new RegExp(
        `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
        'i'
      )
      const reRev = new RegExp(
        `<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
        'i'
      )
      return re.exec(html)?.[1] || reRev.exec(html)?.[1] || undefined
    }

    // Extract product data from JSON-LD structured data
    const extractJsonLd = (): { price?: string; image?: string; title?: string; description?: string } => {
      const result: { price?: string; image?: string; title?: string; description?: string } = {}
      const jsonLdBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
      if (!jsonLdBlocks) return result

      // Extract price from an offer object (handles nested priceSpecification)
      const extractPrice = (offer: any): { amount?: string; currency?: string } => {
        if (offer?.price) return { amount: String(offer.price), currency: offer.priceCurrency }
        if (offer?.lowPrice) return { amount: String(offer.lowPrice), currency: offer.priceCurrency }
        // Handle priceSpecification (common in Shopify/WooCommerce)
        const spec = Array.isArray(offer?.priceSpecification) ? offer.priceSpecification[0] : offer?.priceSpecification
        if (spec?.price) return { amount: String(spec.price), currency: spec.priceCurrency }
        return {}
      }

      // Process a Product-type object
      const processProduct = (item: any) => {
        if (!result.title && item.name) result.title = item.name
        if (!result.description && item.description) result.description = item.description
        if (!result.image) {
          const img = Array.isArray(item.image) ? item.image[0] : item.image
          if (typeof img === 'string') result.image = img
          else if (img?.url) result.image = img.url
        }
        if (!result.price) {
          const offers = item.offers
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers
            const { amount, currency } = extractPrice(offer)
            if (amount) {
              const sym = currency === 'ILS' ? '₪' : currency || ''
              result.price = sym ? `${amount} ${sym}` : amount
            }
          }
        }
      }

      // Recursively find Product types in JSON-LD (handles @graph)
      const findProducts = (obj: any, depth = 0) => {
        if (depth > 5 || !obj) return
        if (typeof obj !== 'object') return
        if (Array.isArray(obj)) {
          for (const item of obj) findProducts(item, depth + 1)
          return
        }
        const type = obj['@type']
        if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
          processProduct(obj)
        }
        if (obj['@graph']) findProducts(obj['@graph'], depth + 1)
      }

      for (const block of jsonLdBlocks) {
        try {
          const jsonStr = block.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')
          findProducts(JSON.parse(jsonStr))
        } catch { /* invalid JSON-LD */ }
      }
      return result
    }

    // Fallback: extract price from raw HTML when no structured data exists
    const extractPriceFromHtml = (): string | undefined => {
      let match

      // 1. Price in inline JS: "price":250 or "price":"250.00" (most reliable)
      const jsPriceRe = /["']price["']\s*:\s*["']?([\d]+(?:[,\d]+)*(?:\.\d{1,2})?)["']?/gi
      while ((match = jsPriceRe.exec(html)) !== null) {
        const cleaned = match[1].replace(/,/g, '')
        const amount = parseFloat(cleaned)
        if (amount >= 20 && amount <= 100000) {
          return `${cleaned} ₪`
        }
      }

      // 2. Elements with price-related classes/ids containing ₪
      const priceElRe = /<[^>]*(?:class|id)=["'][^"']*(?:price|mone)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi
      while ((match = priceElRe.exec(html)) !== null) {
        const inner = match[1].replace(/<[^>]+>/g, '').trim()
        const priceMatch = inner.match(/(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*₪|₪\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/)
        if (priceMatch) {
          const raw = (priceMatch[1] || priceMatch[2]).replace(/,/g, '')
          const amount = parseFloat(raw)
          if (amount >= 20 && amount <= 100000) {
            return `${raw} ₪`
          }
        }
      }

      // 3. Currency patterns in visible HTML (₪ near digits) — min ₪50 to skip shipping/small values
      const currencyRe = /(?:(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*₪|₪\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?))/g
      while ((match = currencyRe.exec(html)) !== null) {
        const raw = (match[1] || match[2]).replace(/,/g, '')
        const amount = parseFloat(raw)
        if (amount >= 50 && amount <= 100000) {
          return `${raw} ₪`
        }
      }

      return undefined
    }

    const metaImage = getMeta('og:image') || getMeta('twitter:image')
    const metaTitle = getMeta('og:title') || getMeta('twitter:title')
    const metaDesc = getMeta('og:description') || getMeta('twitter:description') || getMeta('description')
    const metaPrice = getMeta('product:price:amount') || getMeta('og:price:amount')

    const jsonLd = extractJsonLd()
    const htmlPrice = (!metaPrice && !jsonLd.price) ? extractPriceFromHtml() : undefined

    const result_data = {
      image: metaImage || jsonLd.image,
      title: metaTitle || jsonLd.title,
      description: metaDesc || jsonLd.description,
      price: metaPrice || jsonLd.price || htmlPrice,
    }

    console.log(`[Scrape] ${url} — found: image=${!!result_data.image}, title=${!!result_data.title}, price=${result_data.price || 'none'}`)
    return result_data
  } catch (e) {
    console.log(`[Scrape] ${url} — error: ${e}`)
    return {}
  }
}
