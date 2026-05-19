// Check if local-auth-user has a Shufersal cred doc in saliko-prod Firestore.
const fs = require('fs')
const envFile = fs.readFileSync('/home/yaakov/develop/Aglamaz/Aglamazo/.env.saliko', 'utf-8')
const serviceAccount = JSON.parse(envFile.match(/^FIREBASE_SERVICE_ACCOUNT_JSON=(.+)$/m)[1].replace(/^['"]|['"]$/g, ''))
const admin = require('/home/yaakov/develop/Aglamaz/Aglamazo/node_modules/firebase-admin')
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

admin.firestore().collection('groceries').doc('local-auth-user')
  .collection('private').doc('credentials').get()
  .then(doc => {
    if (!doc.exists) { console.log('NO Shufersal cred doc'); process.exit(0) }
    const data = doc.data()
    console.log(JSON.stringify({
      email: data.email ? `[${data.email.length} chars, looks ${data.email.startsWith('eyJ') || data.email.length > 64 ? 'encrypted' : 'plaintext'}]` : null,
      password: data.password ? `[${data.password.length} chars, looks ${data.password.length > 32 ? 'encrypted' : 'plaintext'}]` : null,
      verified: data.verified,
    }, null, 2))
    process.exit(0)
  })
  .catch(e => { console.error('Failed:', e.message); process.exit(1) })
