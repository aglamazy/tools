import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { clearAllPendingSearches } from '@/app/services/chat/actionExecutor'

export async function POST(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  await clearAllPendingSearches(guard.uid)
  return NextResponse.json({ success: true })
}
