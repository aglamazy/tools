# Proxy API calls to hide client-side API keys

## Problem
`NEXT_PUBLIC_GEMINI_API_KEY` is exposed in the browser bundle. Anyone can extract and abuse it.

## Solution
Move API calls behind Next.js API routes. The key stays server-side only.

## Flow
1. Client calls `/api/gemini` (or similar) with the request payload
2. API route adds the key and forwards to Gemini
3. Key stored as `GEMINI_API_KEY` (no `NEXT_PUBLIC_` prefix) — never sent to browser

## Scope
- Gemini API calls
- Any future third-party API keys (SerpApi, etc.)
