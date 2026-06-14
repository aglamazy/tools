/**
 * Poll backup.enc + verify.enc for a shared business, log size + generation
 * whenever it changes. Stops on Ctrl+C or after --max-minutes (default 30).
 *
 * Usage:
 *   npx tsx scripts/watch-shared-backup.ts <businessSyncId> [--max-minutes N]
 */

import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      let val = match[2].trim()
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1)
      }
      if (!process.env[match[1].trim()]) process.env[match[1].trim()] = val
    }
  }
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
})

const businessSyncId = process.argv[2]
const maxMinutesArg = process.argv.indexOf('--max-minutes')
const MAX_MINUTES = maxMinutesArg >= 0 ? Number(process.argv[maxMinutesArg + 1]) : 30
if (!businessSyncId) {
  console.error('Usage: watch-shared-backup.ts <businessSyncId> [--max-minutes N]')
  process.exit(1)
}

const bucket = admin.storage().bucket()
const prefix = `backups/shared/${businessSyncId}/`

let lastGen: string | null = null
let lastSize: number | null = null
const startedAt = Date.now()

async function poll() {
  try {
    const [files] = await bucket.getFiles({ prefix })
    const backupFile = files.find(f => f.name.endsWith('/backup.enc'))
    if (!backupFile) {
      console.log(`[${new Date().toISOString()}] backup.enc not present yet`)
      return
    }
    const [meta] = await backupFile.getMetadata()
    const gen = String(meta.generation)
    const size = Number(meta.size)
    if (gen !== lastGen) {
      const delta = lastSize !== null ? ` (${size - lastSize >= 0 ? '+' : ''}${size - lastSize}B vs last)` : ''
      console.log(`[${new Date().toISOString()}] backup.enc: size=${size}B${delta}  gen=${gen}  updated=${meta.updated}`)
      lastGen = gen
      lastSize = size
    }
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] poll error:`, err.message)
  }
}

async function loop() {
  console.log(`Watching backups/shared/${businessSyncId}/backup.enc — Ctrl+C to stop, auto-stop after ${MAX_MINUTES}min`)
  await poll()
  const interval = setInterval(async () => {
    if (Date.now() - startedAt > MAX_MINUTES * 60 * 1000) {
      console.log(`[${new Date().toISOString()}] max-minutes reached — stopping.`)
      clearInterval(interval)
      process.exit(0)
    }
    await poll()
  }, 15_000)
}

void loop()
