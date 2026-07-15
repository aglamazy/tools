// PUBLIC ROUTE — browser extension version check
import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { withServiceCall } from '@/app/lib/observe'

async function GETHandler() {
  try {
    const manifestPath = join(process.cwd(), 'extension', 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

    return NextResponse.json({
      version: manifest.version,
      name: manifest.name,
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to read extension manifest' },
      { status: 500 }
    )
  }
}

export const GET = withServiceCall(GETHandler)
