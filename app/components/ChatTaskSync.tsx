'use client'

/**
 * Listens to Firestore userTasks/{uid}/items and syncs to Dexie.
 * Runs silently in the background — no UI.
 */

import { useEffect } from 'react'
import { collection, onSnapshot, doc } from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured } from '@/app/lib/firebase'
import { getUser } from '@/app/stores/authStore'
import { db } from '@/app/db/financeDB'

export default function ChatTaskSync() {
  useEffect(() => {
    if (!isFirebaseConfigured()) return
    const user = getUser()
    if (!user) return

    const firestore = getFirebaseFirestore()
    const col = collection(firestore, 'userTasks', user.uid, 'items')

    const unsub = onSnapshot(col, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const data = change.doc.data()
        const firestoreId = change.doc.id

        if (change.type === 'removed') {
          // Remove from Dexie by firestoreId tag
          const existing = await db.tasks.filter(t => (t as any).firestoreId === firestoreId).first()
          if (existing?.id) await db.tasks.delete(existing.id)
          continue
        }

        const existing = await db.tasks.filter(t => (t as any).firestoreId === firestoreId).first()

        const taskData = {
          title: data.title,
          completed: data.completed ?? false,
          priority: data.priority || 'medium',
          quadrant: data.quadrant || 'do',
          deadline: data.deadline || undefined,
          createdAt: data.createdAt || new Date().toISOString(),
          firestoreId,
        }

        if (existing) {
          await db.tasks.update(existing.id!, taskData)
        } else {
          await db.tasks.add(taskData as any)
        }
      }
    })

    return unsub
  }, [])

  return null
}
