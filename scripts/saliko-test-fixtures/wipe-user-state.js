// Wipe the X@gmail.com / Y123 cred + Tier 3 consent that B02 turn 1 left
// on saliko-prod, so the B re-run starts from a clean Tier 2 state.
const fs = require('fs')
const envFile = fs.readFileSync('/home/yaakov/develop/Aglamaz/Aglamazo/.env.saliko', 'utf-8')
const serviceAccount = JSON.parse(envFile.match(/^FIREBASE_SERVICE_ACCOUNT_JSON=(.+)$/m)[1].replace(/^['"]|['"]$/g, ''))
const admin = require('/home/yaakov/develop/Aglamaz/Aglamazo/node_modules/firebase-admin')
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const db = admin.firestore()

;(async () => {
  // 1. Delete the Shufersal cred doc
  await db.collection('groceries').doc('local-auth-user')
    .collection('private').doc('credentials').delete()
  console.log('Deleted groceries/local-auth-user/private/credentials')

  // 2. Revoke Tier 3 consent
  await db.collection('users').doc('local-auth-user')
    .update({ serverCredsConsent: admin.firestore.FieldValue.delete() })
  console.log('Cleared serverCredsConsent on users/local-auth-user')

  // 3. Also clear tcAcceptedAt so the B-rerun starts at /app/terms again
  await db.collection('users').doc('local-auth-user')
    .update({ tcAcceptedAt: admin.firestore.FieldValue.delete() })
  console.log('Cleared tcAcceptedAt on users/local-auth-user')

  // 4. Same for the Google account, in case any test routes through it
  await db.collection('users').doc('eCFSo4Xm3vScwliNpYsDiZyH5963')
    .update({
      serverCredsConsent: admin.firestore.FieldValue.delete(),
      tcAcceptedAt: admin.firestore.FieldValue.delete(),
    })
  console.log('Cleared serverCredsConsent + tcAcceptedAt on yaakov.aglamaz@gmail.com')

  // 5. Also wipe activeStores meta — since B02 added 'shufersal'
  await db.collection('groceries').doc('local-auth-user')
    .collection('stores').doc('_meta').delete().catch(() => null)
  console.log('Cleared stores/_meta on local-auth-user (if existed)')

  process.exit(0)
})().catch(err => { console.error('Failed:', err.message); process.exit(1) })
