// Required at import time by app/config.ts (pulled in transitively via
// authStore -> userTierStore) even though these tests never touch routing.
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3100'

import 'fake-indexeddb/auto'
