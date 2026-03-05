# PIN-based sync password unlock

## Problem
User must enter the full encryption password every session to sync data.
We want zero-knowledge (admin can't see user data) without the friction.

## Solution
Store the encryption password locally, protected by a short PIN.

## Flow
1. **Setup:** User sets encryption password + chooses a 4-6 digit PIN
2. **Storage:** Password encrypted with PIN-derived key (PBKDF2), stored in localStorage
3. **Daily use:** User enters PIN → password unlocked → sync works
4. **Brute-force protection:** 5 wrong attempts → wipe cached password, require full password
5. **New device:** User must enter full password again + set a new PIN

## Security properties
- Encryption password never leaves the client
- Admin/server has zero access to user data
- PIN only protects locally-cached password (device already has IndexedDB access)
- Follows same pattern as banking apps, 1Password, Signal

## Future enhancements
- Biometric unlock via WebAuthn PRF extension (Chrome 116+)
- Passkey-based unlock as fallback-free alternative
