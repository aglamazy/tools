/**
 * Saliko Tier-3 server-credentials consent state.
 *
 * Tier 3 means: the user has explicitly authorised Saliko to keep an
 * encrypted copy of their store credentials on our server, so the unattended
 * cron path can log in on their behalf when they're not online. Without this
 * consent the credential lives only in the user's browser (Dexie, Tier 2)
 * and cron cannot fire.
 *
 * Consent shape (Firestore `users/{uid}.serverCredsConsent`):
 *   { acceptedAt: ISO string, policyVersion: '2026-05-16-saliko-privacy-v1' }
 * Absence of the field = no consent.
 *
 * Policy versioning: the consent record pins the version of the policy the
 * user agreed to (see `app/saliko/privacy/privacyContent.ts`). If the policy
 * version later changes, downstream gates should re-prompt before continuing
 * to write server-side credentials.
 *
 * TODO: when the privacy policy version bumps, add a re-prompt flow that
 * compares the live `SALIKO_PRIVACY_VERSION` against the consent's
 * `policyVersion` and revokes Tier 3 on mismatch (or surfaces a re-consent
 * modal). Out of scope for the initial Tier 2/3 rollout.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { SALIKO_PRIVACY_VERSION } from '@/app/saliko/privacy/privacyContent'

export interface ServerCredsConsent {
  acceptedAt: string
  policyVersion: string
}

/** Read the consent record for a user. Returns null if no consent on file. */
export async function getServerCredsConsent(uid: string): Promise<ServerCredsConsent | null> {
  const doc = await getAdminFirestore().collection('users').doc(uid).get()
  if (!doc.exists) return null
  const data = doc.data()
  const consent = data?.serverCredsConsent
  if (!consent || typeof consent.acceptedAt !== 'string' || typeof consent.policyVersion !== 'string') {
    return null
  }
  return { acceptedAt: consent.acceptedAt, policyVersion: consent.policyVersion }
}

/** True iff the user has consent on file pinned to the *current* policy version. */
export async function hasCurrentServerCredsConsent(uid: string): Promise<boolean> {
  const consent = await getServerCredsConsent(uid)
  return !!consent && consent.policyVersion === SALIKO_PRIVACY_VERSION
}

/** Grant consent for the *current* policy version. Overwrites any prior consent. */
export async function grantServerCredsConsent(uid: string): Promise<ServerCredsConsent> {
  const consent: ServerCredsConsent = {
    acceptedAt: new Date().toISOString(),
    policyVersion: SALIKO_PRIVACY_VERSION,
  }
  await getAdminFirestore().collection('users').doc(uid).set(
    { serverCredsConsent: consent },
    { merge: true },
  )
  console.log(`[ConsentService] grantServerCredsConsent uid=${uid} policy=${consent.policyVersion}`)
  return consent
}

/**
 * Revoke consent AND delete all server-side encrypted credential copies.
 *
 * Tier 3 → 2 transition is "policy says move down also deletes the data."
 * We delete:
 *   - `groceries/{uid}/private/credentials` (Shufersal)
 *   - `groceries/{uid}/stores/{retalixStoreId}/private/credentials` (every
 *     Rexail-powered chain that has a doc — we just enumerate the
 *     subcollection so we don't need a registry lookup here)
 *
 * Dexie copies in the user's browser are NOT touched; the user can keep
 * using Saliko interactively, the only thing that goes away is cron.
 */
export async function revokeServerCredsConsent(uid: string): Promise<{ deleted: string[]; failed: { path: string; error: string }[] }> {
  const firestore = getAdminFirestore()
  const deleted: string[] = []
  const failed: { path: string; error: string }[] = []

  // 1. Shufersal cred doc.
  try {
    const shuRef = firestore.collection('groceries').doc(uid).collection('private').doc('credentials')
    const shuDoc = await shuRef.get()
    if (shuDoc.exists) {
      await shuRef.delete()
      deleted.push(shuRef.path)
    }
  } catch (err) {
    failed.push({ path: `groceries/${uid}/private/credentials`, error: err instanceof Error ? err.message : String(err) })
  }

  // 2. Rexail per-store cred docs. Enumerate the `stores` subcollection.
  try {
    const stores = await firestore.collection('groceries').doc(uid).collection('stores').listDocuments()
    for (const storeDoc of stores) {
      const credRef = storeDoc.collection('private').doc('credentials')
      try {
        const exists = await credRef.get()
        if (exists.exists) {
          await credRef.delete()
          deleted.push(credRef.path)
        }
      } catch (err) {
        failed.push({ path: credRef.path, error: err instanceof Error ? err.message : String(err) })
      }
    }
  } catch (err) {
    failed.push({ path: `groceries/${uid}/stores`, error: err instanceof Error ? err.message : String(err) })
  }

  // 3. Clear the consent flag itself.
  try {
    const { FieldValue } = await import('firebase-admin/firestore')
    await firestore.collection('users').doc(uid).set(
      { serverCredsConsent: FieldValue.delete() },
      { merge: true },
    )
  } catch (err) {
    failed.push({ path: `users/${uid}.serverCredsConsent`, error: err instanceof Error ? err.message : String(err) })
  }

  console.log(`[ConsentService] revokeServerCredsConsent uid=${uid} deleted=${deleted.length} failed=${failed.length}`)
  return { deleted, failed }
}

/** Sentinel error thrown when a Tier-3-only operation runs without consent. */
export class NoTier3ConsentError extends Error {
  constructor(message = 'NO_TIER3_CONSENT') {
    super(message)
    this.name = 'NoTier3ConsentError'
  }
}
