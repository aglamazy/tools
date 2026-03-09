/**
 * ProfileQA CRUD API Route
 * HTTP access to ProfileQA store for the Chrome extension
 * (Extension cannot use Dexie directly — it needs HTTP endpoints)
 * Uses Firestore as the server-side store.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireTc } from '@/app/lib/apiGuard'

const COLLECTION = 'profileQAs'

// GET — fetch all ProfileQA entries for a user (optionally filtered by businessId)
export async function GET(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')
  const siteKey = searchParams.get('siteKey')

  try {
    const firestore = getAdminFirestore()
    let query: FirebaseFirestore.Query = firestore.collection(COLLECTION).where('uid', '==', uid)
    if (businessId) {
      query = query.where('businessId', '==', Number(businessId))
    }
    if (siteKey) {
      query = query.where('siteKey', '==', siteKey)
    }
    const snapshot = await query.get()
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    console.error('[ProfileQA API] GET error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בקריאת נתונים' }, { status: 500 })
  }
}

// POST — save new facts from form filler
export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const { facts, businessId } = await request.json() as {
      facts: { question: string; answer: string; answerType: string; tags?: string[]; siteKey?: string }[]
      businessId?: number
    }

    if (!Array.isArray(facts) || facts.length === 0) {
      return NextResponse.json({ success: false, error: 'facts array required' }, { status: 400 })
    }

    const firestore = getAdminFirestore()
    const bid = businessId || 1
    const now = new Date().toISOString()
    const ids: string[] = []

    for (const fact of facts) {
      // Dedup: check if a fact with the same question (and siteKey if present) already exists
      let query: FirebaseFirestore.Query = firestore.collection(COLLECTION)
        .where('uid', '==', uid)
        .where('businessId', '==', bid)
        .where('question', '==', fact.question)

      if (fact.siteKey) {
        query = query.where('siteKey', '==', fact.siteKey)
      }

      const existing = await query.limit(1).get()

      if (!existing.empty) {
        // Update existing fact instead of creating a duplicate
        const docRef = existing.docs[0].ref
        await docRef.update({
          answer: fact.answer,
          answerType: fact.answerType || 'word',
          tags: fact.tags || [],
          ...(fact.siteKey && { siteKey: fact.siteKey }),
          updatedAt: now,
        })
        ids.push(docRef.id)
      } else {
        const docRef = await firestore.collection(COLLECTION).add({
          uid,
          businessId: bid,
          question: fact.question,
          answerType: fact.answerType || 'word',
          isArray: false,
          answer: fact.answer,
          tags: fact.tags || [],
          ...(fact.siteKey && { siteKey: fact.siteKey }),
          createdAt: now,
          updatedAt: now,
        })
        ids.push(docRef.id)
      }
    }

    return NextResponse.json({ success: true, ids })
  } catch (err: unknown) {
    console.error('[ProfileQA API] POST error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בשמירת נתונים' }, { status: 500 })
  }
}

// PUT — update an existing ProfileQA entry
export async function PUT(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const { id, ...updates } = await request.json()

    if (!id) {
      return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
    }

    const firestore = getAdminFirestore()
    const docRef = firestore.collection(COLLECTION).doc(id)
    const doc = await docRef.get()

    if (!doc.exists || doc.data()?.uid !== uid) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    await docRef.update({
      ...updates,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[ProfileQA API] PUT error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בעדכון נתונים' }, { status: 500 })
  }
}

// DELETE — delete a ProfileQA entry
export async function DELETE(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
    }

    const firestore = getAdminFirestore()
    const docRef = firestore.collection(COLLECTION).doc(id)
    const doc = await docRef.get()

    if (!doc.exists || doc.data()?.uid !== uid) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    await docRef.delete()
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[ProfileQA API] DELETE error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה במחיקת נתונים' }, { status: 500 })
  }
}
