#!/usr/bin/env node
/**
 * Submit public pages to IndexNow (Bing, Yandex, etc.) after deployment.
 * Run this after a successful deploy: node scripts/submit-indexnow.mjs
 */

const INDEXNOW_KEY = 'a8c4f6e12b5d9047c3e8f61b4d2a5c9e'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aglamazo.com'

const URLS = [
  '/',
  '/about',
  '/contact',
  '/demo-form',
  '/form-filler',
  '/guide',
  '/pricing',
  '/terms',
].map((path) => `${SITE_URL}${path}`)

async function submit() {
  const host = new URL(SITE_URL).hostname
  const body = {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: URLS,
  }

  console.log('Submitting URLs to IndexNow:', URLS)

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })

  if (res.ok || res.status === 202) {
    console.log(`IndexNow accepted (HTTP ${res.status})`)
  } else {
    const text = await res.text().catch(() => '')
    console.error(`IndexNow returned HTTP ${res.status}: ${text}`)
    process.exit(1)
  }
}

submit().catch((err) => {
  console.error('IndexNow submission failed:', err.message)
  process.exit(1)
})
