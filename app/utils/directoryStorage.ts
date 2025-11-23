'use client'

// Helper utilities to persist and reuse FileSystemDirectoryHandle across pages.
// IndexedDB is used because FileSystem handles can't be stringified into localStorage.

const DB_NAME = 'finance-fs-handles'
const STORE_NAME = 'handles'
const DIR_KEY = 'saved-dir'
const META_KEY = 'finance-saved-dir-meta'

type PermissionMode = 'read' | 'readwrite'

type DirectoryMeta = {
  name: string
  savedAt: string
}

const openHandleDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
  })
}

export const persistDirectoryHandle = async (handle: FileSystemDirectoryHandle) => {
  if (typeof window === 'undefined') return

  const db = await openHandleDB()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(handle, DIR_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Failed to store directory handle'))
  }).finally(() => db.close())

  const meta: DirectoryMeta = {
    name: handle.name,
    savedAt: new Date().toISOString(),
  }
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

export const loadDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  if (typeof window === 'undefined') return null

  try {
    const db = await openHandleDB()

    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(DIR_KEY)

      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) || null)
      request.onerror = () => reject(request.error || new Error('Failed to load directory handle'))
    })

    db.close()
    return handle
  } catch (err) {
    console.error('Error loading directory handle:', err)
    return null
  }
}

export const clearDirectoryHandle = async () => {
  if (typeof window === 'undefined') return

  try {
    const db = await openHandleDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(DIR_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('Failed to clear directory handle'))
    })
    db.close()
  } catch (err) {
    console.error('Error clearing directory handle:', err)
  }

  localStorage.removeItem(META_KEY)
}

export const requestDirectoryPermission = async (handle: FileSystemDirectoryHandle, mode: PermissionMode = 'read') => {
  if (!handle || !handle.queryPermission) return false

  const current = await handle.queryPermission({ mode })
  if (current === 'granted') return true
  if (current === 'denied') return false

  const result = await handle.requestPermission({ mode })
  return result === 'granted'
}

export const getDirectoryMeta = (): DirectoryMeta | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DirectoryMeta
  } catch {
    return null
  }
}
