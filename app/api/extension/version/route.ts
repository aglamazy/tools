import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET() {
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
