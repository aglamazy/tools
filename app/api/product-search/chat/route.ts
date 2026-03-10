// CALLER-KEYED ROUTE — authenticated via caller's API key
/**
 * Product Search Chat API Route
 * AI-assisted product research — helps user describe what they need,
 * then searches the web for matching products with prices and links.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient, type LLMProvider, type LLMMessage } from '@/app/services/llm'

const SYSTEM_PROMPT = `You are a market research agent. Your job is to DO the research — not to advise the user to research on their own.

When the user describes a product or category, you search the web and deliver a comprehensive competitive landscape of real products available for purchase.

## Your workflow
1. If the user's request is too vague to search effectively, ask 1-2 focused clarifying questions (budget, use case, must-have features). Otherwise, go straight to searching.
2. Search the web thoroughly for real products that match the criteria.
3. Make a fair effort to find 5-10 leading products in the category. Do NOT stop at 2-3 results. Cover different price points, brands, and stores to give the user a real market overview.
4. Present each product with: name, short description, price, and a direct link to the product page.

## Structured results
When you find products, include them in a <products> tag as JSON:
<products>
[
  {
    "name": "Product Name",
    "description": "Short description of the product",
    "price": "$99.99",
    "url": "https://store.com/product-page"
  }
]
</products>

## Important rules
- This IS the market research. Deliver findings, not suggestions to "go research".
- Aim for 5-10 products per search. Fewer than 5 means you should search more.
- Always search for REAL products with REAL links — never invent products or URLs.
- Cover a range of options: budget, mid-range, and premium when applicable.
- Prefer well-known stores (Amazon, eBay, Best Buy, Walmart, etc.) but include specialty stores when relevant.
- Do NOT include image URLs — they are almost always inaccessible thumbnails or protected CDN links that cannot be displayed. Omit the "image" field entirely.
- You can suggest alternatives or better options if you find them.
- Update results when the user refines their requirements.
- Keep your conversational text concise — let the product cards do the talking.
- Answer in the same language the user writes in.`

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
