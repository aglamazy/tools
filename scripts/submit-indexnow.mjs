#!/usr/bin/env node
/**
 * Submit public pages to IndexNow (Bing, Yandex, etc.) after deployment.
 * Run this after a successful deploy: node scripts/submit-indexnow.mjs
 *
 * Skips silently in preview/dev environments and on non-production Vercel deploys
 * so postbuild stays a no-op outside of production builds.
 */

import fs from 'node:fs'
import path from 'node:path'

const INDEXNOW_KEY = 'a8c4f6e12b5d9047c3e8f61b4d2a5c9e'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aglamazo.com'

// Static fallback if the generated sitemap can't be read. Intentionally excludes
// noindex routes (e.g. /form-filler) — see app/sitemap.ts NOINDEX_ROUTES.
const FALLBACK_PATHS = [
  '/',
  '/about',
  '/contact',
  '/demo-form',
  '/guide',
  '/machshevon',
  '/madrich',
  '/pricing',
  '/template',
  '/terms',
]

/**
 * Derive the URL list from the sitemap that Next just prerendered, so IndexNow
 * always mirrors the real public route set (content hubs + their children
 * included) instead of drifting from a hand-maintained list. Falls back to the
 * static list above if the sitemap body isn't on disk.
 */
function resolveUrls() {
  const sitemapBody = path.join(process.cwd(), '.next', 'server', 'app', 'sitemap.xml.body')
  try {
    const xml = fs.readFileSync(sitemapBody, 'utf8')
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
    if (locs.length) return [...new Set(locs)]
  } catch {
    // fall through to the static list
  }
  return FALLBACK_PATHS.map((p) => `${SITE_URL}${p}`)
}

const URLS = resolveUrls()

const isVercel = process.env.VERCEL === '1'
const vercelEnv = process.env.VERCEL_ENV
const skip = isVercel && vercelEnv && vercelEnv !== 'production'

if (skip) {
  console.log(`IndexNow: skipping (VERCEL_ENV=${vercelEnv})`)
  process.exit(0)
}

async function submitIndexNow() {
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
    // Don't fail the build over a remote indexer hiccup — log and move on.
    console.warn(`IndexNow returned HTTP ${res.status}: ${text}`)
  }
}

async function submitYandexSitemap() {
  // Yandex still supports the legacy sitemap-ping endpoint. Google retired
  // theirs in 2023 and Bing followed suit, but Yandex's pingSitemap returns
  // 200 and triggers a re-crawl. IndexNow already covers most engines, but
  // this is a cheap belt-and-suspenders signal for a separate index.
  const sitemapUrl = `${SITE_URL}/sitemap.xml`
  const submitUrl = `https://webmaster.yandex.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
  try {
    const res = await fetch(submitUrl, { method: 'GET' })
    console.log(`Yandex sitemap ping HTTP ${res.status} for ${sitemapUrl}`)
  } catch (err) {
    console.warn('Yandex sitemap ping failed:', err.message)
  }
}

async function run() {
  await Promise.allSettled([submitIndexNow(), submitYandexSitemap()])
}

run().catch((err) => {
  // Postbuild network failures must never break the deploy.
  console.warn('Search-engine submission failed:', err.message)
})
