// One-off: clear tcAcceptedAt on users/local-auth-user in saliko-prod so a fresh
// first-visit flow can be tested. Idempotent.
const fs = require('fs')

const envFile = fs.readFileSync('/home/yaakov/develop/Aglamaz/Aglamazo/.env.saliko', 'utf-8')
const match = envFile.match(/^FIREBASE_SERVICE_ACCOUNT_JSON=(.+)$/m)
if (!match) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not found in .env.saliko')
  process.exit(1)
}
const raw = match[1].replace(/^'|'$/g, '').replace(/^"|"$/g, '')
const serviceAccount = JSON.parse(raw)

const admin = require('/home/yaakov/develop/Aglamaz/Aglamazo/node_modules/firebase-admin')
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

admin.firestore().collection('users').doc('local-auth-user').update({
  tcAcceptedAt: admin.firestore.FieldValue.delete(),
}).then(() => {
  console.log('Cleared tcAcceptedAt on users/local-auth-user (saliko-prod)')
  process.exit(0)
}).catch(err => {
  console.error('Failed:', err.message)
  process.exit(1)
})
