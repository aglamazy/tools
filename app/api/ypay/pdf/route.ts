// CALLER-KEYED ROUTE — authenticated via caller's YPAY credentials
import { NextRequest, NextResponse } from 'next/server'
import { withServiceCall } from '@/app/lib/observe'

async function GETHandler(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url || !url.startsWith('https://ypay.co.il/')) {
    return NextResponse.json({ success: false, message: 'URL לא תקין' })
  }

  const response = await fetch(url)
  const contentType = response.headers.get('content-type') || ''

  if (!response.ok || !contentType.includes('pdf')) {
    return NextResponse.json({
      success: false,
      message: `לא התקבל PDF (${response.status} ${contentType})`,
    })
  }

  const arrayBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  return NextResponse.json({ success: true, base64 })
}

export const GET = withServiceCall(GETHandler)
