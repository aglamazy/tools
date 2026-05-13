import * as fs from 'fs'
import * as path from 'path'

export function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local')
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1)
    process.env[m[1].trim()] = v
  }
}
