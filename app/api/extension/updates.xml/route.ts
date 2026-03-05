import { NextResponse } from 'next/server'

const EXTENSION_VERSION = '1.0.0'
const DOWNLOAD_URL = 'https://tools.aglamaz.com/api/extension/download'

export async function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="aglamaz-form-assistant">
    <updatecheck crid="aglamaz-form-assistant" version="${EXTENSION_VERSION}"
      url="${DOWNLOAD_URL}" />
  </app>
</gupdate>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  })
}
