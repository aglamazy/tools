/**
 * Firebase Admin SDK Configuration
 * Server-side only - used in API routes for privileged operations like setting custom claims
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let adminApp: App | null = null
let adminAuth: Auth | null = null
let adminFirestore: Firestore | null = null

function getServiceAccountCredentials() {
  // Check for service account JSON string (preferred for production)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (serviceAccountJson) {
    try {
      return JSON.parse(serviceAccountJson)
    } catch (e) {
      console.error('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON')
    }
  }

  // Fallback to individual env vars
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey,
    }
  }

  return null
}

export function isAdminConfigured(): boolean {
  return getServiceAccountCredentials() !== null
}

function getAdminApp(): App {
  if (adminApp) return adminApp

  const existingApps = getApps()
  if (existingApps.length > 0) {
    adminApp = existingApps[0]
    return adminApp
  }

  const credentials = getServiceAccountCredentials()
  if (!credentials) {
    throw new Error('Firebase Admin SDK credentials not configured')
  }

  adminApp = initializeApp({
    credential: cert(credentials),
    projectId: credentials.projectId,
  })

  return adminApp
}

export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getAdminApp())
  }
  return adminAuth
}

export function getAdminFirestore(): Firestore {
  if (!adminFirestore) {
    adminFirestore = getFirestore(getAdminApp())
  }
  return adminFirestore
}

/**
 * Set custom claims on a user (e.g., householdId)
 * Merges with existing claims to avoid wiping other data
 */
export async function setUserClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
  const auth = getAdminAuth()
  const user = await auth.getUser(uid)
  const existingClaims = user.customClaims || {}
  await auth.setCustomUserClaims(uid, { ...existingClaims, ...claims })
}

/**
 * Get user's custom claims
 */
export async function getUserClaims(uid: string): Promise<Record<string, unknown>> {
  const auth = getAdminAuth()
  const user = await auth.getUser(uid)
  return user.customClaims || {}
}

/**
 * Verify ID token from client and return decoded token
 */
export async function verifyIdToken(idToken: string) {
  const auth = getAdminAuth()
  return auth.verifyIdToken(idToken)
}
