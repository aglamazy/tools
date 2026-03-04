import { NextResponse } from 'next/server'

const EXTENSION_VERSION = '1.0.0'

export async function GET() {
  return NextResponse.json({
    version: EXTENSION_VERSION,
    name: 'Aglamaz Form Assistant',
  })
}
