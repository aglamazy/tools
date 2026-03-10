// CALLER-KEYED ROUTE — authenticated via caller's API key
/**
 * Product Search Chat API Route
 * AI-assisted product research — helps user describe what they need,
 * then searches the web for matching products with prices and links.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient, type LLMProvider, type LLMMessage } from '@/app/services/llm'

const SYSTEM_PROMPT = `You are a product research assistant. You help users find products online by understanding what they need and searching the web for real products.

## How to help the user
1. Ask clarifying questions about the product they're looking for — type, brand preferences, budget range, features, use case
2. Once you have enough information, search the web for real products that match
3. For each product found, provide:
   - Product name
   - A short description
   - Price (or price range)
   - A direct link to the product page on the store
   - An image URL of the product (if available from search results)

## Structured results
When you find products, include them in a <products> tag as JSON:
<products>
[
  {
    "name": "Product Name",
    "description": "Short description of the product",
    "price": "$99.99",
    "url": "https://store.com/product-page",
    "image": "https://store.com/product-image.jpg"
  }
]
</products>

## Important rules
- Always search for REAL products with REAL links — never invent products or URLs
- Prefer well-known stores (Amazon, eBay, Best Buy, Walmart, etc.) but include specialty stores when relevant
- Include the image URL from search results when available. If no image URL is found, omit the "image" field
- If the user's request is vague, ask 1-2 focused questions before searching
- You can suggest alternatives or better options if you find them
- Update results when the user refines their requirements
- Keep your conversational responses concise and helpful
- Answer in the same language the user writes in`

export async function POST(request: NextRequest) {
  try {
    const { messages, provider, apiKey } = await request.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing messages' }, { status: 400 })
    }

    const client = getLLMClient(provider as LLMProvider)
    const result = await client.chat({
      system: SYSTEM_PROMPT,
      messages: messages as LLMMessage[],
      enableWebSearch: true,
      apiKey,
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    let assistantText = result.text
    let products: Array<Record<string, string>> = []

    // Extract structured products if present
    const productsMatch = assistantText.match(/<products>\s*([\s\S]*?)\s*<\/products>/)
    if (productsMatch) {
      try {
        products = JSON.parse(productsMatch[1])
      } catch {
        console.error('[ProductSearch] Failed to parse products JSON')
      }
      assistantText = assistantText.replace(/<products>[\s\S]*?<\/products>/, '').trim()
    }

    return NextResponse.json({
      success: true,
      message: assistantText,
      products,
      groundingSources: result.groundingSources,
    })
  } catch (err: any) {
    console.error('[ProductSearch] Error:', err)
    return NextResponse.json({ success: false, error: 'Error communicating with AI' }, { status: 500 })
  }
}
