import { execSync } from 'node:child_process'

// Fleet versioning standard (dasi#3 / aglamazo#315): APP_VERSION is CalVer
// derived at BUILD time — never hand-maintained, so there is nothing to
// forget. APP_COMMIT identifies the exact code. Exposed via /api/health so
// deploy-gate can assert freshness against the running app (state, not a
// build-log line). package.json's version is NOT the freshness signal.
const buildNow = new Date()
const APP_VERSION = `${buildNow.getFullYear() % 100}.${buildNow.getMonth() + 1}.${buildNow.getDate()}-${String(buildNow.getHours()).padStart(2, '0')}${String(buildNow.getMinutes()).padStart(2, '0')}`
const APP_COMMIT = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch (err) {
    // No fallback value by policy — a build that can't identify its commit
    // would make the freshness gate lie.
    throw new Error('APP_COMMIT derivation failed: no VERCEL_GIT_COMMIT_SHA and git rev-parse failed: ' + err)
  }
})()

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    APP_VERSION,
    APP_COMMIT,
  },

  // ~/develop/Aglamaz (the parent dir, Aglamaz-Libs' own repo root) has
  // acquired its own package.json/package-lock.json — Turbopack's
  // multi-lockfile auto-detection was climbing up and picking THAT as the
  // workspace root, resolving deps (e.g. tailwindcss) against the wrong
  // node_modules and failing `next build`. That silently blocked every
  // `git push` on this repo (husky's pre-push build check), stranding
  // commits locally for an unknown stretch (found 2026-07-15, via Hopper's
  // own auto-push-failing alert). Pin the root explicitly so it can't
  // wander again regardless of what shows up one level up.
  turbopack: { root: import.meta.dirname },

  // Per-flavor build dir so `dev` and `dev:saliko` can run in parallel
  // without colliding on .next/dev/lock.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // Mark firebase-admin as external to avoid bundling issues
  serverExternalPackages: ['firebase-admin'],

  async rewrites() {
    return [
      { source: '/he', destination: '/' },
      { source: '/he/:path*', destination: '/:path*' },
    ]
  },

  async headers() {
    const indexableRoutes = ['/', '/about', '/contact', '/demo-form', '/form-filler', '/guide', '/pricing', '/terms']
    return [
      {
        source: '/sitemap.xml',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=3600, must-revalidate' },
          { key: 'Content-Type', value: 'application/xml; charset=utf-8' },
        ],
      },
      {
        source: '/robots.txt',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=3600, must-revalidate' },
        ],
      },
      ...indexableRoutes.map((route) => ({
        source: route,
        headers: [
          { key: 'X-Robots-Tag', value: 'index, follow' },
        ],
      })),
      {
        source: '/app/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig
