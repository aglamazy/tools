// PUBLIC ROUTE — browser extension download
import { NextResponse } from 'next/server'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'

export async function GET() {
  try {
    const dir = join(process.cwd(), 'public', 'extension')
    const files = await readdir(dir)
    const zip = files.find(f => f.startsWith('aglamaz-form-assistant-') && f.endsWith('.zip'))

    if (!zip) {
      return NextResponse.json({ error: 'Extension file not found' }, { status: 404 })
    }

    const fileBuffer = await readFile(join(dir, zip))

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zip}"`,
        'Content-Length': String(fileBuffer.length),
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Extension file not found' },
      { status: 404 }
    )
  }
}
