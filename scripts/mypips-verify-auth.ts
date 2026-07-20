/**
 * Verify mypips.app Firebase auth client.
 *
 * Exchanges the stored refresh token for a fresh ID token, then:
 *   1. Verifies the token via identitytoolkit accounts:lookup (confirms localId match)
 *   2. Makes an authenticated Firestore REST read to the user's cart document
 *
 * Usage: npx tsx scripts/mypips-verify-auth.ts
 *
 * Prerequisite: MYPIPS_REFRESH_TOKEN set in .env.local (see scripts/mypips-capture-token.md)
 */
import { loadEnv } from './_load-env'
loadEnv()

const FIREBASE_API_KEY = process.env.MYPIPS_FIREBASE_API_KEY
if (!FIREBASE_API_KEY) {
  console.error('ERROR: MYPIPS_FIREBASE_API_KEY not set in .env.local')
  process.exit(1)
}
const MYPIPS_PROJECT_ID = 'plantonic-eco'
const MYPIPS_LOCAL_ID = 'GnUkCt101SWCXYj9V7uMsX3LPFG3'
const MYPIPS_FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${MYPIPS_PROJECT_ID}/databases/(default)/documents`

async function main() {
  console.log('--- mypips auth verification ---')
  console.log(`expected localId: ${MYPIPS_LOCAL_ID}`)

  // Step 1: exchange refresh token for ID token
  const refreshToken = process.env.MYPIPS_REFRESH_TOKEN
  if (!refreshToken) {
    console.error(
      'ERROR: MYPIPS_REFRESH_TOKEN not set in .env.local\n' +
      'See scripts/mypips-capture-token.md for the one-time token capture procedure.',
    )
    process.exit(1)
  }

  console.log('\n[1] Exchanging refresh token for ID token via securetoken.googleapis.com...')
  const tokenResp = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    },
  )
  if (!tokenResp.ok) {
    const body = await tokenResp.text()
    console.error(`ERROR: token refresh failed HTTP ${tokenResp.status}: ${body}`)
    process.exit(1)
  }
  const tokenData = await tokenResp.json() as {
    id_token: string
    refresh_token: string
    user_id: string
  }
  const idToken = tokenData.id_token
  console.log(`    user_id from response: ${tokenData.user_id}`)
  console.log(`    ID token (first 40 chars): ${idToken.slice(0, 40)}...`)
  if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken) {
    console.log('    refresh token was rotated (Firebase issued a new one)')
    console.log('    update MYPIPS_REFRESH_TOKEN in .env.local and Buddy secrets with the new value:')
    console.log(`    ${tokenData.refresh_token.slice(0, 30)}...`)
  }

  // Step 2: verify token and confirm localId
  console.log('\n[2] Verifying token via identitytoolkit accounts:lookup...')
  const lookupResp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  )
  if (!lookupResp.ok) {
    console.error('ERROR: accounts:lookup failed:', await lookupResp.text())
    process.exit(1)
  }
  const lookupData = await lookupResp.json() as { users?: Array<{ localId: string; email: string }> }
  const user = lookupData.users?.[0]
  if (!user) {
    console.error('ERROR: no user in lookup response:', JSON.stringify(lookupData))
    process.exit(1)
  }
  console.log(`    localId: ${user.localId}`)
  console.log(`    email:   ${user.email}`)
  if (user.localId !== MYPIPS_LOCAL_ID) {
    console.error(`    MISMATCH: expected ${MYPIPS_LOCAL_ID}, got ${user.localId}`)
    process.exit(1)
  }
  console.log('    localId matches expected value ✓')

  // Step 3: authenticated Firestore REST read — try known cart paths
  console.log('\n[3] Attempting authenticated Firestore REST reads (plantonic-eco)...')
  const cartPaths = [
    `carts/${MYPIPS_LOCAL_ID}`,
    `users/${MYPIPS_LOCAL_ID}`,
    `users/${MYPIPS_LOCAL_ID}/cart`,
  ]
  for (const path of cartPaths) {
    const url = `${MYPIPS_FIRESTORE_BASE}/${path}`
    const fsResp = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    console.log(`    GET ${path} → HTTP ${fsResp.status}`)
    if (fsResp.ok) {
      const doc = await fsResp.json() as { fields?: Record<string, { stringValue?: string }> }
      const ownerId = doc.fields?.ownerId?.stringValue
      if (ownerId) {
        console.log(`    ownerId: ${ownerId}`)
        console.log(`    ownerId === localId: ${ownerId === MYPIPS_LOCAL_ID}`)
      } else {
        console.log(`    fields: ${JSON.stringify(Object.keys(doc.fields ?? {}))}`)
      }
    }
  }

  console.log('\n--- verification complete ---')
  console.log('Token exchange and account identity: PASS')
  process.exit(0)
}

main().catch(err => {
  console.error('\n[ERROR]', err instanceof Error ? err.message : err)
  process.exit(1)
})
