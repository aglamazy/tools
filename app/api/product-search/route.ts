// CALLER-KEYED ROUTE
import { NextRequest, NextResponse } from 'next/server'
import type { LLMMessage } from '@/app/services/llm'
import type { SearchStrategyId } from '@/app/services/product-search/types'
import { strategies } from '@/app/services/product-search/strategies'
import { enrichProducts } from '@/app/services/product-search/enrich'
import { withServiceCall } from '@/app/lib/observe'

async function POSTHandler(request: NextRequest) {
  try {
    const { messages, strategy: strategyId, apiKey } = await request.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing messages' }, { status: 400 })
    }

    const strategy = strategies[strategyId as SearchStrategyId]
    if (!strategy) {
      return NextResponse.json(
        { success: false, error: `Unknown strategy: ${strategyId}` },
        { status: 400 }
      )
    }

    const result = await strategy.execute(messages as LLMMessage[], apiKey)
    const products = await enrichProducts(result.products)

    return NextResponse.json({
      success: true,
      message: result.text,
      products,
      groundingSources: result.groundingSources,
    })
  } catch (err: any) {
    console.error('[ProductSearch] Error:', err)
    const message = err?.message || 'Error communicating with AI'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export const POST = withServiceCall(POSTHandler)
