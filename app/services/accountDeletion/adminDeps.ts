import { getAdminAuth, getAdminFirestore, getAdminStorageBucket, setUserClaims } from '@/app/lib/firebaseAdmin'
import { VARIANT } from '@/app/config/variants'
import type { DeletionDeps } from './accountDeletionService'

function isUserNotFound(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'auth/user-not-found'
}

/** The production wiring of the delete job: real Firestore, Storage and Auth. */
export function createAdminDeletionDeps(): DeletionDeps {
  const auth = getAdminAuth()
  return {
    firestore: getAdminFirestore(),
    variant: VARIANT,
    deleteBillingRecords: process.env.ACCOUNT_DELETION_DELETE_BILLING_RECORDS === 'true',
    now: () => new Date(),
    deleteStoragePrefix: async (prefix) => {
      await getAdminStorageBucket().deleteFiles({ prefix })
    },
    getAuthEmail: async (uid) => {
      try {
        return (await auth.getUser(uid)).email ?? null
      } catch (err) {
        if (isUserNotFound(err)) return null
        throw err
      }
    },
    deleteAuthUser: async (uid) => {
      try {
        await auth.deleteUser(uid)
      } catch (err) {
        if (!isUserNotFound(err)) throw err
      }
    },
    getClaims: async (uid) => {
      try {
        return (await auth.getUser(uid)).customClaims ?? {}
      } catch (err) {
        if (isUserNotFound(err)) return null
        throw err
      }
    },
    setClaims: (uid, claims) => setUserClaims(uid, claims),
  }
}
