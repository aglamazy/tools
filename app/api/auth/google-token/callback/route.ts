// PUBLIC ROUTE — OAuth callback endpoint
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/auth/google-token/callback
 *
 * Receives the authorization code from Google's OAuth redirect.
 * Returns an HTML page that posts the code to the opener window
 * via postMessage and closes itself.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  const html = `<!DOCTYPE html>
<html>
<head><title>Google Auth</title></head>
<body>
<script>
  (function() {
    var error = ${JSON.stringify(error || '')};
    var code = ${JSON.stringify(code || '')};

    if (window.opener) {
      window.opener.postMessage(
        { type: 'google-oauth-callback', code: code, error: error },
        window.location.origin
      );
    }
    window.close();
  })();
</script>
<p>Completing authentication... this window should close automatically.</p>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
