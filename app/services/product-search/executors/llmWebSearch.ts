import { getLLMClient } from '@/app/services/llm'
import type { LLMMessage, LLMProvider, SearchResult } from '../types'
import { parseProductsFromText } from '../parseProductsFromText'

const SYSTEM_PROMPT = `You are a market research agent. You DO the research yourself. You NEVER tell the user to check, verify, or research anything on their own.

## ABSOLUTE RULES — NEVER BREAK THESE
- NEVER say "מומלץ לבדוק", "כדאי לבדוק", "ניתן לבדוק", "בדוק באתר", or any variation telling the user to check something themselves.
- NEVER say "מומלץ לפנות", "צור קשר", or tell the user to contact a store/supplier.
- NEVER give advice like "consider checking", "you might want to look at", "I recommend researching".
- YOU are the researcher. If you don't know something (like shipping cost), say "לא מצאתי מידע על משלוח" — do NOT tell the user to go find it.
- If you cannot find specific information, state what you found and what you couldn't find. Period. No homework assignments for the user.

## Your workflow
1. If the request is too vague, ask 1-2 focused clarifying questions. Otherwise, search immediately.
2. Search the web thoroughly for real products matching the criteria.
3. Find 5-10 products. Cover different price points, brands, and stores.
4. Present results in structured format (see below). Keep conversational text minimal — let the product cards speak.

## Structured results — MANDATORY FORMAT
You MUST include a <products> JSON block in EVERY response that contains product findings.
NEVER list products as bullet points, numbered lists, or formatted text in the message body.
The ONLY way to present products is inside the <products> tag:
<products>
[
  {
    "name": "Product Name",
    "description": "Short description",
    "price": "99.99 ₪",
    "url": "https://store.com/product-page",
    "image": "https://store.com/product-image.jpg"
  }
]
</products>

If you found products but forget the <products> tag, the user will see NOTHING. The tag is how products get displayed.

## Product rules
- Only REAL products with REAL URLs from your web search. Never invent products or URLs.
- Cover budget, mid-range, and premium options when applicable.
- For images: use direct image URLs from the product page or store CDN. If no proper image URL exists, omit the "image" field.
- Update results when the user refines their requirements.
- Answer in the same language the user writes in.
- Keep your message text SHORT (1-2 sentences). All product details go in the <products> tag, not in the text.`

/**
 * LLM with built-in web search (Gemini grounding / Claude web search).
 * Replaces hallucinated product URLs with real grounding source URLs.
 */
export function createLlmWebSearchExecutor(provider: LLMProvider) {
  return async (messages: LLMMessage[], apiKey?: string): Promise<SearchResult> => {
    const client = getLLMClient(provider)
    const result = await client.chat({
      system: SYSTEM_PROMPT,
      messages,
      enableWebSearch: true,
      apiKey,
    })

    if (result.error) {
      throw new Error(result.error)
    }

    const { text, products } = parseProductsFromText(result.text)
    const groundingSources = result.groundingSources || []

    // Replace hallucinated product URLs with real grounding source URLs
    if (products.length > 0 && groundingSources.length > 0) {
      const usedGroundingIndices = new Set<number>()

      for (const product of products) {
        // Try to find a grounding source matching by domain
        let bestIdx = -1
        try {
          const productHost = new URL(product.url).hostname.replace('www.', '')
          bestIdx = groundingSources.findIndex((gs, i) => {
            if (usedGroundingIndices.has(i)) return false
            try {
              return new URL(gs.url).hostname.replace('www.', '') === productHost
            } catch { return false }
          })
        } catch { /* invalid product URL */ }

        // Fallback: match by product name appearing in grounding title
        if (bestIdx === -1) {
          const nameLower = product.name.toLowerCase()
          bestIdx = groundingSources.findIndex((gs, i) => {
            if (usedGroundingIndices.has(i)) return false
            return gs.title?.toLowerCase().includes(nameLower) ||
              nameLower.includes(gs.title?.toLowerCase() || '\x00')
          })
        }

        if (bestIdx !== -1) {
          console.log(`[llmWebSearch] Replacing URL for "${product.name}": ${product.url} -> ${groundingSources[bestIdx].url}`)
          product.url = groundingSources[bestIdx].url
          usedGroundingIndices.add(bestIdx)
        }
      }

      // For products that didn't match any grounding source, assign remaining grounding URLs
      const unmatchedProducts = products.filter((_, i) => {
        try { new URL(products[i].url); return false } catch { return true }
      })
      const remainingGrounding = groundingSources.filter((_, i) => !usedGroundingIndices.has(i))
      for (let i = 0; i < Math.min(unmatchedProducts.length, remainingGrounding.length); i++) {
        unmatchedProducts[i].url = remainingGrounding[i].url
      }
    }

    return { text, products, groundingSources }
  }
}
