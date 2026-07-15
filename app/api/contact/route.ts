/**
 * Contact Form API Route
 * POST — save contact message to Firestore
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'
import { withServiceCall } from '@/app/lib/observe'

const COLLECTION = 'contactMessages'

// PUBLIC ROUTE
async function POSTHandler(request: NextRequest) {
  try {
    if (!isAdminConfigured()) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { name, email, message } = body

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'כל השדות חובה' }, { status: 400 })
    }

    if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    if (name.length > 200 || email.length > 200 || message.length > 5000) {
      return NextResponse.json({ error: 'Input too long' }, { status: 400 })
    }

    const firestore = getAdminFirestore()
    await firestore.collection(COLLECTION).add({
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
      createdAt: new Date().toISOString(),
      read: false,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Contact] Failed to save message:', err)
    return NextResponse.json({ error: 'שגיאה בשליחת ההודעה' }, { status: 500 })
  }
}

export const POST = withServiceCall(POSTHandler)
