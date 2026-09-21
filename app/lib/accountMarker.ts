/**
 * Account-deleted markers (aglamazo#411, docs/delete-account.md).
 *
 * A marker is written BEFORE anything is deleted and says only "this account
 * was deleted, when" — an id, a kind and timestamps, no user data. It is what
 * makes a deletion stick: Storage rules and the API guard refuse a stale
 * client that would otherwise re-upload its local copy.
 *
 * Firestore: deletedAccounts/{kind}_{id}, Admin-SDK writes only.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

export const DELETED_ACCOUNTS = 'deletedAccounts'
/** Markers are kept at least this long. Purged by a Firestore TTL policy on `purgeAfter`. */
export const MARKER_RETENTION_DAYS = 90

export type MarkerKind = 'user' | 'household' | 'business'

export type AccountRefs = { uid?: string; householdId?: string }

export type AccountMarkerStatus = { deleted: false } | { deleted: true; deletedAt: string }

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

/** Ids come from callers (the public status route) — refuse anything that could alter the doc path. */
export function isValidRefId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

export function markerKey(kind: MarkerKind, id: string): string {
  if (!isValidRefId(id)) throw new Error(`invalid id for ${kind} marker`)
  return `${kind}_${id}`
}

export function buildMarker(kind: MarkerKind, id: string, variant: string, now: Date) {
  return {
    kind,
    id,
    variant,
    deletedAt: now.toISOString(),
    purgeAfter: new Date(now.getTime() + MARKER_RETENTION_DAYS * 24 * 60 * 60 * 1000),
  }
}

/** Idempotent: a marker that already exists keeps its original deletedAt. */
export async function writeMarker(
  firestore: Firestore,
  kind: MarkerKind,
  id: string,
  variant: string,
  now: Date,
): Promise<void> {
  const ref = firestore.collection(DELETED_ACCOUNTS).doc(markerKey(kind, id))
  const existing = await ref.get()
  if (existing.exists) return
  await ref.set(buildMarker(kind, id, variant, now))
}

/** Has this uid or household been deleted? Invalid ids are treated as "no marker" — they cannot have one. */
export async function findAccountMarker(refs: AccountRefs): Promise<AccountMarkerStatus> {
  const firestore = getAdminFirestore()
  const keys: string[] = []
  if (isValidRefId(refs.uid)) keys.push(markerKey('user', refs.uid))
  if (isValidRefId(refs.householdId)) keys.push(markerKey('household', refs.householdId))
  if (keys.length === 0) return { deleted: false }

  const snaps = await firestore.getAll(
    ...keys.map((key) => firestore.collection(DELETED_ACCOUNTS).doc(key)),
  )
  const hit = snaps.find((snap) => snap.exists)
  if (!hit) return { deleted: false }
  const deletedAt = hit.data()?.deletedAt
  return { deleted: true, deletedAt: typeof deletedAt === 'string' ? deletedAt : '' }
}
