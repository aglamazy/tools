import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'extension', 'aglamaz-form-assistant.zip')
    const fileBuffer = await readFile(filePath)

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="aglamaz-form-assistant.zip"',
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
