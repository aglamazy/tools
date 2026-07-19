# mypips.app — Capture Firebase Refresh Token

One-time capture of the Firebase refresh token for mypips.app (plantonic-eco project).
This must be done once by Yaakov (supervised interactive Google login).

## Why this is needed
mypips.app offers only Google sign-in — no email/password login.
The Firebase refresh token derived from that Google login can mint fresh
ID tokens indefinitely via `securetoken.googleapis.com`, so Saliko can
place orders unattended without repeating the Google consent screen.

## Steps

1. Open https://mypips.app/mashtelatharoe in Chrome while logged in to
   yaakov.aglamaz@gmail.com.

2. Open Chrome DevTools → Network tab → clear the log.

3. If already logged in, click "Sign out" and sign in again via Google.
   (We need the fresh signInWithIdp or token exchange in the network log.)

4. After login completes, filter the Network log for `securetoken.googleapis.com/v1/token`.
   Click the request and look at the **Response** tab. Copy the `refresh_token` value.

   Alternatively filter for `identitytoolkit.googleapis.com/v1/accounts:signInWithIdp`
   and copy the `refreshToken` field from its response body.

5. Save the token to Buddy secrets:
   ```bash
   echo -n 'PASTE_TOKEN_HERE' > ~/develop/Buddy/secrets/mypips-refresh-token
   ```

6. Add it to .env.local:
   ```
   MYPIPS_REFRESH_TOKEN=PASTE_TOKEN_HERE
   ```
   (No quotes, no trailing newline in the value.)

7. Run the verification script to confirm everything works:
   ```bash
   npx tsx scripts/mypips-verify-auth.ts
   ```
   Expected output: "Token exchange and account verification: PASS"

## After first successful verification
The auth client auto-rotates the token on every exchange and persists the
latest version to Aglamazo's Firestore at `_salikoAuth/mypips`.
The MYPIPS_REFRESH_TOKEN env var only needs to be set once; Firestore
takes over from there.

## Known values (confirmed 2026-07-13)
- Firebase project: `plantonic-eco`
- Firebase Web API key: `AIzaSyB_TlgEShaTgAEV9mulKZAjveQgDbO4bGg`
- Household Firebase uid (localId): `GnUkCt101SWCXYj9V7uMsX3LPFG3`
- Account email: yaakov.aglamaz@gmail.com
