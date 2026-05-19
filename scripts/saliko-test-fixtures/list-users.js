// List all users/ docs in saliko-prod with their tcAcceptedAt + tier.
const fs = require('fs')

const envFile = fs.readFileSync('/home/yaakov/develop/Aglamaz/Aglamazo/.env.saliko', 'utf-8')
const match = envFile.match(/^FIREBASE_SERVICE_ACCOUNT_JSON=(.+)$/m)
if (!match) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON not found'); process.exit(1) }
const serviceAccount = JSON.parse(match[1].replace(/^['"]|['"]$/g, ''))

const admin = require('/home/yaakov/develop/Aglamaz/Aglamazo/node_modules/firebase-admin')
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

admin.firestore().collection('users').get().then(async (snap) => {
  const rows = []
  for (const doc of snap.docs) {
    const data = doc.data()
    rows.push({
      uid: doc.id,
      email: data.email || null,
      username: data.username || null,
      tier: data.tier || null,
      tcAcceptedAt: data.tcAcceptedAt || null,
    })
  }
  // Try to enrich with auth records (email from Firebase Auth)
  for (const r of rows) {
    if (r.email) continue
    try {
      const u = await admin.auth().getUser(r.uid)
      r.email = u.email || r.email
      r.displayName = u.displayName || null
      r.providerIds = (u.providerData || []).map(p => p.providerId).join(',') || null
    } catch (e) {
      r.authLookup = 'NOT FOUND'
    }
  }
  console.log(JSON.stringify(rows, null, 2))
  process.exit(0)
}).catch(err => { console.error('Failed:', err.message); process.exit(1) })
