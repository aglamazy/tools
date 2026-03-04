# Local Testing User

## Purpose

Bypass Firebase Auth on Vercel preview deployments where the preview URL isn't a registered Firebase Auth domain. Provides a real Firebase session (via custom token) without requiring Google OAuth.

## Default Credentials

| Field    | Value    |
|----------|----------|
| Username | `root`   |
| Password | `ABC123` |

These are seed-only defaults. On first successful login, they are written to the `config/auth` document in Firestore. Subsequent logins validate against that document.

## How It Works

1. User submits username/password in the "משתמש" tab of the auth modal
2. `POST /api/auth/local` validates credentials against `config/auth` in Firestore (Admin SDK)
3. On first run (no document), seeds `config/auth` with the defaults above
4. On success, mints a Firebase custom token for the UID `local-auth-user`
5. Client calls `signInWithCustomToken` → real Firebase session
6. `updateProfile` sets `displayName` to the username so the avatar shows the correct initial

The `local-auth-user` document in the `users` collection is created/updated with `tier: 'owner'`.

## Production Guards

| Layer     | Guard                                                                 |
|-----------|-----------------------------------------------------------------------|
| UI tab    | Hidden when `NEXT_PUBLIC_SEGMENT=production`                          |
| API route | Returns 403 when `VERCEL_ENV=production`                              |

Both guards must be set in the production Vercel environment variables.

## Changing Credentials

Update the `config/auth` document in Firestore directly (Firebase Console or Admin SDK):

```json
{
  "username": "new-username",
  "password": "new-password"
}
```

No app restart needed — credentials are read per-request.
