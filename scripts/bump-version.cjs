#!/usr/bin/env node
//
// Org-canonical version bumper — owned by Ant.
// DO NOT EDIT IN PLACE: this file is overwritten on every Ant daily run from
// ~/develop/Ant/config/org-husky/scripts/bump-version.cjs. To change the
// org-wide rule, edit the canonical file and the next sync propagates it.
//
// Scheme: calendar semver `yy.mm.patch` — 26.9.8 = year 2026, month 9, patch 8.
//
// HARD INVARIANT
// --------------
// The version written here is ALWAYS strictly greater than BOTH
//   (a) the version currently committed in package.json, and
//   (b) the highest existing git tag that parses as this scheme.
//
// Publishing a version that looks OLDER than what already shipped is worse
// than a crash: consumers resolving by semver range silently get stale code
// and nothing errors. The previous implementation compared the committed
// version to the calendar for INEQUALITY (parts[0] !== year || parts[1] !==
// month) and reset to <year>.<month>.0 on any mismatch — so a repo whose
// version had run AHEAD of the calendar (parallel branches + the
// merge-higher-version driver push it forward) was silently REGRESSED, e.g.
// 26.9.8 -> 26.8.0 in August, below the existing tag v26.9.8.
//
// So: the calendar only ever moves the version FORWARD. When the
// calendar-derived version would be <= something we already know about, we
// bump the patch off the HIGHEST known version instead. If we still cannot
// produce a strictly greater version, we throw — never emit a lower one.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const lockPath = path.join(root, 'package-lock.json')

const DRY_RUN = process.argv.includes('--dry-run')

// `26.9.8` or `v26.9.8`. Anything else (v1.2, v26.9.8-rc1, release-2024,
// nightly) is NOT this scheme and is not comparable to it.
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)$/

const parseVersion = value => {
  if (typeof value !== 'string') return null
  const m = VERSION_RE.exec(value.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

const fmt = parts => parts.join('.')

const compare = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return 1
    if (a[i] < b[i]) return -1
  }
  return 0
}

// Every tag in the repo, parsed. Tags that do not match the scheme are
// skipped, but reported on stderr — a silently ignored tag is how a
// regression hides. A repo with no tags (fresh package, never published) and
// a non-git checkout both yield an empty list, which is fine: package.json is
// then the only known version.
const readTags = () => {
  let raw
  try {
    raw = execFileSync('git', ['tag', '--list'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return { versions: [], skipped: [], gitAvailable: false }
  }
  const versions = []
  const skipped = []
  for (const line of raw.split('\n')) {
    const tag = line.trim()
    if (!tag) continue
    const parsed = parseVersion(tag)
    if (parsed) versions.push({ tag, parts: parsed })
    else skipped.push(tag)
  }
  return { versions, skipped, gitAvailable: true }
}

/**
 * Compute the next version.
 *
 * @param {number[]} currentParts version from package.json
 * @param {{tag: string, parts: number[]}[]} tagVersions parseable git tags
 * @param {Date} now
 */
const computeNext = (currentParts, tagVersions, now) => {
  const year = now.getFullYear() % 100 // 2026 -> 26
  const month = now.getMonth() + 1 // 1-12
  const calendar = [year, month, 0]

  // Everything we know already exists. package.json is always in this set, so
  // it is never empty even in a repo with zero tags.
  const known = [
    { source: 'package.json', label: fmt(currentParts), parts: currentParts },
    ...tagVersions.map(t => ({ source: 'tag', label: t.tag, parts: t.parts })),
  ]

  const highest = known.reduce((a, b) => (compare(b.parts, a.parts) > 0 ? b : a))

  // The calendar wins ONLY when it is strictly ahead of everything known —
  // that is the month rollover, and the year rollover too (26.12.x -> 27.1.0,
  // since 27 > 26 compares correctly element-wise). Otherwise bump the patch
  // off the highest known version, which is what keeps us above an
  // already-shipped tag.
  const next =
    compare(calendar, highest.parts) > 0
      ? calendar
      : [highest.parts[0], highest.parts[1], highest.parts[2] + 1]

  // Loud assertion. By construction this cannot trip, which is exactly why it
  // is here: if the arithmetic above is ever changed wrongly, this fails the
  // commit instead of publishing a regression.
  for (const k of known) {
    if (compare(next, k.parts) <= 0) {
      throw new Error(
        `[bump-version] refusing to emit ${fmt(next)}: not strictly greater than ` +
          `${k.source} ${k.label}. Fix package.json / tags by hand.`
      )
    }
  }

  return { next, highest, calendar }
}

const updateLockVersion = (lock, newVersion) => {
  lock.version = newVersion
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = newVersion
  }
  return lock
}

const main = () => {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const currentVersion = pkg.version
  const currentParts = parseVersion(currentVersion)
  if (!currentParts) {
    throw new Error(
      `[bump-version] package.json version is not yy.mm.patch: ${JSON.stringify(currentVersion)}`
    )
  }

  const { versions: tagVersions, skipped, gitAvailable } = readTags()
  if (skipped.length) {
    console.error(
      `[bump-version] ignoring ${skipped.length} tag(s) that are not yy.mm.patch: ` +
        skipped.slice(0, 5).join(', ') +
        (skipped.length > 5 ? ', ...' : '')
    )
  }

  const { next, highest, calendar } = computeNext(currentParts, tagVersions, new Date())
  const nextVersion = fmt(next)

  const why =
    compare(calendar, highest.parts) > 0
      ? `calendar roll (${fmt(calendar)})`
      : `patch off highest known ${highest.source} ${highest.label}; ` +
        `calendar ${fmt(calendar)} would not advance`
  const tagNote = gitAvailable
    ? `${tagVersions.length} usable tag(s)`
    : 'git tags unavailable (not a git repo?)'

  if (DRY_RUN) {
    console.log(`Version would bump: ${currentVersion} -> ${nextVersion} [${why}; ${tagNote}]`)
    return
  }

  pkg.version = nextVersion
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    const updatedLock = updateLockVersion(lock, nextVersion)
    fs.writeFileSync(lockPath, JSON.stringify(updatedLock, null, 2) + '\n')
  }

  console.log(`Version bumped: ${currentVersion} -> ${nextVersion} [${why}; ${tagNote}]`)
}

main()
